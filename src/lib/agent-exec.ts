/**
 * agent-exec.ts — runs bridge and swap from the NAN Agent chat (no page navigation).
 *
 * Mirrors the three signing paths used by BridgePage / SwapPage:
 *   - wagmi   : browser wallet, App Kit via EIP-1193 adapter
 *   - passkey : Circle Modular Wallet (MSCA), App Kit via passkey adapter
 *   - ucw     : Circle user-controlled wallet (email/Google), server challenge + PIN popup
 *
 * Every function throws an Error with a human-readable message on failure, so the
 * agent never reports a transaction that did not happen.
 */

import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import type { EIP1193Provider } from 'viem'
import { getPasskeyAdapter } from '../components/CirclePasskeyLogin'
import { useAppStore } from '../store/appStore'
import { ensureCircleCreds, getChallengeTransactionId, SESSION_EXPIRED_MSG } from './circle-session'

const ARC_CHAIN_ID = 5042002
const ARC_KIT_NAME = 'Arc_Testnet'
const ARC_TX_URL = 'https://testnet.arcscan.app/tx/'

/** Browser-wallet environment captured from wagmi hooks in the chat component. */
export interface WagmiEnv {
  address?: string
  chainId?: number
  connector?: { getProvider: () => Promise<unknown> }
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>
}

export type Notify = (message: string) => void

type SignerKind = 'wagmi' | 'passkey' | 'ucw'

function signerKind(env: WagmiEnv): SignerKind {
  const auth = useAppStore.getState().auth
  if (env.address) return 'wagmi'              // same precedence as BridgePage / SwapPage
  if (auth?.isPasskeyUser) return 'passkey'
  if (auth?.userToken) return 'ucw'
  throw new Error('No wallet available. Sign in with email or passkey, or connect a browser wallet.')
}

// ── Chains (labels and kit names match BridgePage CHAINS) ─────────────────────
const DEST_CHAINS: Array<{ label: string; kitName: string; aliases: string[] }> = [
  { label: 'Ethereum Sepolia',    kitName: 'Ethereum_Sepolia',     aliases: ['ethereum', 'eth', 'sepolia'] },
  { label: 'Base Sepolia',        kitName: 'Base_Sepolia',         aliases: ['base'] },
  { label: 'Arbitrum Sepolia',    kitName: 'Arbitrum_Sepolia',     aliases: ['arbitrum', 'arb'] },
  { label: 'OP Sepolia',          kitName: 'Optimism_Sepolia',     aliases: ['op', 'optimism'] },
  { label: 'Polygon Amoy',        kitName: 'Polygon_Amoy_Testnet', aliases: ['polygon', 'amoy', 'pol'] },
  { label: 'Avalanche Fuji',      kitName: 'Avalanche_Fuji',       aliases: ['avalanche', 'fuji', 'avax'] },
  { label: 'Unichain Sepolia',    kitName: 'Unichain_Sepolia',     aliases: ['unichain'] },
  { label: 'Sei Testnet',         kitName: 'Sei_Testnet',          aliases: ['sei'] },
  { label: 'World Chain Sepolia', kitName: 'World_Chain_Sepolia',  aliases: ['world'] },
]

export function resolveBridgeDestination(input: string): { label: string; kitName: string } {
  const q = input.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/\blinea\b/.test(q)) throw new Error('Bridging to Linea Sepolia is not supported yet.')
  if (/\barc\b/.test(q)) throw new Error('You are already on Arc Testnet. Pick a different destination chain.')
  const exact = DEST_CHAINS.find(c => c.label.toLowerCase() === q)
  if (exact) return exact
  // Specific chain names win over the generic "sepolia" alias (which means Ethereum Sepolia)
  const words = q.split(' ')
  const specific = DEST_CHAINS.find(c => c.aliases.filter(a => a !== 'sepolia').some(a => words.includes(a)))
  if (specific) return specific
  if (words.includes('sepolia')) return DEST_CHAINS[0]
  throw new Error(`I don't recognise "${input}" as a supported destination. Try Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, Unichain Sepolia, Sei Testnet or World Chain Sepolia.`)
}

function requireAmount(amount: string): number {
  const n = parseFloat(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${amount}" is not a valid amount.`)
  return n
}

// ── Shared Circle PIN popup ───────────────────────────────────────────────────
async function executeCircleChallenge(challengeId: string, userToken: string, _encryptionKey?: string): Promise<string> {
  const appId = (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? ''
  if (!appId) throw new Error('VITE_CIRCLE_APP_ID is not set.')
  // The session key is memory/sessionStorage only; ensureCircleCreds restores it with the login
  // refreshToken when possible. Without a key Circle's popup fails with a cryptic
  // "encryptedUserSecret, storageKey, and pinCodeUserShare must be provided".
  const creds = await ensureCircleCreds()
  if (!creds.encryptionKey) throw new Error(SESSION_EXPIRED_MSG)
  const sdk = new W3SSdk({ appSettings: { appId } })
  sdk.setAuthentication({ userToken: creds.userToken ?? userToken, encryptionKey: creds.encryptionKey })
  return new Promise<string>((resolve, reject) => {
    sdk.execute(challengeId, (err, result) => {
      if (err) { reject(new Error(err instanceof Error ? err.message : 'PIN approval failed')); return }
      const r = result as { data?: { transactionHash?: string; transactionId?: string } }
      const direct = r?.data?.transactionHash ?? r?.data?.transactionId
      if (direct) { resolve(direct); return }
      // Result carried no id — Circle exposes it as challenge.correlationIds[0]
      void getChallengeTransactionId(creds.userToken ?? userToken, challengeId)
        .then(c => resolve(c.transactionId ?? ''))
        .catch(() => resolve(''))
    })
  })
}

async function postWallet<T>(body: Record<string, unknown>): Promise<T> {
  const resp = await fetch('/api/wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json() as T & { error?: string }
  if (!resp.ok || data.error) throw new Error(data.error ?? `Request failed (HTTP ${resp.status})`)
  return data
}

async function getWagmiAdapter(env: WagmiEnv) {
  if (!env.connector) throw new Error('Wallet not connected.')
  if (env.chainId !== ARC_CHAIN_ID) {
    if (!env.switchChainAsync) throw new Error('Please switch your wallet to Arc Testnet and try again.')
    try { await env.switchChainAsync({ chainId: ARC_CHAIN_ID }) }
    catch { throw new Error('Please switch your wallet to Arc Testnet and try again.') }
  }
  const provider = (await env.connector.getProvider()) as EIP1193Provider
  return createViemAdapterFromProvider({ provider })
}

async function getAppKitAdapter(kind: SignerKind, env: WagmiEnv) {
  if (kind === 'passkey') {
    const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
    if (!clientKey) throw new Error('Modular Wallets not configured (VITE_CLIENT_KEY missing).')
    return getPasskeyAdapter({ clientKey })
  }
  return getWagmiAdapter(env)
}

// ── Bridge ────────────────────────────────────────────────────────────────────
interface BridgeStep { name: string; state: string; txHash?: string; explorerUrl?: string; error?: string; message?: string; reason?: string }
interface BridgeResult { steps?: BridgeStep[]; state?: string }

export async function runAgentBridge(
  params: { amount: string; toChain: string },
  env: WagmiEnv,
  notify: Notify,
): Promise<string> {
  const gross = requireAmount(params.amount)
  const dest = resolveBridgeDestination(params.toChain)
  const kind = signerKind(env)
  const store = useAppStore.getState()
  const record = (txHash?: string) => store.addActivity({
    type: 'bridge', description: `Bridge to ${dest.label}`, amount: gross, sign: '-',
    status: 'confirmed', counterparty: dest.label, txHash: txHash || undefined,
  })

  // Email / Google (Circle user-controlled wallet): server creates challenge, user approves PIN
  if (kind === 'ucw') {
    const auth = store.auth
    if (!auth?.userToken) throw new Error('Session expired — please log in again.')
    let walletId = auth.circleWalletId
    let walletAddress = auth.circleWalletAddress
    if (!walletId || !walletAddress) {
      try {
        const wr = await fetch('/api/wallet', { headers: { 'x-user-token': auth.userToken } })
        const wd = await wr.json() as { wallets?: { id: string; address: string }[] }
        walletId = wd.wallets?.[0]?.id
        walletAddress = wd.wallets?.[0]?.address
      } catch { /* fall through to the clear error below */ }
    }
    if (!walletId || !walletAddress) throw new Error('Could not load your Circle wallet — please log out and log in again.')

    notify(`Preparing the bridge of ${params.amount} USDC to ${dest.label}…`)
    const start = await postWallet<{ challengeId?: string }>({
      action: 'ucw-bridge-start', userToken: auth.userToken, walletAddress, walletId,
      destChain: dest.kitName, amount: params.amount,
    })
    if (!start.challengeId) throw new Error('Bridge could not be started.')

    notify('Approve the bridge in the Circle PIN window that just opened.')
    const txId = await executeCircleChallenge(start.challengeId, auth.userToken, auth.encryptionKey)

    let finalHash = txId
    if (txId) {
      notify('Approved. Waiting for the transfer to confirm on-chain…')
      const confirm = await postWallet<{ txHash?: string }>({ action: 'ucw-bridge-confirm', userToken: auth.userToken, transactionId: txId })
      finalHash = confirm.txHash ?? txId
    }
    record(finalHash)
    return `Bridged ${params.amount} USDC from Arc Testnet to ${dest.label}.${finalHash ? ` [View transaction](${ARC_TX_URL}${finalHash})` : ''}`
  }

  // Passkey and browser wallet: App Kit signs client-side
  const appKit = new AppKit()
  notify(kind === 'passkey'
    ? `Bridging ${params.amount} USDC to ${dest.label}. Approve with your passkey when prompted…`
    : `Bridging ${params.amount} USDC to ${dest.label}. Confirm in your wallet when prompted…`)
  const adapter = await getAppKitAdapter(kind, env)
  const recipient = kind === 'wagmi' ? env.address : store.auth?.circleWalletAddress
  if (!recipient) throw new Error('Could not determine your wallet address.')
  type Chain = Parameters<InstanceType<typeof AppKit>['bridge']>[0]['from']['chain']
  const result = await appKit.bridge({
    from: { adapter, chain: ARC_KIT_NAME as Chain },
    to: { chain: dest.kitName as Chain, recipientAddress: recipient, useForwarder: true },
    amount: params.amount,
  }) as BridgeResult

  const steps = result.steps ?? []
  const failed = steps.find(s => s.state === 'error')
  const nonMintOk = steps.filter(s => s.name !== 'mint').every(s => s.state === 'success')
  if (!(result.state === 'success' || result.state === 'pending' || nonMintOk) || failed) {
    const detail = failed ? String(failed.error ?? failed.message ?? failed.reason ?? `${failed.name} step failed`) : `Bridge ended in state "${String(result.state ?? 'unknown')}".`
    throw new Error(detail.slice(0, 300))
  }
  const burn = steps.find(s => s.name === 'burn')
  const mint = steps.find(s => s.name === 'mint')
  record(mint?.txHash ?? burn?.txHash)
  const link = burn?.explorerUrl ?? (burn?.txHash ? `${ARC_TX_URL}${burn.txHash}` : '')
  const pending = result.state === 'pending' ? ' It is still finishing on the destination chain and should arrive shortly.' : ''
  return `Bridged ${params.amount} USDC from Arc Testnet to ${dest.label}.${pending}${link ? ` [View transaction](${link})` : ''}`
}

// ── Swap ──────────────────────────────────────────────────────────────────────
const SWAP_TOKENS = ['USDC', 'EURC', 'cirBTC']
const SLIPPAGE_BPS = 300 // 3%, per Circle App Kit docs (same default as the Swap page)

function normalizeSwapToken(t: string): string {
  const found = SWAP_TOKENS.find(x => x.toLowerCase() === t.trim().toLowerCase())
  if (!found) throw new Error(`${t.toUpperCase()} can't be swapped on Arc Testnet. Supported tokens: USDC, EURC and cirBTC.`)
  return found
}

function friendlySwapError(e: unknown, tokenIn: string, tokenOut: string, amount: string): Error {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.toLowerCase()
  if (m.includes('no route') || m.includes('route or resource not found') || m.includes('no swap route'))
    return new Error(`No swap route is available for ${tokenIn} → ${tokenOut} on Arc Testnet right now. Testnet liquidity is occasionally unavailable — please try again in a few seconds.`)
  if (m.includes('insufficient')) return new Error(`Insufficient balance to swap ${amount} ${tokenIn}.`)
  if (m.includes('slippage')) return new Error('The price moved too much. Please try again.')
  return new Error(msg)
}

export async function runAgentSwap(
  params: { fromToken: string; toToken: string; amount: string },
  env: WagmiEnv,
  notify: Notify,
): Promise<string> {
  const gross = requireAmount(params.amount)
  const tokenIn = normalizeSwapToken(params.fromToken)
  const tokenOut = normalizeSwapToken(params.toToken)
  if (tokenIn === tokenOut) throw new Error('Pick two different tokens to swap.')
  const kind = signerKind(env)
  const store = useAppStore.getState()
  const record = (txHash?: string) => store.addActivity({
    type: 'swap', description: `Swap ${tokenIn} → ${tokenOut}`, amount: gross, sign: '-',
    status: 'confirmed', counterparty: tokenOut, txHash: txHash || undefined,
  })
  const done = (outAmount: string | undefined, hash: string, url?: string) =>
    `Swapped ${params.amount} ${tokenIn} to ${outAmount ? `about ${outAmount} ` : ''}${tokenOut}.${hash ? ` [View transaction](${url || ARC_TX_URL + hash})` : ''}`

  try {
    // Email / Google (Circle user-controlled wallet)
    if (kind === 'ucw') {
      const auth = store.auth
      const walletAddress = auth?.circleWalletAddress
      if (!auth?.userToken || !auth.circleWalletId || !walletAddress) throw new Error('Session expired — please log in again.')
      const base = { userToken: auth.userToken, walletAddress, walletId: auth.circleWalletId, tokenIn, tokenOut, slippageBps: SLIPPAGE_BPS }

      notify(`Getting a quote for ${params.amount} ${tokenIn} → ${tokenOut}…`)
      const est = await postWallet<{ estimate?: { estimatedOutput?: { amount?: string } } }>({ action: 'ucw-swap-estimate', ...base, amountIn: params.amount })
      const outAmount = est.estimate?.estimatedOutput?.amount

      const start = await postWallet<{ challengeId?: string }>({ action: 'ucw-swap-start', ...base, amountIn: params.amount })
      if (!start.challengeId) throw new Error('Could not start the swap.')
      notify(`Quote: about ${outAmount ?? '—'} ${tokenOut}. Approve the swap in the Circle PIN window.`)
      const txId = await executeCircleChallenge(start.challengeId, auth.userToken, auth.encryptionKey)

      let hash = txId
      let url: string | undefined
      if (txId) {
        const confirm = await postWallet<{ result?: { txHash?: string; explorerUrl?: string } }>({ action: 'ucw-swap-confirm', userToken: auth.userToken, transactionId: txId })
        hash = confirm.result?.txHash ?? txId
        url = confirm.result?.explorerUrl
      }
      record(hash)
      return done(outAmount, hash, url)
    }

    // Passkey and browser wallet: App Kit
    const appKit = new AppKit()
    const adapter = await getAppKitAdapter(kind, env)
    notify(`Getting a quote for ${params.amount} ${tokenIn} → ${tokenOut}…`)
    const estimate = await appKit.estimateSwap({
      from: { adapter, chain: ARC_KIT_NAME },
      tokenIn, tokenOut, amountIn: params.amount,
      config: { slippageBps: SLIPPAGE_BPS },
    })
    const outAmount = estimate.estimatedOutput?.amount
    notify(`Quote: about ${outAmount ?? '—'} ${tokenOut}. ${kind === 'passkey' ? 'Approve with your passkey' : 'Confirm in your wallet'}…`)
    const result = await appKit.swap({
      from: { adapter, chain: ARC_KIT_NAME },
      tokenIn, tokenOut, amountIn: params.amount,
      config: { slippageBps: SLIPPAGE_BPS },
    })
    const hash = (result as { txHash?: string }).txHash ?? ''
    const url = (result as { explorerUrl?: string }).explorerUrl
    record(hash)
    return done(outAmount, hash, url)
  } catch (e) {
    console.error('[agent swap] failed', e)
    throw friendlySwapError(e, tokenIn, tokenOut, params.amount)
  }
}
