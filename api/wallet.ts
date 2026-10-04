/**
 * /api/wallet — consolidated wallet handler
 * Replaces the four api/wallet/* files to stay under Vercel Hobby's 12-function limit.
 *
 * Routes (all POST unless noted):
 *   action=device-token        POST  create device token for social login
 *   action=initialize          POST  create user PIN + wallets
 *   action=request-otp         POST  create device token for email login (returns otpToken)
 *   action=list         (GET)        list wallets for a user token
 *   action=swap                POST  server-side swap via Circle developer-controlled wallets adapter
 *   action=estimate-swap       POST  server-side swap estimate (no funds moved)
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
  // Creates a Circle transfer challenge. Frontend calls sdk.execute(challengeId).
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
  // Creates a contract execution challenge. Frontend calls sdk.execute(challengeId).
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
  // Polls a Circle transaction until terminal state or timeout.
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

  // ── estimate-swap ─────────────────────────────────────────────────────────
  // Returns an estimate without moving any funds. Requires dev-controlled creds.
  if (action === 'estimate-swap') {
    const { walletAddress, tokenIn, tokenOut, amountIn, slippageBps } = body
    if (!walletAddress || !tokenIn || !tokenOut || !amountIn)
      return res.status(400).json({ error: 'walletAddress, tokenIn, tokenOut, amountIn required' })

    // Accept CIRCLE_API_KEY as well as the more specific CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    // so that a single Vercel env var covers both UCW and dev-controlled wallet operations.
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

  // ── swap ──────────────────────────────────────────────────────────────────
  // Executes a swap server-side via Circle developer-controlled wallets adapter.
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

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
