/**
 * api/wallet.ts — NAN wallet handler (user-controlled wallets)
 *
 * All Circle operations use user-controlled wallets (UCW) — the user retains
 * custody via 2-of-2 MPC. Developer-controlled wallets are never used here.
 *
 * Login paths supported:
 *   - Email OTP  → createDeviceTokenForEmailLogin → W3S OTP popup
 *   - Google     → createDeviceTokenForSocialLogin → W3S social popup
 *   - Wagmi      → no server needed (browser wallet signs directly)
 *   - Passkey    → no server needed (Circle Modular Wallets, client-side)
 *
 * Actions (all POST unless noted):
 *   device-token       POST  get device token for social (Google) login
 *   request-otp        POST  get device token + OTP token for email login
 *   initialize         POST  create user PIN + wallets (first-time setup)
 *   list               GET   list wallets for a userToken
 *   create-transfer    POST  create a USDC transfer challenge (returns challengeId)
 *   create-contract-exec POST create a contract execution challenge
 *   poll-tx            POST  poll a transaction until terminal state
 *   list-balances      POST  get token balances for a wallet
 *   ucw-swap-estimate  POST  get a swap quote for a UCW user (no signing)
 *   ucw-swap-start     POST  start a UCW swap — returns challengeId for W3S PIN approval
 *   ucw-swap-confirm   POST  confirm UCW swap after PIN — polls until terminal
 *   ucw-bridge-start   POST  start a UCW CCTP V2 bridge — returns challengeId
 *   ucw-bridge-confirm POST  confirm UCW bridge after PIN — polls until terminal
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'
import { AppKit } from '@circle-fin/app-kit'

// ── helpers ──────────────────────────────────────────────────────────────────

function apiKey(): string | undefined {
  return (
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  )
}

function ucwClient() {
  const key = apiKey()
  if (!key) throw new Error('CIRCLE_API_KEY not configured')
  return initiateUserControlledWalletsClient({ apiKey: key })
}

function err(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message })
}

const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])

async function pollTransaction(userToken: string, transactionId: string, timeoutMs = 120_000) {
  const client = ucwClient()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    const resp = await client.getTransaction({ userToken, id: transactionId })
    const tx = resp.data?.transaction
    if (!tx) continue
    if (TERMINAL_STATES.has(tx.state ?? '')) return tx
  }
  return null
}

// ── main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── GET /api/wallet?action=list ──────────────────────────────────────────
  if (req.method === 'GET') {
    const userToken = req.headers['x-user-token'] as string
    if (!userToken) return err(res, 401, 'x-user-token header required')
    try {
      const client = ucwClient()
      const response = await client.listWallets({ userToken })
      const wallets = response.data?.wallets ?? []

      // Write a session record to Redis so community endpoints (suggestions,
      // feedback, support) can resolve this user from their sessionToken.
      try {
        const { getRedis } = await import('./_redis')
        const kv = getRedis()
        if (kv && wallets.length > 0) {
          const wallet = wallets[0]
          // Use wallet address as the identity key — resolveSession in community.ts
          // accepts 0x addresses as valid email-equivalent identities.
          const email = wallet.address ?? ''
          await kv.set(`session:${userToken}`, {
            email,
            walletAddress: wallet.address ?? '',
            walletId: wallet.id ?? '',
            createdAt: Date.now(),
          }, { ex: 60 * 60 * 24 * 7 }) // 7 days
        }
      } catch { /* Redis not configured — skip session write */ }

      return res.json({ wallets })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  if (req.method !== 'POST') return err(res, 405, 'Method not allowed')

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── device-token — social (Google) login ──────────────────────────────────
  if (action === 'device-token') {
    const { deviceId } = body
    if (!deviceId) return err(res, 400, 'deviceId required')
    try {
      const client = ucwClient()
      const response = await client.createDeviceTokenForSocialLogin({ deviceId })
      const { deviceToken, deviceEncryptionKey } = response.data ?? {}
      return res.json({ deviceToken, deviceEncryptionKey })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── request-otp — email login ─────────────────────────────────────────────
  if (action === 'request-otp') {
    const { deviceId, email } = body
    if (!deviceId || !email) return err(res, 400, 'deviceId and email required')
    try {
      const client = ucwClient()
      const response = await client.createDeviceTokenForEmailLogin({ deviceId, email })
      const { deviceToken, deviceEncryptionKey, otpToken } = response.data ?? {}
      return res.json({ deviceToken, deviceEncryptionKey, otpToken })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── initialize — first-time PIN + wallet creation ──────────────────────────
  if (action === 'initialize') {
    const { userToken } = body
    if (!userToken) return err(res, 400, 'userToken required')
    try {
      const client = ucwClient()
      const response = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      return res.json({ challengeId: response.data?.challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      // 155106 = user already initialized
      if (code === 155106) return res.json({ code: 155106, message: 'User already initialized' })
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── create-transfer — USDC send challenge ─────────────────────────────────
  if (action === 'create-transfer') {
    const { userToken, walletId, destinationAddress, amount, tokenAddress, blockchain } = body
    if (!userToken || !walletId || !destinationAddress || !amount)
      return err(res, 400, 'userToken, walletId, destinationAddress, amount required')
    try {
      const client = ucwClient()
      const response = await client.createTransaction({
        userToken,
        walletId,
        destinationAddress,
        amounts: [amount],
        blockchain: (blockchain ?? 'ARC-TESTNET') as Parameters<typeof client.createTransaction>[0]['blockchain'],
        tokenAddress: tokenAddress ?? '',
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      return res.json({ challengeId: response.data?.challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155104) return res.status(401).json({ error: 'Circle session expired — please log in again', code: 155104 })
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── create-contract-exec — smart contract execution challenge ─────────────
  if (action === 'create-contract-exec') {
    const { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, callData, amount } = body
    if (!userToken || !walletId || !contractAddress)
      return err(res, 400, 'userToken, walletId, contractAddress required')
    try {
      const client = ucwClient()
      const params: Record<string, unknown> = {
        userToken,
        walletId,
        contractAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      }
      if (callData) {
        params.callData = callData
      } else {
        params.abiFunctionSignature = abiFunctionSignature
        params.abiParameters = abiParameters ? JSON.parse(abiParameters) : []
      }
      if (amount) params.amount = amount
      const response = await client.createUserTransactionContractExecutionChallenge(
        params as Parameters<typeof client.createUserTransactionContractExecutionChallenge>[0]
      )
      return res.json({ challengeId: response.data?.challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155104) return res.status(401).json({ error: 'Circle session expired — please log in again', code: 155104 })
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── poll-tx — get transaction state ───────────────────────────────────────
  if (action === 'poll-tx') {
    const { userToken, transactionId } = body
    if (!userToken || !transactionId)
      return err(res, 400, 'userToken and transactionId required')
    try {
      const client = ucwClient()
      const response = await client.getTransaction({ userToken, id: transactionId })
      return res.json({ transaction: response.data?.transaction })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── list-balances — token balances for a wallet ───────────────────────────
  if (action === 'list-balances') {
    const { userToken, walletId } = body
    if (!userToken || !walletId) return err(res, 400, 'userToken and walletId required')
    try {
      const client = ucwClient()
      const response = await client.getWalletTokenBalance({ walletId, userToken })
      return res.json({ tokenBalances: response.data?.tokenBalances ?? [] })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Circle API error')
    }
  }

  // ── ucw-swap-estimate — get a swap quote (no signing) ────────────────────
  // Uses Circle App Kit + UCW adapter read-only path.
  if (action === 'ucw-swap-estimate') {
    const { userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!userToken || !walletAddress || !walletId || !tokenIn || !tokenOut || !amountIn)
      return err(res, 400, 'userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn required')

    const key = apiKey()
    if (!key) return err(res, 503, 'CIRCLE_API_KEY not configured')

    try {
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()
      const adapter = await createCircleUserWalletAdapter({
        apiKey: key,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc_Testnet',
        accountType: 'SCA',
      })
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn, tokenOut, amountIn,
        // SCA wallets (UCW) must use 'approve' — USDC permit uses ecrecover which rejects SCA signatures
        config: { slippageBps: slippageBps ? Number(slippageBps) : 300, allowanceStrategy: 'approve' },
      })
      return res.json({ estimate })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Swap estimate failed')
    }
  }

  // ── ucw-swap-start — begin a UCW swap, return challengeId ────────────────
  // The App Kit calls onChallenge with the challengeId the user must approve
  // via the W3S SDK PIN popup in the browser. We race the swap start against
  // the challenge arriving (fast), then return the challengeId.
  if (action === 'ucw-swap-start') {
    const { userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!userToken || !walletAddress || !walletId || !tokenIn || !tokenOut || !amountIn)
      return err(res, 400, 'userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn required')

    const key = apiKey()
    if (!key) return err(res, 503, 'CIRCLE_API_KEY not configured')

    try {
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()

      let resolveChallenge!: (id: string) => void
      const challengePromise = new Promise<string>(resolve => { resolveChallenge = resolve })

      const adapter = await createCircleUserWalletAdapter({
        apiKey: key,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc_Testnet',
        accountType: 'SCA',
        onChallenge: ({ challengeId }: { challengeId: string }) => { resolveChallenge(challengeId) },
      })

      // Fire swap (will pause at onChallenge)
      void kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn, tokenOut, amountIn,
        // SCA wallets (UCW) must use 'approve' — USDC permit uses ecrecover which rejects SCA signatures
        config: { slippageBps: slippageBps ? Number(slippageBps) : 300, allowanceStrategy: 'approve' },
      }).catch(() => { /* handled by ucw-swap-confirm */ })

      // Wait up to 30s for the challenge to be issued
      const challengeId = await Promise.race([
        challengePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for swap challenge')), 30_000)
        ),
      ])

      return res.json({ challengeId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Swap start failed')
    }
  }

  // ── ucw-swap-confirm — poll swap transaction after PIN approval ───────────
  if (action === 'ucw-swap-confirm') {
    const { userToken, transactionId } = body
    if (!userToken || !transactionId)
      return err(res, 400, 'userToken and transactionId required')
    try {
      const tx = await pollTransaction(userToken, transactionId)
      if (!tx) return err(res, 408, 'Swap timed out — check explorer for status')
      if (tx.state === 'COMPLETE')
        return res.json({ result: { txHash: tx.txHash, explorerUrl: `https://explorer.testnet.arc.io/tx/${tx.txHash}` } })
      return err(res, 400, `Swap ${tx.state ?? 'failed'}: ${tx.errorReason ?? ''}`)
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Swap confirm failed')
    }
  }

  // ── ucw-bridge-start — begin a UCW CCTP V2 bridge, return challengeId ────
  if (action === 'ucw-bridge-start') {
    const { userToken, walletAddress, walletId, destChain, amount } = body
    if (!userToken || !walletAddress || !walletId || !destChain || !amount)
      return err(res, 400, 'userToken, walletAddress, walletId, destChain, amount required')

    const key = apiKey()
    if (!key) return err(res, 503, 'CIRCLE_API_KEY not configured')

    try {
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()

      let resolveChallenge!: (id: string) => void
      const challengePromise = new Promise<string>(resolve => { resolveChallenge = resolve })

      const adapter = await createCircleUserWalletAdapter({
        apiKey: key,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc_Testnet',
        accountType: 'SCA',
        onChallenge: ({ challengeId }: { challengeId: string }) => { resolveChallenge(challengeId) },
      })

      // Fire bridge (will pause at onChallenge)
      void kit.bridge({
        from: { adapter, chain: 'Arc_Testnet' as const },
        to: {
          chain: destChain as Parameters<InstanceType<typeof AppKit>['bridge']>[0]['to']['chain'],
          recipientAddress: walletAddress,
          useForwarder: true,
        },
        amount,
      }).catch(() => { /* handled by ucw-bridge-confirm */ })

      const challengeId = await Promise.race([
        challengePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for bridge challenge')), 30_000)
        ),
      ])

      return res.json({ challengeId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Bridge start failed')
    }
  }

  // ── ucw-bridge-confirm — poll bridge transaction after PIN approval ────────
  if (action === 'ucw-bridge-confirm') {
    const { userToken, transactionId } = body
    if (!userToken || !transactionId)
      return err(res, 400, 'userToken and transactionId required')
    try {
      const tx = await pollTransaction(userToken, transactionId)
      if (!tx) return err(res, 408, 'Bridge timed out — check explorer for status')
      if (tx.state === 'COMPLETE')
        return res.json({ success: true, txHash: tx.txHash, explorerUrl: `https://explorer.testnet.arc.io/tx/${tx.txHash}` })
      return err(res, 400, `Bridge ${tx.state ?? 'failed'}: ${tx.errorReason ?? ''}`)
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Bridge confirm failed')
    }
  }

  // ── get-challenge — fetch transactionId from a completed challenge ───────────
  // After sdk.execute() succeeds for CREATE_TRANSACTION, the SDK result has no
  // transactionId. Call this to retrieve it via getUserChallenge so we can poll.
  if (action === 'get-challenge') {
    const { userToken, challengeId } = body
    if (!userToken || !challengeId) return err(res, 400, 'userToken and challengeId required')
    try {
      const client = ucwClient()
      const response = await client.getUserChallenge({ userToken, challengeId })
      const challenge = response.data?.challenge
      return res.json({ challenge })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Get challenge failed')
    }
  }

  // ── sign-message — EIP-191 / EIP-712 signing challenge ──────────────────────
  // Creates a Circle sign-message challenge on behalf of the user.
  // The client executes the returned challengeId via sdk.execute().
  if (action === 'sign-message') {
    const { userToken, walletId, message } = body
    if (!userToken || !walletId || !message) return err(res, 400, 'userToken, walletId, message required')
    try {
      const client = ucwClient()
      const response = await client.signMessage({ userToken, walletId, message })
      const challengeId = response.data?.challengeId
      if (!challengeId) return err(res, 500, 'Circle did not return a challengeId for sign-message')
      return res.json({ challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155104) return res.status(401).json({ error: 'Circle session expired — please log in again', code: 155104 })
      return err(res, 500, e instanceof Error ? e.message : 'Sign message failed')
    }
  }

  // ── refresh-session — silently refresh an expired userToken ─────────────────
  // Circle UCW userTokens expire (~12h). The client can call this with the old
  // userToken to get a fresh one without requiring the user to log in again.
  // Uses client.refreshUserToken() which takes the current (possibly expired)
  // userToken and returns a new one valid for another session window.
  if (action === 'refresh-session') {
    const { userToken } = body
    if (!userToken) return err(res, 400, 'userToken required')
    try {
      const client = ucwClient()
      const response = await client.refreshUserToken({ userToken })
      const { userToken: newToken, encryptionKey } = response.data ?? {}
      if (!newToken) return err(res, 500, 'Circle returned no userToken on refresh')
      return res.json({ userToken: newToken, encryptionKey })
    } catch (e) {
      // If refresh fails (token too old / revoked), return 401 so the client
      // can force a full re-login instead of retrying indefinitely.
      const status = (e as { response?: { status?: number } })?.response?.status ?? 500
      const msg = e instanceof Error ? e.message : 'Token refresh failed'
      return res.status(status === 401 || status === 403 ? 401 : 500).json({ error: msg })
    }
  }

  // ── ucw-gateway-mint — relay gatewayMint on dest chain for UCW/email users ──
  // UCW wallets only exist on Arc Testnet and cannot execute on other chains.
  // gatewayMint is permissionless — a server-side relayer submits it.
  // Requires GATEWAY_RELAYER_PRIVATE_KEY in Vercel env vars.
  // The relayer wallet must hold native gas on each supported destination chain.
  if (action === 'ucw-gateway-mint') {
    const { attestation, mintSignature, destChainId: destChainIdStr } = body
    if (!attestation || !mintSignature || !destChainIdStr)
      return err(res, 400, 'attestation, mintSignature, destChainId required')

    const relayerKey = process.env.GATEWAY_RELAYER_PRIVATE_KEY
    if (!relayerKey)
      return err(res, 503, 'GATEWAY_RELAYER_PRIVATE_KEY not configured — add it to Vercel environment variables')

    const destChainId = Number(destChainIdStr)

    // RPC proxy chain key map (SCP blockchain → proxy chain key)
    const SCP_TO_PROXY: Record<string, string> = {
      'ETH-SEPOLIA':  'Ethereum_Sepolia',
      'BASE-SEPOLIA': 'Base_Sepolia',
      'ARB-SEPOLIA':  'Arbitrum_Sepolia',
      'AVAX-FUJI':    'Avax_Fuji',
      'MATIC-AMOY':   'Polygon_Amoy',
      'OP-SEPOLIA':   'Op_Sepolia',
      'UNI-SEPOLIA':  'Unichain_Sepolia',
    }

    try {
      // Import onchain facts to get chain RPC and GatewayMinter address
      const { ONCHAIN_CHAINS, EVM_PROTOCOL_CONTRACTS } = await import('../src/onchain-facts.js')
      const chainFact = ONCHAIN_CHAINS.find(c => c.chainId === destChainId)
      if (!chainFact) return err(res, 400, `Chain ${destChainId} not in onchain-facts`)

      const minterFact = EVM_PROTOCOL_CONTRACTS.find(c => c.name === 'GatewayMinter' && c.networkKind === 'testnet')
      if (!minterFact) return err(res, 500, 'GatewayMinter testnet address not found in onchain-facts')

      // Build RPC URL: prefer proxy, fall back to onchain-facts rpcUrls[0]
      const proxyBase   = process.env.RPC_PROXY_BASE_URL
      const proxyToken  = process.env.RPC_PROXY_TOKEN
      const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map(s => s.trim())
      const proxyKey    = chainFact.scpBlockchain ? SCP_TO_PROXY[chainFact.scpBlockchain] : undefined
      const rpcUrl = proxyBase && proxyToken && proxyKey && proxyChains.includes(proxyKey)
        ? `${proxyBase}/api/rpc/${proxyKey}?_rpc_token=${proxyToken}`
        : (chainFact.rpcUrls[0] ?? '')
      if (!rpcUrl) return err(res, 500, `No RPC URL available for chain ${destChainId}`)

      const { createWalletClient, createPublicClient, http, encodeFunctionData } = await import('viem')
      const { privateKeyToAccount } = await import('viem/accounts')

      const GATEWAY_MINTER_ABI = [
        { type: 'function', name: 'gatewayMint', inputs: [{ name: 'attestationPayload', type: 'bytes' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
      ] as const

      const pk = relayerKey.startsWith('0x') ? relayerKey : `0x${relayerKey}`
      const account   = privateKeyToAccount(pk as `0x${string}`)
      const transport = http(rpcUrl)
      const chain = {
        id: destChainId,
        name: chainFact.name,
        nativeCurrency: { name: chainFact.nativeCurrency.symbol, symbol: chainFact.nativeCurrency.symbol, decimals: chainFact.nativeCurrency.decimals },
        rpcUrls: { default: { http: [rpcUrl] } },
      } as import('viem').Chain
      const walletClient = createWalletClient({ account, chain, transport })
      const publicClient = createPublicClient({ chain, transport })

      const callData = encodeFunctionData({
        abi: GATEWAY_MINTER_ABI,
        functionName: 'gatewayMint',
        args: [attestation as `0x${string}`, mintSignature as `0x${string}`],
      })
      const txHash = await walletClient.sendTransaction({ to: minterFact.address as `0x${string}`, data: callData })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })
      if (receipt.status === 'reverted') return err(res, 400, `gatewayMint reverted on chain ${destChainId}`)
      return res.json({ txHash })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'gatewayMint relay failed')
    }
  }

  return err(res, 400, `Unknown action: ${action ?? '(none)'}`)
}
