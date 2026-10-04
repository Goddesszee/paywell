/**
 * /api/wallet — consolidated wallet handler
 *
 * Routes (all POST unless noted):
 *   action=device-token          POST  create device token for social login
 *   action=initialize            POST  create user PIN + wallets
 *   action=request-otp           POST  create device token for email login (returns otpToken)
 *   action=list           (GET)        list wallets for a user token
 *   action=create-transfer       POST  create a transfer challenge (UCW)
 *   action=create-contract-exec  POST  create a contract-exec challenge (UCW)
 *   action=poll-tx               POST  poll transaction state
 *   action=list-balances         POST  list token balances for a wallet
 *   action=estimate-swap         POST  get a swap estimate (dev-controlled wallets, AppKit)
 *   action=swap                  POST  execute swap (dev-controlled wallets, AppKit)
 *   action=ucw-swap-estimate     POST  get a swap estimate for UCW users (no signing needed)
 *   action=ucw-swap-start        POST  start UCW swap — returns challengeId for W3S PIN approval
 *   action=ucw-swap-confirm      POST  confirm UCW swap after PIN approval — returns result
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'

function apiKey() {
  return (
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const key = apiKey()
  if (!key) return res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })
  const client = initiateUserControlledWalletsClient({ apiKey: key })

  // ── GET /api/wallet?action=list ──────────────────────────────────────────
  if (req.method === 'GET') {
    const userToken = req.headers['x-user-token'] as string
    if (!userToken) return res.status(401).json({ error: 'x-user-token header required' })
    try {
      const response = await client.listWallets({ userToken })
      return res.json({ wallets: response.data?.wallets ?? [] })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── device-token ─────────────────────────────────────────────────────────
  if (action === 'device-token') {
    const { deviceId } = body
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' })
    try {
      const response = await client.createDeviceTokenForSocialLogin({ deviceId })
      const { deviceToken, deviceEncryptionKey } = response.data ?? {}
      return res.json({ deviceToken, deviceEncryptionKey })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── initialize ────────────────────────────────────────────────────────────
  if (action === 'initialize') {
    const { userToken } = body
    if (!userToken) return res.status(400).json({ error: 'userToken required' })
    try {
      const response = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      return res.json({ challengeId: response.data?.challengeId })
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155106) return res.json({ code: 155106, message: 'User already initialized' })
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── request-otp ───────────────────────────────────────────────────────────
  if (action === 'request-otp') {
    const { deviceId, email } = body
    if (!deviceId || !email) return res.status(400).json({ error: 'deviceId and email required' })
    try {
      const response = await client.createDeviceTokenForEmailLogin({ deviceId, email })
      const { deviceToken, deviceEncryptionKey, otpToken } = response.data ?? {}
      return res.json({ deviceToken, deviceEncryptionKey, otpToken })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── create-transfer ───────────────────────────────────────────────────────
  if (action === 'create-transfer') {
    const { userToken, walletId, destinationAddress, amount, tokenAddress, blockchain } = body
    if (!userToken || !walletId || !destinationAddress || !amount)
      return res.status(400).json({ error: 'userToken, walletId, destinationAddress, amount required' })
    try {
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
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── create-contract-exec ──────────────────────────────────────────────────
  if (action === 'create-contract-exec') {
    const { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, callData, amount } = body
    if (!userToken || !walletId || !contractAddress)
      return res.status(400).json({ error: 'userToken, walletId, contractAddress required' })
    try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.createContractExecutionTransaction as any)(params)
      return res.json({ challengeId: response.data?.challengeId })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── poll-tx ───────────────────────────────────────────────────────────────
  if (action === 'poll-tx') {
    const { userToken, transactionId } = body
    if (!userToken || !transactionId)
      return res.status(400).json({ error: 'userToken and transactionId required' })
    try {
      const response = await client.getTransaction({ userToken, id: transactionId })
      return res.json({ transaction: response.data?.transaction })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── list-balances ─────────────────────────────────────────────────────────
  if (action === 'list-balances') {
    const { userToken, walletId } = body
    if (!userToken || !walletId) return res.status(400).json({ error: 'userToken and walletId required' })
    try {
      const response = await client.getWalletTokenBalance({ walletId, userToken })
      return res.json({ tokenBalances: response.data?.tokenBalances ?? [] })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Circle API error' })
    }
  }

  // ── estimate-swap (developer-controlled wallets) ──────────────────────────
  // Uses AppKit + createCircleWalletsAdapter — requires dev-controlled wallet.
  if (action === 'estimate-swap') {
    const { walletAddress, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!walletAddress || !tokenIn || !tokenOut || !amountIn)
      return res.status(400).json({ error: 'walletAddress, tokenIn, tokenOut, amountIn required' })

    const devKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET
    if (!devKey || !entitySecret)
      return res.status(503).json({ error: 'Circle developer-controlled wallet credentials not configured on this server.' })

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const kit = new AppKit()
      const adapter = createCircleWalletsAdapter({ apiKey: devKey, entitySecret })
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: 'Arc_Testnet', address: walletAddress },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps: slippageBps ? Number(slippageBps) : 100 },
      })
      return res.json({ estimate })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Estimation failed' })
    }
  }

  // ── swap (developer-controlled wallets) ───────────────────────────────────
  // Uses AppKit + createCircleWalletsAdapter — requires dev-controlled wallet.
  if (action === 'swap') {
    const { walletAddress, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!walletAddress || !tokenIn || !tokenOut || !amountIn)
      return res.status(400).json({ error: 'walletAddress, tokenIn, tokenOut, amountIn required' })

    const devKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET
    if (!devKey || !entitySecret)
      return res.status(503).json({ error: 'Circle developer-controlled wallet credentials not configured on this server.' })

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const kit = new AppKit()
      const adapter = createCircleWalletsAdapter({ apiKey: devKey, entitySecret })
      const result = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet', address: walletAddress },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps: slippageBps ? Number(slippageBps) : 100 },
      })
      return res.json({ result })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Swap failed' })
    }
  }

  // ── ucw-swap-estimate ─────────────────────────────────────────────────────
  // Swap estimate for user-controlled wallet users via AppKit + UCW adapter.
  // No signing needed for estimation — uses createCircleUserWalletAdapter read-only.
  if (action === 'ucw-swap-estimate') {
    const { userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!userToken || !walletAddress || !walletId || !tokenIn || !tokenOut || !amountIn)
      return res.status(400).json({ error: 'userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn required' })

    const ucwKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    if (!ucwKey) return res.status(503).json({ error: 'CIRCLE_API_KEY not configured.' })

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()
      // For estimation only — no onChallenge needed, no transaction is submitted
      const adapter = await createCircleUserWalletAdapter({
        apiKey: ucwKey,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc_Testnet',
        accountType: 'SCA',
      })
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: 'Arc_Testnet', address: walletAddress },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps: slippageBps ? Number(slippageBps) : 100 },
      })
      return res.json({ estimate })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Estimation failed' })
    }
  }

  // ── ucw-swap-start ────────────────────────────────────────────────────────
  // Starts a swap for a UCW user. The adapter calls onChallenge with a challengeId
  // that the user must approve via the W3S SDK PIN popup in the browser.
  // Returns { challengeId } immediately — frontend executes it via W3S SDK,
  // then calls ucw-swap-confirm with the transactionId from the challenge result.
  if (action === 'ucw-swap-start') {
    const { userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!userToken || !walletAddress || !walletId || !tokenIn || !tokenOut || !amountIn)
      return res.status(400).json({ error: 'userToken, walletAddress, walletId, tokenIn, tokenOut, amountIn required' })

    const ucwKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    if (!ucwKey) return res.status(503).json({ error: 'CIRCLE_API_KEY not configured.' })

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()

      let resolveChallenge!: (challengeId: string) => void
      const challengePromise = new Promise<string>(resolve => { resolveChallenge = resolve })

      const adapter = await createCircleUserWalletAdapter({
        apiKey: ucwKey,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc_Testnet',
        accountType: 'SCA',
        onChallenge: ({ challengeId }: { challengeId: string }) => {
          resolveChallenge(challengeId)
        },
      })

      // Start swap — it will pause at onChallenge and wait for the browser
      // We race the swap start against the challenge arriving (should be fast)
      const swapPromise = kit.swap({
        from: { adapter, chain: 'Arc_Testnet', address: walletAddress },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps: slippageBps ? Number(slippageBps) : 100 },
      })

      // Wait up to 30s for the challenge to be issued
      const challengeId = await Promise.race([
        challengePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for swap challenge')), 30000)),
      ])

      // Store the pending swap promise result in a way the confirm endpoint can retrieve it.
      // Since Vercel functions are stateless, we return the challengeId and let the frontend
      // handle the W3S approval. After approval, the frontend calls ucw-swap-confirm which
      // just polls the transaction via the UCW client until terminal state.
      void swapPromise.catch(() => { /* handled in confirm */ })

      return res.json({ challengeId })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Swap start failed' })
    }
  }

  // ── ucw-swap-confirm ──────────────────────────────────────────────────────
  // After the user approves the W3S challenge, the W3S SDK returns a transactionId.
  // Poll it until terminal state and return the result.
  if (action === 'ucw-swap-confirm') {
    const { userToken, transactionId } = body
    if (!userToken || !transactionId)
      return res.status(400).json({ error: 'userToken and transactionId required' })

    const POLL_INTERVAL = 2000
    const TIMEOUT = 120_000
    const deadline = Date.now() + TIMEOUT
    const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])

    try {
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL))
        const resp = await client.getTransaction({ userToken, id: transactionId })
        const tx = resp.data?.transaction
        if (!tx) continue
        if (TERMINAL.has(tx.state ?? '')) {
          if (tx.state === 'COMPLETE') {
            return res.json({ result: { txHash: tx.txHash, explorerUrl: `https://explorer.testnet.arc.io/tx/${tx.txHash}` } })
          }
          return res.status(400).json({ error: `Swap ${tx.state ?? 'failed'}: ${tx.errorReason ?? ''}` })
        }
      }
      return res.status(408).json({ error: 'Swap timed out — check explorer for status' })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Swap confirm failed' })
    }
  }

  // ── bridge (developer-controlled wallets) ─────────────────────────────────
  // Uses AppKit + createCircleWalletsAdapter — requires dev-controlled wallet.
  if (action === 'bridge') {
    const { walletAddress, fromChain, toChain, toAddress, amount } = body
    if (!walletAddress || !fromChain || !toChain || !amount)
      return res.status(400).json({ error: 'walletAddress, fromChain, toChain, amount required' })

    const devKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET
    if (!devKey || !entitySecret)
      return res.status(503).json({ error: 'Circle developer-controlled wallet credentials not configured on this server.' })

    try {
      const { AppKit } = await import('@circle-fin/app-kit')
      const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
      const kit = new AppKit()
      const adapter = createCircleWalletsAdapter({ apiKey: devKey, entitySecret })
      const result = await kit.bridge({
        from: { adapter, chain: fromChain, address: walletAddress },
        to:   { adapter, chain: toChain, address: toAddress ?? walletAddress },
        amount,
      })
      return res.json({ result })
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Bridge failed' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
