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
import { circleKeyInfo, requireCircleKey } from './_circle-key.js'
import { AppKit } from '@circle-fin/app-kit'

// ── helpers ──────────────────────────────────────────────────────────────────

function apiKey(): string | undefined {
  return circleKeyInfo()?.key
}

/** App Kit swap needs a Circle API key in its config on mainnet. KIT_KEY (legacy kit key) wins if set, else the LIVE Circle API key. */
function swapApiKey(fallback: string): string {
  return (process.env.KIT_KEY ?? process.env.CIRCLE_KIT_KEY ?? '').trim().replace(/^["']|["']$/g, '') || fallback
}

/** Opt-in platform fee: only charged when FEE_WALLET (or VITE_FEE_WALLET) is a valid address. */
function feeWallet(): string | null {
  const raw = (process.env.FEE_WALLET ?? process.env.VITE_FEE_WALLET ?? '').trim().replace(/^["']|["']$/g, '').trim()
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : null
}
function swapFeeCfg() {
  const to = feeWallet()
  const bps = Number(process.env.FEE_SWAP_BPS ?? process.env.VITE_FEE_SWAP_BPS ?? 30)
  return to && bps > 0 ? { customFee: { percentageBps: bps, recipientAddress: to } } : {}
}
function bridgeFeeCfg(amount: string) {
  const to = feeWallet()
  const a = parseFloat(amount)
  if (!to || !(a > 0)) return {}
  const bps = Number(process.env.FEE_BRIDGE_BPS ?? process.env.VITE_FEE_BRIDGE_BPS ?? 50)
  if (!(bps > 0)) return {}
  // Same minimum as the on-screen fee summary (src/lib/fees.ts) so the UI matches what is charged.
  const minFee = Number(process.env.FEE_BRIDGE_MIN_USDC ?? process.env.VITE_FEE_BRIDGE_MIN_USDC ?? 0.10)
  const feeValue = Math.max(a * bps / 10000, minFee).toFixed(6)
  return { customFee: { value: feeValue, recipientAddress: to } }
}

function ucwClient() {
  const key = requireCircleKey()
  return initiateUserControlledWalletsClient({ apiKey: key })
}

function err(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message })
}

const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])

async function pollTransaction(userToken: string, transactionId: string, timeoutMs = 45_000) {
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

async function handleWallet(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── GET /api/wallet?action=health — non-secret setup check (open in a browser) ──
  if (req.method === 'GET' && req.query.action === 'health') {
    const info = circleKeyInfo()
    return res.json({
      circleApiKey: info ? { env: info.env, type: info.kind } : 'missing',
      mainnetReady: info?.kind === 'live',
      hint: !info ? 'Set CIRCLE_API_KEY to a LIVE_API_KEY:… key'
        : info.kind === 'test' ? 'This is a TEST key. Arc mainnet needs a LIVE_API_KEY:… key in CIRCLE_API_KEY'
        : 'Server key looks correct for mainnet',
    })
  }

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
        const { getRedis } = await import('./_redis.js')
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
        blockchains: [Blockchain.Arc],
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
        blockchain: (blockchain ?? 'ARC') as Parameters<typeof client.createTransaction>[0]['blockchain'],
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
    const { userToken, walletId, walletAddress, blockchain, contractAddress, abiFunctionSignature, abiParameters, callData, amount } = body
    if (!userToken || (!walletId && !walletAddress) || !contractAddress)
      return err(res, 400, 'userToken, (walletId or walletAddress+blockchain), contractAddress required')
    try {
      const client = ucwClient()
      // blockchain + walletAddress are mutually exclusive with walletId (Circle SDK rule).
      // When a destination blockchain is specified (cross-chain execution), use walletAddress+blockchain.
      // Otherwise fall back to walletId (same-chain execution on the wallet's home chain).
      const params: Record<string, unknown> = {
        userToken,
        contractAddress,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      }
      if (blockchain && walletAddress) {
        params.walletAddress = walletAddress
        params.blockchain = blockchain
      } else {
        params.walletId = walletId
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
        chain: 'Arc',
        accountType: 'SCA',
      })
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: 'Arc' },
        tokenIn, tokenOut, amountIn,
        // SCA wallets (UCW) must use 'approve' — USDC permit uses ecrecover which rejects SCA signatures
        config: { slippageBps: slippageBps ? Number(slippageBps) : 300, allowanceStrategy: 'approve', apiKey: swapApiKey(key), ...swapFeeCfg() },
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
      let rejectChallenge!: (e: Error) => void
      const challengePromise = new Promise<string>((resolve, reject) => { resolveChallenge = resolve; rejectChallenge = reject })
      challengePromise.catch(() => { /* surfaced via Promise.race below */ })

      const adapter = await createCircleUserWalletAdapter({
        apiKey: key,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: 'Arc',
        accountType: 'SCA',
        onChallenge: ({ challengeId }: { challengeId: string }) => { resolveChallenge(challengeId) },
      })

      // Fire swap (will pause at onChallenge)
      void kit.swap({
        from: { adapter, chain: 'Arc' },
        tokenIn, tokenOut, amountIn,
        // SCA wallets (UCW) must use 'approve' — USDC permit uses ecrecover which rejects SCA signatures
        config: { slippageBps: slippageBps ? Number(slippageBps) : 300, allowanceStrategy: 'approve', apiKey: swapApiKey(key), ...swapFeeCfg() },
      }).catch((e: unknown) => {
        // The swap failed before any PIN challenge was issued — report the real reason.
        console.error('[ucw-swap-start] kit.swap failed:', e)
        rejectChallenge(e instanceof Error ? e : new Error(String(e)))
      })

      // Wait for the challenge; must stay under the function's maxDuration (60s) so we reply with JSON.
      const challengeId = await Promise.race([
        challengePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out waiting for the swap approval request. Please try again.')), 40_000)
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
      if (!tx) return res.status(202).json({ pending: true })
      if (tx.state === 'COMPLETE')
        return res.json({ result: { txHash: tx.txHash, explorerUrl: `https://explorer.arc.io/tx/${tx.txHash}` } })
      return err(res, 400, `Swap ${tx.state ?? 'failed'}: ${tx.errorReason ?? ''}`)
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Swap confirm failed')
    }
  }

  // ── ucw-bridge-start — begin a UCW CCTP V2 bridge, return challengeId ────
  if (action === 'ucw-bridge-start') {
    const { userToken, walletAddress, walletId, fromChain, destChain, amount } = body
    if (!userToken || !walletAddress || !walletId || !destChain || !amount)
      return err(res, 400, 'userToken, walletAddress, walletId, destChain, amount required')

    // Normalise chain names — accept both kitName and label
    const CHAIN_MAP: Record<string, string> = {
      'Arc': 'Arc', 'Ethereum': 'Ethereum', 'Base': 'Base', 'Arbitrum': 'Arbitrum',
      'Optimism': 'Optimism', 'Polygon': 'Polygon', 'Avalanche': 'Avalanche',
      'Unichain': 'Unichain', 'Linea': 'Linea', 'Sei': 'Sei', 'World_Chain': 'World_Chain',
      'Arbitrum One': 'Arbitrum', 'OP Mainnet': 'Optimism',
    }
    const srcChain  = (fromChain ? (CHAIN_MAP[String(fromChain)] ?? 'Arc') : 'Arc') as Parameters<InstanceType<typeof AppKit>['bridge']>[0]['from']['chain']
    const dstChain  = (CHAIN_MAP[String(destChain)] ?? String(destChain)) as Parameters<InstanceType<typeof AppKit>['bridge']>[0]['to']['chain']

    const key = apiKey()
    if (!key) return err(res, 503, 'CIRCLE_API_KEY not configured')

    try {
      const { createCircleUserWalletAdapter } = await import('@circle-fin/adapter-circle-wallets/ucw/server')
      const kit = new AppKit()

      let resolveChallenge!: (id: string) => void
      let rejectChallenge!: (e: Error) => void
      const challengePromise = new Promise<string>((resolve, reject) => { resolveChallenge = resolve; rejectChallenge = reject })
      challengePromise.catch(() => { /* surfaced via Promise.race below */ })

      const adapter = await createCircleUserWalletAdapter({
        apiKey: key,
        userToken,
        walletId,
        walletAddress: walletAddress as `0x${string}`,
        chain: srcChain,
        accountType: 'SCA',
        onChallenge: ({ challengeId }: { challengeId: string }) => { resolveChallenge(challengeId) },
      })

      // Fire bridge — same adapter for both from and to per Circle docs
      // useForwarder:false so SDK issues a TRANSACTION challenge instead of signTypedData
      void kit.bridge({
        from: { adapter, chain: srcChain },
        to:   { adapter, chain: dstChain },
        amount,
        config: { ...bridgeFeeCfg(String(amount)) },
      }).catch((e: unknown) => {
        rejectChallenge(e instanceof Error ? e : new Error(String(e)))
      })

      // Must stay under the function's maxDuration (vercel.json) so we answer with JSON, not a platform timeout page.
      const challengeId = await Promise.race([
        challengePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timed out waiting for the bridge approval request. Please try again.')), 40_000)
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
      if (!tx) return res.status(202).json({ pending: true })
      if (tx.state === 'COMPLETE')
        return res.json({ success: true, txHash: tx.txHash, explorerUrl: `https://explorer.arc.io/tx/${tx.txHash}` })
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
      // Circle challenges have no `transactionId` field: for CREATE_TRANSACTION the transaction
      // id is in `correlationIds[0]`. Normalise it so clients don't have to know.
      const transactionId = (challenge as { transactionId?: string } | undefined)?.transactionId
        ?? challenge?.correlationIds?.[0]
      return res.json({ challenge, transactionId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Get challenge failed')
    }
  }

  // ── sign-typed-data — EIP-712 typed data signing challenge ──────────────────
  // Creates a Circle sign-typed-data challenge. Required for Gateway BurnIntent
  // signing from UCW wallets (signMessage only does eth_sign, not eth_signTypedData).
  // The client executes the returned challengeId via sdk.execute() and reads
  // result.signature from the callback.
  if (action === 'sign-typed-data') {
    const { userToken, walletId, data } = body
    if (!userToken || !walletId || !data) return err(res, 400, 'userToken, walletId, data required')
    try {
      const client = ucwClient()
      const response = await client.signTypedData({ userToken, walletId, data })
      const challengeId = response.data?.challengeId
      if (!challengeId) return err(res, 500, 'Circle did not return a challengeId for sign-typed-data')
      return res.json({ challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155104) return res.status(401).json({ error: 'Circle session expired — please log in again', code: 155104 })
      return err(res, 500, e instanceof Error ? e.message : 'Sign typed data failed')
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

  // ── refresh-session — restore an expired/lost session (email & social login) ─
  // Circle: POST /users/token/refresh needs the live userToken (X-User-Token) plus the
  // refreshToken from login and the SDK deviceId it is bound to. The response carries a fresh
  // userToken, a fresh encryptionKey and a ROTATED refreshToken — the client must store all three.
  if (action === 'refresh-session') {
    const { userToken, refreshToken, deviceId } = body
    if (!userToken || !refreshToken || !deviceId) return err(res, 400, 'userToken, refreshToken and deviceId required')
    try {
      const client = ucwClient()
      const response = await client.refreshUserToken({ userToken, refreshToken, deviceId })
      const data = response.data as { userToken?: string; encryptionKey?: string; refreshToken?: string } | undefined
      if (!data?.userToken) return err(res, 500, 'Circle returned no userToken on refresh')
      return res.json({ userToken: data.userToken, encryptionKey: data.encryptionKey, refreshToken: data.refreshToken })
    } catch (e) {
      // Token too old / revoked: 401 tells the client to force a full re-login.
      const status = (e as { response?: { status?: number } })?.response?.status ?? 500
      const msg = e instanceof Error ? e.message : 'Token refresh failed'
      return res.status(status === 401 || status === 403 ? 401 : 500).json({ error: msg })
    }
  }

  return err(res, 400, `Unknown action: ${action ?? '(none)'}`)
}

// Always answer with JSON, even on an unexpected crash, so the client never sees a plain-text error page.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await handleWallet(req, res)
  } catch (e) {
    console.error('[api/wallet] unhandled', e)
    if (!res.headersSent) return res.status(500).json({ error: e instanceof Error ? e.message : 'Wallet service error' })
  }
}
