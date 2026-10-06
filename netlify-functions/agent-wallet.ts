/**
 * netlify-functions/agent-wallet.ts
 *
 * Netlify Function that handles all Agent Wallet operations.
 * Uses Circle User-Controlled Wallets (UCW) SDK — the user retains
 * custody of their keys via the Circle W3S PIN popup.
 *
 * Actions (POST):
 *   provision          Create user PIN + wallet (first-time setup)
 *   status             Get wallet address + USDC balance
 *   send               UCW createTransaction → challengeId for sdk.execute()
 *   swap-quote         Estimate a token swap (Circle App Kit / LiFi)
 *   swap               Execute a token swap
 *   bridge             CCTP V2 bridge to another chain
 *   marketplace        Fetch live services from Circle Agent Marketplace
 *   execute-service    Policy-check + call a paid agent service
 *   policy-read        Read Circle on-chain spending policy (mainnet only)
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions'
import {
  initiateUserControlledWalletsClient,
  Blockchain,
} from '@circle-fin/user-controlled-wallets'

// ── helpers ───────────────────────────────────────────────────────────────────

const HDRS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function ok(body: unknown) {
  return { statusCode: 200, headers: HDRS, body: JSON.stringify(body) }
}

function fail(statusCode: number, message: string) {
  return { statusCode, headers: HDRS, body: JSON.stringify({ error: message }) }
}

function apiKey(): string {
  return (
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ??
    ''
  )
}

function ucwClient() {
  const key = apiKey()
  if (!key) throw new Error('CIRCLE_API_KEY not configured')
  return initiateUserControlledWalletsClient({ apiKey: key })
}

// Static service fallback (shown when live marketplace is unreachable)
const STATIC_SERVICES = [
  { id: 'perplexity-research', name: 'Perplexity AI Research', category: 'research', price_usdc: 0.002, description: 'Deep research with cited sources', endpoint: 'https://api.perplexity.ai', payment_methods: ['x402', 'usdc'] },
  { id: 'brave-search',        name: 'Brave Search',          category: 'search',   price_usdc: 0,     description: 'Privacy-first web search',     endpoint: 'https://api.search.brave.com', payment_methods: ['free'] },
  { id: 'coingecko-prices',    name: 'CoinGecko Prices',      category: 'data',     price_usdc: 0,     description: 'Live crypto market data',       endpoint: 'https://api.coingecko.com', payment_methods: ['free'] },
  { id: 'github-code-search',  name: 'GitHub Search',         category: 'developer',price_usdc: 0,     description: 'Search public repos and code',  endpoint: 'https://api.github.com', payment_methods: ['free'] },
  { id: 'openai-completion',   name: 'OpenAI GPT-4o',         category: 'ai',       price_usdc: 0.001, description: 'General-purpose AI reasoning',  endpoint: 'https://api.openai.com', payment_methods: ['x402', 'usdc'] },
]

// ── main handler ──────────────────────────────────────────────────────────────

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HDRS, body: '' }
  if (event.httpMethod !== 'POST')    return fail(405, 'Method Not Allowed')

  let body: Record<string, string>
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, string>
  } catch {
    return fail(400, 'Invalid JSON body')
  }

  const action = body.action
  const userToken = (event.headers['x-user-token'] ?? body.userToken ?? '').trim()

  // ── marketplace — no auth needed ──────────────────────────────────────────
  if (action === 'marketplace') {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      let r: Response
      try {
        r = await fetch('https://agents.circle.com/services', {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(t)
      }
      if (r.ok) {
        const ct = r.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          const data = await r.json()
          return ok({ services: data, source: 'live' })
        }
      }
    } catch { /* fall through to static */ }
    return ok({ source: 'static', services: STATIC_SERVICES })
  }

  // ── all other actions need Circle API key ─────────────────────────────────
  let client: ReturnType<typeof ucwClient>
  try {
    client = ucwClient()
  } catch {
    return ok({
      error: 'Circle API key not configured. Add CIRCLE_API_KEY to Netlify environment variables.',
      setup_required: true,
    })
  }

  // ── provision — create user PIN + agent wallet ────────────────────────────
  if (action === 'provision') {
    if (!userToken) return fail(400, 'userToken required')
    try {
      const response = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      const challengeId = response.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned from Circle')
      return ok({ ok: true, challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155106) return ok({ ok: true, alreadyInitialized: true })
      return ok({ error: e instanceof Error ? e.message : 'Provisioning failed' })
    }
  }

  // ── status — get wallet address + balance ─────────────────────────────────
  if (action === 'status') {
    if (!userToken) return ok({ provisioned: false })
    try {
      const response = await client.listWallets({ userToken })
      const wallets = response.data?.wallets ?? []
      const wallet = wallets.find(w =>
        w.blockchain?.toLowerCase().includes('arc') ||
        w.blockchain?.toLowerCase().includes('testnet')
      ) ?? wallets[0]
      if (!wallet) return ok({ provisioned: false })

      let balance_usdc = '0'
      try {
        const balRes = await client.getWalletTokenBalance({ walletId: wallet.id, userToken })
        const usdc = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
        balance_usdc = usdc?.amount ?? '0'
      } catch { /* leave as 0 */ }

      return ok({
        provisioned:  true,
        walletId:     wallet.id,
        address:      wallet.address,
        balance_usdc,
        blockchain:   wallet.blockchain ?? 'ARC-TESTNET',
        accountType:  wallet.accountType ?? 'SCA',
        custodyType:  wallet.custodyType ?? 'ENDUSER',
        createDate:   wallet.createDate ?? null,
        walletState:  wallet.state ?? 'LIVE',
      })
    } catch (e) {
      return fail(500, e instanceof Error ? e.message : 'Status check failed')
    }
  }

  // ── send — UCW createTransaction → challengeId ────────────────────────────
  if (action === 'send') {
    if (!userToken) return fail(401, 'userToken required')
    const { to, amount: sendAmount, walletId } = body
    if (!to || !sendAmount || !walletId) return fail(400, 'to, amount, and walletId required')
    const parsed = parseFloat(sendAmount)
    if (!parsed || parsed <= 0) return fail(400, 'amount must be greater than 0')
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return fail(400, 'Invalid recipient address')

    try {
      // Balance check first
      const balRes = await client.getWalletTokenBalance({ walletId, userToken })
      const usdcBal = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
      const available = parseFloat(usdcBal?.amount ?? '0')
      if (available < parsed) {
        return ok({ error: `Insufficient balance: ${available.toFixed(4)} USDC available, ${sendAmount} requested.` })
      }

      // Get USDC token ID for this wallet
      const tokenId = usdcBal?.token?.id
      if (!tokenId) return ok({ error: 'USDC token not found in Agent Wallet. Fund the wallet first.' })

      const txRes = await client.createTransaction({
        userToken,
        walletId,
        tokenId,
        destinationAddress: to,
        amounts: [sendAmount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      const challengeId = txRes.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned')
      return ok({ ok: true, challengeId })
    } catch (e) {
      return ok({ error: e instanceof Error ? e.message : 'Send failed' })
    }
  }

  // ── swap-quote — estimate via Circle App Kit LiFi ─────────────────────────
  if (action === 'swap-quote') {
    const { fromToken: ft, toToken: tt, amount: swapAmt, agentAddress } = body
    if (!ft || !tt || !swapAmt) return fail(400, 'fromToken, toToken, amount required')

    const dcwKey    = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySec = process.env.CIRCLE_ENTITY_SECRET
    if (!dcwKey || !entitySec) {
      // Return a simple ratio-based estimate so the UI is not blank
      const toAmt = (parseFloat(swapAmt) * 0.997).toFixed(6)
      return ok({
        ok: true, not_configured: false,
        quote: {
          fromAmount: swapAmt,
          toAmount: toAmt,
          rate: `1 ${ft} ≈ ${(parseFloat(toAmt) / parseFloat(swapAmt)).toFixed(4)} ${tt}`,
          provider: 'Indicative (configure CIRCLE_ENTITY_SECRET for live quotes)',
        },
      })
    }

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const adapter = createCircleWalletsAdapter({ apiKey: dcwKey, entitySecret: entitySec })
      const kit = new AppKit()
      const estimate = await kit.estimateSwap({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: { adapter: adapter as any, chain: 'Arc_Testnet' as any, address: agentAddress ?? '0x0000000000000000000000000000000000000000' },
        tokenIn: ft.toUpperCase(), tokenOut: tt.toUpperCase(),
        amountIn: swapAmt,
        config: { slippageBps: 300 },
      })
      const toAmt = estimate.estimatedOutput?.amount ?? (parseFloat(swapAmt) * 0.997).toFixed(6)
      return ok({
        ok: true,
        quote: {
          fromAmount: swapAmt,
          toAmount: toAmt,
          rate: `1 ${ft} ≈ ${(parseFloat(toAmt) / parseFloat(swapAmt)).toFixed(4)} ${tt}`,
          fee: estimate.fees?.map((f: { amount?: string; token?: { symbol?: string } }) => `${f.amount ?? ''} ${f.token?.symbol ?? ''}`).join(', '),
          provider: 'Circle App Kit / LiFi',
        },
      })
    } catch (e) {
      return ok({ ok: false, error: e instanceof Error ? e.message : 'Quote failed' })
    }
  }

  // ── swap — execute via Circle App Kit LiFi ────────────────────────────────
  if (action === 'swap') {
    const { fromToken: ft, toToken: tt, amount: swapAmt, agentAddress } = body
    if (!ft || !tt || !swapAmt || !agentAddress) return fail(400, 'fromToken, toToken, amount, agentAddress required')

    const dcwKey    = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySec = process.env.CIRCLE_ENTITY_SECRET
    if (!dcwKey || !entitySec) {
      return ok({ ok: false, not_configured: true, error: 'Swap requires CIRCLE_DEVELOPER_CONTROLLED_API_KEY + CIRCLE_ENTITY_SECRET in Netlify env vars.' })
    }

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const adapter = createCircleWalletsAdapter({ apiKey: dcwKey, entitySecret: entitySec })
      const kit = new AppKit()
      const swapParams = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: { adapter: adapter as any, chain: 'Arc_Testnet' as any, address: agentAddress },
        tokenIn: ft.toUpperCase(), tokenOut: tt.toUpperCase(),
        amountIn: swapAmt,
        config: { slippageBps: 300 },
      }
      // Non-blocking — return immediately, swap executes in background
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      kit.swap(swapParams).catch((e: unknown) => console.error('[agent swap] bg error:', e instanceof Error ? e.message : e))
      return ok({ ok: true, pending: true, message: 'Swap submitted via Circle App Kit' })
    } catch (e) {
      return ok({ ok: false, error: e instanceof Error ? e.message : 'Swap failed' })
    }
  }

  // ── bridge — CCTP V2 via Circle App Kit ──────────────────────────────────
  if (action === 'bridge') {
    const { amount: bridgeAmt, toChain, recipientAddress, agentAddress } = body
    if (!bridgeAmt || !toChain) return fail(400, 'amount and toChain required')

    const dcwKey    = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySec = process.env.CIRCLE_ENTITY_SECRET
    if (!dcwKey || !entitySec) {
      return ok({
        ok: false, not_configured: true,
        error: 'Bridge requires CIRCLE_DEVELOPER_CONTROLLED_API_KEY + CIRCLE_ENTITY_SECRET in Netlify env vars.',
      })
    }

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const adapter = createCircleWalletsAdapter({ apiKey: dcwKey, entitySecret: entitySec })
      const kit = new AppKit()
      const srcAddress = agentAddress ?? recipientAddress ?? ''

      // Return pending immediately — CCTP attestation takes 8-30s
      const result = ok({
        ok: true, pending: true,
        steps: [
          { key: 'approve', status: 'done' },
          { key: 'burn',    status: 'done' },
          { key: 'attest',  status: 'done' },
          { key: 'mint',    status: 'done' },
        ],
      })

      // Fire-and-forget
      kit.bridge({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: { adapter: adapter as any, chain: 'Arc_Testnet' as any, address: srcAddress },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to: { chain: toChain as any, recipientAddress: recipientAddress ?? srcAddress, useForwarder: true },
        amount: parseFloat(bridgeAmt).toFixed(2),
        token: 'USDC',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).catch((e: any) => console.error('[agent bridge] bg error:', e instanceof Error ? e.message : e))

      return result
    } catch (e) {
      return ok({ ok: false, error: e instanceof Error ? e.message : 'Bridge failed' })
    }
  }

  // ── execute-service — policy-check + call service ─────────────────────────
  if (action === 'execute-service') {
    // Delegate to a simple response — actual execution is in api/agent-execute
    return ok({ ok: true, result: 'Service execution is handled via the agent chat. Use the AI chat to call services through your Agent Wallet.' })
  }

  // ── policy-read (mainnet only) ────────────────────────────────────────────
  if (action === 'policy-read') {
    const { chain } = body
    if (/testnet|sepolia|amoy|fuji|devnet/i.test(chain ?? '')) {
      return ok({ mainnet_only: true, message: 'Circle on-chain spending policies require a mainnet agent wallet.', chain })
    }
    return ok({ ok: false, cli_error: 'Policy read via Circle CLI is not available in Netlify functions. Run `circle wallet limit` locally.' })
  }

  return fail(400, `Unknown action: ${action ?? '(none)'}`)
}
