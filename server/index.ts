/**
 * Paywell Backend Server
 * Bun + Express, runs on port 3001
 * Vite dev proxy forwards /api/* here
 */

import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'

// ── Persistence helpers ───────────────────────────────────────────────────────
// Stores are persisted to DATA_DIR as JSON files so they survive Railway restarts.
// On Railway: add a Volume mounted at /data in your service settings.
// Locally: data/ dir is created automatically next to server/.
const DATA_DIR = process.env.DATA_DIR ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data')
try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch { /* already exists */ }

function dataPath(name: string) { return path.join(DATA_DIR, `${name}.json`) }

function loadStore<T>(name: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(dataPath(name), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveStore(name: string, data: unknown) {
  try { fs.writeFileSync(dataPath(name), JSON.stringify(data), 'utf8') } catch { /* disk full / read-only */ }
}

// Debounced save — batches rapid writes into one disk write per 2s
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function debouncedSave(name: string, data: unknown) {
  const existing = saveTimers.get(name)
  if (existing) clearTimeout(existing)
  saveTimers.set(name, setTimeout(() => { saveStore(name, data); saveTimers.delete(name) }, 2000))
}

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: '*', credentials: true }))
app.use(express.json({ limit: '5mb' }))

// ── x402 Circle Gateway Nanopayments ──────────────────────────────────────────
// SELLER_ADDRESS: replace with your real EVM address to receive USDC payments.
// Until then the placeholder keeps the server running without payments enforced
// (gateway.require is skipped when SELLER_ADDRESS is the zero placeholder).
const SELLER_ADDRESS = (process.env.SELLER_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
const x402Enabled = SELLER_ADDRESS !== '0x0000000000000000000000000000000000000000'

let gateway: ReturnType<typeof createGatewayMiddleware> | null = null
if (x402Enabled) {
  gateway = createGatewayMiddleware({ sellerAddress: SELLER_ADDRESS })
  console.log(`  ✓  x402 Gateway Nanopayments enabled (seller: ${SELLER_ADDRESS})`)
} else {
  console.log('  ⚠  x402 disabled — set SELLER_ADDRESS in .env to enable paid endpoints')
}

// Helper: apply gateway.require only when x402 is enabled
function _paywall(price: string): express.RequestHandler {
  if (gateway) return gateway.require(price)
  return (_req, _res, next) => next()
}

// ── Stores (persisted to DATA_DIR, loaded on startup) ─────────────────────────
const otpStore = new Map<string, { otp: string; token: string; expiresAt: number }>()
const otpRateStore = new Map<string, { count: number; windowStart: number }>()
const sessionStore = new Map(
  Object.entries(loadStore<Record<string, { email: string; walletAddress: string; walletId: string; createdAt: number }>>('sessions', {}))
)
const activityStore = new Map<string, Array<{
  id: string; type: string; description: string
  amount: string; sign: string; timestamp: string
  status: string; counterparty?: string; txHash?: string; agentInitiated?: boolean
}>>()

// ── Global transaction ledger ─────────────────────────────────────────────────
interface TxRecord {
  id: string
  walletType: 'main' | 'agent'
  walletAddress: string
  userEmail: string
  type: string
  amount: number
  description: string
  counterparty?: string
  txHash?: string
  chain?: string
  timestamp: string
}
const txLedger: TxRecord[] = loadStore<TxRecord[]>('tx-ledger', [])

// Seed activityStore from persisted txLedger on startup so activity-feed
// returns real history on a fresh browser / new device.
for (const tx of [...txLedger].reverse()) {
  if (!tx.walletAddress || tx.walletAddress === 'unknown') continue
  const list = activityStore.get(tx.walletAddress) ?? []
  list.unshift({
    id: tx.id,
    type: tx.type,
    description: tx.description,
    amount: String(tx.amount),
    sign: (tx.type === 'received' || tx.type === 'bridge') ? '+' : '-',
    status: 'confirmed',
    counterparty: tx.counterparty,
    txHash: tx.txHash,
    timestamp: tx.timestamp,
  })
  activityStore.set(tx.walletAddress, list)
}

// ── helpers ───────────────────────────────────────────────────────────────────

function genToken(len = 32) {
  return crypto.randomBytes(len).toString('hex')
}

function getSession(token?: string) {
  if (!token) return null
  const raw = token.replace(/^Bearer\s+/i, '')
  return sessionStore.get(raw) ?? null
}

function requireSession(req: express.Request, res: express.Response) {
  const token = req.headers.authorization
  const session = getSession(token)
  if (!session) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return null
  }
  return session
}

// ── health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'paywell-api', ts: Date.now() })
})

// ── Download helper ───────────────────────────────────────────────────────────
// POST /api/download  { html: string, filename: string }
// Returns { url: '/api/download/<id>' }  — a real HTTP URL the browser can open
// directly, bypassing blob-URL sandbox restrictions in previews/iframes.
// The content lives in memory for 5 minutes then is auto-cleaned.
const downloadStore = new Map<string, { html: string; filename: string; expiresAt: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of downloadStore) {
    if (entry.expiresAt < now) downloadStore.delete(id)
  }
}, 60_000)

app.post('/api/download', (req, res) => {
  const { html, filename } = req.body as { html?: string; filename?: string }
  if (!html || typeof html !== 'string') {
    res.status(400).json({ error: 'html required' }); return
  }
  const id = crypto.randomBytes(16).toString('hex')
  downloadStore.set(id, {
    html,
    filename: filename || 'download.html',
    expiresAt: Date.now() + 5 * 60_000,
  })
  res.json({ url: `/api/download/${id}` })
})

app.get('/api/download/:id', (req, res) => {
  const entry = downloadStore.get(req.params.id)
  if (!entry || entry.expiresAt < Date.now()) {
    res.status(404).send('Download link expired or not found'); return
  }
  downloadStore.delete(req.params.id) // one-shot
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`)
  res.send(entry.html)
})

// ── OTP auth ─────────────────────────────────────────────────────────────────
app.post('/api/otp', async (req, res) => {
  try {
    const { action, email, otp, token, expiresAt } = req.body as {
      action: string; email: string; otp?: string; token?: string; expiresAt?: number
    }

    if (!email || typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, error: 'valid email required' })
      return
    }

    // Rate limit: max 5 OTP sends per email per hour
    const otpRateKey = `otp-rate:${email.toLowerCase()}`
    const otpRateEntry = otpRateStore.get(otpRateKey) ?? { count: 0, windowStart: Date.now() }
    const windowMs = 60 * 60 * 1000
    if (Date.now() - otpRateEntry.windowStart > windowMs) {
      otpRateEntry.count = 0; otpRateEntry.windowStart = Date.now()
    }
    if (otpRateEntry.count >= 5) {
      res.status(429).json({ success: false, error: 'Too many OTP requests. Try again in an hour.' })
      return
    }

    if (action === 'send') {
      otpRateEntry.count++
      otpRateStore.set(otpRateKey, otpRateEntry)
      // Generate a 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString()
      const otpToken = genToken()
      const exp = Date.now() + 1000 * 60 * 10 // 10 min

      otpStore.set(email, { otp: code, token: otpToken, expiresAt: exp })

      // Try to send via SMTP if configured
      const smtpUser = process.env.SMTP_USER
      if (smtpUser) {
        try {
          await sendOtpEmail(email, code)
        } catch (e) {
          console.error('SMTP failed:', e)
        }
      } else {
        // Dev mode — log to console
        console.log(`\n[PAYWELL OTP] ${email} → ${code}\n`)
      }

      // Only expose the raw OTP in the response body when SMTP is unconfigured
      // AND the server is explicitly in development mode.  Never leak it in
      // production regardless of NODE_ENV (Vercel does not always set NODE_ENV).
      const isDevMode = !smtpUser && process.env.NODE_ENV === 'development'
      res.json({
        success: true,
        token: otpToken,
        expiresAt: exp,
        dev: isDevMode,
        ...(isDevMode && { _devOtp: code }),
      })
      return
    }

    if (action === 'verify') {
      if (!otp || !token) {
        res.status(400).json({ success: false, error: 'otp and token required' })
        return
      }

      const stored = otpStore.get(email)
      if (!stored) {
        res.status(400).json({ success: false, error: 'No OTP found — request a new code' })
        return
      }
      if (stored.token !== token) {
        res.status(400).json({ success: false, error: 'Invalid token' })
        return
      }
      if (Date.now() > (expiresAt ?? stored.expiresAt)) {
        otpStore.delete(email)
        res.status(400).json({ success: false, error: 'OTP expired — request a new code' })
        return
      }
      if (stored.otp !== otp.trim()) {
        res.status(400).json({ success: false, error: 'Incorrect code' })
        return
      }

      otpStore.delete(email)

      // Create or reuse session
      const sessionToken = genToken()
      // Assign a deterministic mock wallet address per email in dev
      const walletAddress = deterministicAddress(email)
      const walletId = `wallet-${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`

      sessionStore.set(sessionToken, {
        email,
        walletAddress,
        walletId,
        createdAt: Date.now(),
      })

      res.json({ success: true, sessionToken })
      return
    }

    res.status(400).json({ success: false, error: 'Unknown action' })
  } catch (e) {
    console.error('/api/otp error:', e)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── Circle wallet — device token for social login ─────────────────────────────
app.post('/api/wallet/device-token', async (req, res) => {
  const { deviceId } = req.body as { deviceId: string }
  if (!deviceId) { res.status(400).json({ error: 'deviceId required' }); return }

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) {
    // dev mock — return placeholder tokens so the UI doesn't hard-error
    res.json({ deviceToken: `mock-dt-${deviceId.slice(0, 8)}`, deviceEncryptionKey: `mock-dk-${deviceId.slice(0, 8)}` })
    return
  }
  try {
    const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
    const client   = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.createDeviceTokenForSocialLogin({ deviceId })
    const { deviceToken, deviceEncryptionKey } = response.data ?? {}
    res.json({ deviceToken, deviceEncryptionKey })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Circle API error' })
  }
})

// ── Circle wallet — request email OTP ─────────────────────────────────────────
app.post('/api/wallet/request-otp', async (req, res) => {
  const { deviceId, email } = req.body as { deviceId: string; email: string }
  if (!deviceId || !email) { res.status(400).json({ error: 'deviceId and email required' }); return }

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })
    return
  }
  try {
    const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
    const client   = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.createDeviceTokenForEmailLogin({ deviceId, email })
    const { deviceToken, deviceEncryptionKey, otpToken } = response.data ?? {}
    res.json({ deviceToken, deviceEncryptionKey, otpToken })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Circle API error' })
  }
})

// ── Circle wallet — initialize user / create wallet challenge ─────────────────
app.post('/api/wallet/initialize', async (req, res) => {
  const { userToken } = req.body as { userToken: string }
  if (!userToken) { res.status(400).json({ error: 'userToken required' }); return }

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })
    return
  }
  try {
    const { initiateUserControlledWalletsClient, Blockchain } = await import('@circle-fin/user-controlled-wallets')
    const client   = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.createUserPinWithWallets({
      userToken,
      blockchains: [Blockchain.ArcTestnet],
      accountType: 'SCA',
    })
    res.json({ challengeId: response.data?.challengeId })
  } catch (e) {
    const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
    if (code === 155106) { res.json({ code: 155106, message: 'User already initialized' }); return }
    res.status(500).json({ error: e instanceof Error ? e.message : 'Circle API error' })
  }
})

// ── Circle wallet — list wallets ───────────────────────────────────────────────
app.get('/api/wallet/wallets', async (req, res) => {
  const userToken = req.headers['x-user-token'] as string | undefined
  if (!userToken) { res.status(401).json({ error: 'x-user-token header required' }); return }

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })
    return
  }
  try {
    const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
    const client   = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.listWallets({ userToken })
    res.json({ wallets: response.data?.wallets ?? [] })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Circle API error' })
  }
})

// ── Circle wallet — action-based handler (used by useCircleTransaction) ──────
// Mirrors api/wallet.ts for the Express dev server.
// Routes: create-transfer, create-contract-exec, poll-tx, list-balances
app.post('/api/wallet', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action

  const ucwApiKey =
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY

  if (!ucwApiKey) {
    // No API key configured — return a clear error so the UI can surface it
    res.status(503).json({ error: 'CIRCLE_API_KEY not configured — wallet operations unavailable in dev without credentials' })
    return
  }

  try {
    const { initiateUserControlledWalletsClient } = await import('@circle-fin/user-controlled-wallets')
    const client = initiateUserControlledWalletsClient({ apiKey: ucwApiKey })

    // create-transfer
    if (action === 'create-transfer') {
      const { userToken, walletId, destinationAddress, amount, tokenAddress, blockchain } = body
      if (!userToken || !walletId || !destinationAddress || !amount) {
        res.status(400).json({ error: 'userToken, walletId, destinationAddress, amount required' }); return
      }
      const response = await client.createTransaction({
        userToken, walletId, destinationAddress, amounts: [amount],
        blockchain: (blockchain ?? 'ARC-TESTNET') as Parameters<typeof client.createTransaction>[0]['blockchain'],
        tokenAddress: tokenAddress ?? '',
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      res.json({ challengeId: response.data?.challengeId }); return
    }

    // create-contract-exec
    if (action === 'create-contract-exec') {
      const { userToken, walletId, contractAddress, abiFunctionSignature, abiParameters, callData, amount } = body
      if (!userToken || !walletId || !contractAddress) {
        res.status(400).json({ error: 'userToken, walletId, contractAddress required' }); return
      }
      const params: Record<string, unknown> = {
        userToken, walletId, contractAddress,
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
      res.json({ challengeId: response.data?.challengeId }); return
    }

    // poll-tx
    if (action === 'poll-tx') {
      const { userToken, transactionId } = body
      if (!userToken || !transactionId) {
        res.status(400).json({ error: 'userToken and transactionId required' }); return
      }
      const response = await client.getTransaction({ userToken, id: transactionId })
      res.json({ transaction: response.data?.transaction }); return
    }

    // list-balances
    if (action === 'list-balances') {
      const { userToken, walletId } = body
      if (!userToken || !walletId) {
        res.status(400).json({ error: 'userToken and walletId required' }); return
      }
      const response = await client.getWalletTokenBalance({ walletId, userToken })
      res.json({ tokenBalances: response.data?.tokenBalances ?? [] }); return
    }

    // sign-message — creates a sign-message challenge for UCW EIP-712 signing
    if (action === 'sign-message') {
      const { userToken, walletId, message } = body
      if (!userToken || !walletId || !message) {
        res.status(400).json({ error: 'userToken, walletId, message required' }); return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).createSignMessageChallenge?.({ userToken, walletId, message })
        // Fallback: some SDK versions expose it under signMessage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? await (client as any).signMessage?.({ userToken, walletId, message })
      const challengeId = response?.data?.challengeId
      if (!challengeId) {
        res.status(500).json({ error: 'Circle SDK did not return a challengeId for sign-message' }); return
      }
      res.json({ challengeId }); return
    }

    res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
  } catch (e) {
    console.error('/api/wallet error:', e)
    res.status(500).json({ error: e instanceof Error ? e.message : 'Circle API error' })
  }
})

// ── Circle wallets ─────────────────────────────────────────────────────────────
app.post('/api/circle-wallets', async (req, res) => {
  try {
    const session = requireSession(req, res)
    if (!session) return

    const { action, to, amount, tokenSymbol } = req.body as {
      action: string; to?: string; amount?: string; tokenSymbol?: string
    }

    const circleKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET

    if (action === 'getWallet') {
      if (circleKey && entitySecret) {
        // Real Circle path
        try {
          const result = await circleGetWallet(session.walletId, circleKey, entitySecret)
          res.json({ success: true, ...result })
          return
        } catch (e) {
          console.error('Circle getWallet failed, using mock:', e)
        }
      }
      // Mock wallet response
      res.json({
        success: true,
        wallet: { id: session.walletId, address: session.walletAddress },
        balances: [
          { symbol: 'USDC', amount: '100.00' },
          { symbol: 'EURC', amount: '0.00' },
        ],
      })
      return
    }

    if (action === 'transfer') {
      if (!to || !amount) {
        res.status(400).json({ success: false, error: 'to and amount required' })
        return
      }

      if (circleKey && entitySecret) {
        try {
          const result = await circleTransfer({
            walletId: session.walletId,
            to, amount,
            tokenSymbol: tokenSymbol ?? 'USDC',
            apiKey: circleKey,
            entitySecret,
          })
          // Log to activity
          addActivityRecord(session.walletAddress, {
            type: 'send',
            description: `Sent ${tokenSymbol ?? 'USDC'} to ${to.slice(0, 6)}...${to.slice(-4)}`,
            amount: `-${amount}`,
            sign: '-',
            status: 'pending',
            counterparty: to,
            txHash: result.txId,
          })
          res.json({ success: true, txId: result.txId })
          return
        } catch (e) {
          console.error('Circle transfer failed:', e)
          res.status(500).json({ success: false, error: String(e) })
          return
        }
      }

      // Mock transfer
      const txId = `mock-tx-${genToken(8)}`
      addActivityRecord(session.walletAddress, {
        type: 'send',
        description: `Sent ${amount} ${tokenSymbol ?? 'USDC'}`,
        amount: `-${amount}`,
        sign: '-',
        status: 'confirmed',
        counterparty: to,
        txHash: txId,
      })
      res.json({ success: true, txId, txHash: txId })
      return
    }

    res.status(400).json({ success: false, error: 'Unknown action' })
  } catch (e) {
    console.error('/api/circle-wallets error:', e)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── Activity feed ──────────────────────────────────────────────────────────────
app.get('/api/activity-feed', (req, res) => {
  try {
    const wallet = req.query.wallet as string
    if (!wallet) {
      res.status(400).json({ success: false, error: 'wallet required' })
      return
    }
    const activities = activityStore.get(wallet) ?? []
    res.json({ success: true, activities })
  } catch {
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── AI chat — x402 nanopayment gate ───────────────────────────────────────────
// When SELLER_ADDRESS is set, each /api/chat request requires a 0.001 USDC
// x402 Gateway Nanopayment from the caller before the AI response is returned.
app.post('/api/chat', _paywall('0.001'), async (req, res) => {
  try {
    const session = requireSession(req, res)
    if (!session) return

    const { message, messages, usdcBal, userAddress } = req.body as {
      message?: string
      messages?: Array<{ role: string; content: string }>
      usdcBal?: string
      userAddress?: string
    }

    const groqKey = process.env.GROQ_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY
    const userMsg = message ?? messages?.[messages.length - 1]?.content ?? ''
    const walletAddr = userAddress ?? session.walletAddress

    // Build spending analytics context from the tx ledger for this wallet
    const walletTxs = txLedger.filter(t => t.walletAddress === walletAddr)
    const now = Date.now()
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const monthTxs = walletTxs.filter(t => new Date(t.timestamp).getTime() >= monthStart.getTime())
    const monthSent = monthTxs.filter(t => t.type === 'sent').reduce((s, t) => s + t.amount, 0)
    const monthReceived = monthTxs.filter(t => t.type === 'received').reduce((s, t) => s + t.amount, 0)
    const recent30 = walletTxs.slice(0, 30).map(t =>
      `${t.type === 'sent' ? '-' : '+'}${t.amount.toFixed(2)} USDC · ${t.description} · ${new Date(t.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`
    )
    const spendingContext = walletTxs.length > 0
      ? `\n\nUSER SPENDING CONTEXT (current month):\n- Sent: ${monthSent.toFixed(2)} USDC\n- Received: ${monthReceived.toFixed(2)} USDC\n- Total transactions: ${walletTxs.length}\nRecent transactions:\n${recent30.slice(0, 10).join('\n')}`
      : ''

    if (openaiKey) {
      try {
        const reply = await openaiChat(openaiKey, userMsg + spendingContext, usdcBal ?? '0', walletAddr)
        res.json({ success: true, reply })
        return
      } catch (e) {
        console.error('OpenAI chat failed:', e)
      }
    }

    if (groqKey) {
      try {
        const reply = await groqChat(groqKey, userMsg + spendingContext, usdcBal ?? '0', walletAddr)
        res.json({ success: true, reply })
        return
      } catch (e) {
        console.error('Groq chat failed:', e)
      }
    }

    // Fallback smart mock — still use spending context for pattern matching
    const reply = mockAgentReply(userMsg, usdcBal ?? '100')
    res.json({ success: true, reply })
  } catch (e) {
    console.error('/api/chat error:', e)
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── Marketplace ────────────────────────────────────────────────────────────────
app.get('/api/marketplace', (_req, res) => {
  res.json({ success: true, products: PRODUCTS })
})

app.post('/api/marketplace/order', (req, res) => {
  try {
    const session = requireSession(req, res)
    if (!session) return

    const { productId, amount } = req.body as { productId: string; amount: number; walletId?: string }
    const product = PRODUCTS.find((p) => p.id === productId)
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' })
      return
    }

    const orderId = `order-${genToken(8)}`
    addActivityRecord(session.walletAddress, {
      type: 'purchase',
      description: `Purchased ${product.name}`,
      amount: `-${amount}`,
      sign: '-',
      status: 'confirmed',
      counterparty: product.merchant,
    })

    res.json({
      success: true,
      id: orderId,
      productId,
      productName: product.name,
      amount,
      merchant: product.merchant,
      status: 'complete',
      createdAt: new Date().toISOString(),
    })
  } catch {
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── helpers (Circle, Groq, email, mock) ───────────────────────────────────────

function deterministicAddress(email: string): string {
  const hash = crypto.createHash('sha256').update(email).digest('hex')
  return '0x' + hash.slice(0, 40)
}

function addActivityRecord(walletAddress: string, record: {
  type: string; description: string; amount: string; sign: string
  status: string; counterparty?: string; txHash?: string; agentInitiated?: boolean
}) {
  const list = activityStore.get(walletAddress) ?? []
  list.unshift({
    id: `srv-${genToken(6)}`,
    timestamp: new Date().toISOString(),
    ...record,
  })
  activityStore.set(walletAddress, list.slice(0, 200))
}

async function circleGetWallet(walletId: string, apiKey: string, _entitySecret: string) {
  const res = await fetch(`https://api.circle.com/v1/w3s/wallets/${walletId}/balances`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  })
  const data = await res.json() as { data?: { tokenBalances?: Array<{ token: { symbol: string }; amount: string }> } }
  const balances = (data.data?.tokenBalances ?? []).map((b) => ({
    symbol: b.token.symbol, amount: b.amount,
  }))
  return { wallet: { id: walletId, address: '' }, balances }
}

async function circleTransfer(opts: {
  walletId: string; to: string; amount: string
  tokenSymbol: string; apiKey: string; entitySecret: string
}) {
  // Uses the official Circle developer-controlled wallets SDK.
  // The SDK requires tokenId (Circle's internal token identifier), NOT tokenAddress.
  // USDC tokenId on Arc Testnet is the canonical Circle ID for testnet USDC.
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets')
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: opts.apiKey,
    entitySecret: opts.entitySecret,
  })

  // Arc Testnet USDC tokenId — obtain at runtime by listing wallet token balances
  // if not known, or hard-code the well-known testnet value.
  // We pass tokenAddress here via the amounts array using the SDK's transfer method.
  const response = await client.createTransaction({
    walletId: opts.walletId,
    tokenId: opts.tokenSymbol === 'USDC'
      ? 'f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a'   // Circle's testnet USDC token ID (Arc Testnet)
      : 'f26e2fc3-3fc5-5b11-8fc8-0a5a9a71ad7a',
    destinationAddress: opts.to,
    amounts: [opts.amount],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    idempotencyKey: genToken(16),
  })

  return { txId: response.data?.id ?? genToken(8) }
}

async function openaiChat(apiKey: string, message: string, usdcBal: string, walletAddress: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are the NAN AI assistant — a helpful financial and shopping agent. The user's wallet address is ${walletAddress} and they have ${usdcBal} USDC available. Help them find products, answer questions about payments, and manage their wallet. Be concise and friendly. Never ask for private keys or seed phrases.`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 300,
    }),
  })
  const data = await res.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not process that.'
}

async function groqChat(apiKey: string, message: string, usdcBal: string, walletAddress: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are the Paywell AI shopping assistant. The user's wallet address is ${walletAddress} and they have ${usdcBal} USDC available. Help them find products, answer questions about payments, and suggest purchases from the Paywell marketplace. Be concise and helpful. Never ask for private keys or seed phrases.`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 300,
    }),
  })
  const data = await res.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not process that.'
}

async function sendOtpEmail(to: string, code: string) {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transporter.sendMail({
    from: `Paywell <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your Paywell verification code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
        <h2 style="color:#3B82F6">Paywell</h2>
        <p>Your verification code is:</p>
        <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#1a1a1a;padding:16px 0">${code}</div>
        <p style="color:#666">Expires in 10 minutes. Do not share this code.</p>
      </div>
    `,
  })
}

function mockAgentReply(message: string, usdcBal: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('balance') || msg.includes('how much')) {
    return `You currently have ${usdcBal} USDC in your Paywell wallet. Would you like to browse products or send a payment?`
  }
  if (msg.includes('buy') || msg.includes('purchase') || msg.includes('shop')) {
    return `I can help you shop! Head to the Shop tab to browse products across tech, home, fashion, food, and digital categories. I can add items to your cart automatically — just tell me what you're looking for.`
  }
  if (msg.includes('send') || msg.includes('transfer') || msg.includes('pay')) {
    return `To send USDC, go to the Wallet tab and tap Send. Enter the recipient address and amount. I can also send payments on your behalf if you enable agent spending in Settings.`
  }
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return `Hi! I'm your Paywell assistant. I can help you shop, send payments, check your balance, and manage your spending. What would you like to do?`
  }
  return `I'm your Paywell shopping assistant. I can help you find products, send USDC payments, and manage your wallet. You have ${usdcBal} USDC available. What would you like to do?`
}

// ── Product catalogue ──────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 'wm-keyboard-01', name: 'Wireless Mechanical Keyboard', price: 24, merchant: 'TechFlow', merchantId: 'techflow', category: 'tech', description: 'Compact 75% layout with hot-swap switches and 3 connectivity modes.', image: '', rating: 4.7, reviewCount: 312, inStock: true, tags: ['keyboard', 'wireless', 'mechanical'] },
  { id: 'noise-headphones-02', name: 'Noise Cancelling Headphones', price: 45, merchant: 'SoundWave', merchantId: 'soundwave', category: 'tech', description: 'Up to 40-hour battery, ANC, foldable design.', image: '', rating: 4.5, reviewCount: 198, inStock: true, tags: ['headphones', 'audio', 'anc'] },
  { id: 'led-desk-lamp-03', name: 'LED Desk Lamp', price: 18, merchant: 'BrightSpace', merchantId: 'brightspace', category: 'home', description: 'Touch-dimmer, 5 colour temps, USB-A charging port.', image: '', rating: 4.6, reviewCount: 445, inStock: true, tags: ['lamp', 'desk', 'led'] },
  { id: 'coffee-blend-04', name: 'Premium Coffee Blend Pack', price: 8, merchant: 'BrewCo', merchantId: 'brewco', category: 'food', description: 'Three single-origin blends, specialty roast, 250g each.', image: '', rating: 4.8, reviewCount: 621, inStock: true, tags: ['coffee', 'specialty', 'food'] },
  { id: 'yoga-mat-05', name: 'Non-Slip Yoga Mat', price: 15, merchant: 'FlexLife', merchantId: 'flexlife', category: 'home', description: '6mm eco-friendly TPE, alignment lines, carry strap.', image: '', rating: 4.4, reviewCount: 287, inStock: true, tags: ['yoga', 'fitness', 'mat'] },
  { id: 'tshirt-06', name: 'Premium Cotton T-Shirt', price: 12, merchant: 'ThreadCo', merchantId: 'threadco', category: 'fashion', description: '100% organic cotton, relaxed fit, 6 colours.', image: '', rating: 4.3, reviewCount: 512, inStock: true, tags: ['tshirt', 'cotton', 'fashion'] },
  { id: 'vpn-07', name: 'VPN — 1 Year Subscription', price: 20, merchant: 'SecureNet', merchantId: 'securenet', category: 'digital', description: 'No-logs policy, 50+ countries, 5 devices.', image: '', rating: 4.6, reviewCount: 892, inStock: true, tags: ['vpn', 'privacy', 'digital'] },
  { id: 'plant-08', name: 'Low-Maintenance Indoor Plant', price: 22, merchant: 'GreenThumb', merchantId: 'greenthumb', category: 'home', description: 'Pothos or snake plant (random), includes ceramic pot.', image: '', rating: 4.7, reviewCount: 163, inStock: true, tags: ['plant', 'home', 'decor'] },
  { id: 'notebook-09', name: 'Dotted Notebook A5', price: 9, merchant: 'WriteMore', merchantId: 'writemore', category: 'home', description: '180 pages, hardcover, lay-flat binding, dotted pages.', image: '', rating: 4.5, reviewCount: 334, inStock: true, tags: ['notebook', 'stationery', 'writing'] },
  { id: 'icon-pack-10', name: 'Designer Icon Pack', price: 6, merchant: 'PixelShop', merchantId: 'pixelshop', category: 'digital', description: '2 400 SVG icons in 3 styles, lifetime licence.', image: '', rating: 4.9, reviewCount: 1204, inStock: true, tags: ['icons', 'design', 'digital'] },
  { id: 'standing-mat-11', name: 'Anti-Fatigue Standing Mat', price: 32, merchant: 'DeskLife', merchantId: 'desklife', category: 'home', description: '3/4" thick PU foam, bevelled edges, easy-clean surface.', image: '', rating: 4.4, reviewCount: 208, inStock: true, tags: ['mat', 'standing desk', 'ergonomic'] },
  { id: 'whey-12', name: 'Whey Protein — Chocolate', price: 28, merchant: 'NutriCore', merchantId: 'nutricore', category: 'food', description: '25g protein per serving, 30 servings, low sugar.', image: '', rating: 4.6, reviewCount: 741, inStock: true, tags: ['protein', 'fitness', 'food'] },
]

// ── Support tickets ────────────────────────────────────────────────────────────

interface SupportMessage {
  id: string
  author: 'customer' | 'admin'
  content: string
  timestamp: string
}

interface SupportTicket {
  id: string
  userEmail: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved'
  messages: SupportMessage[]
  createdAt: string
  updatedAt: string
  hasUnreadAdmin: boolean   // customer has unread admin replies
  hasUnreadCustomer: boolean // admin has unread customer messages
}

const supportStore = new Map<string, SupportTicket>(
  Object.entries(loadStore<Record<string, SupportTicket>>('support-tickets', {}))
)

function getTicketsByEmail(email: string): SupportTicket[] {
  return [...supportStore.values()].filter(t => t.userEmail === email).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

// Resolve caller identity: session email > wallet address header > anonymous
function resolveIdentity(req: express.Request): { email: string; walletAddress: string } {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const session = token ? sessionStore.get(token) : undefined
  if (session) return { email: session.email, walletAddress: session.walletAddress }
  const wallet = (req.headers['x-wallet-address'] as string | undefined ?? req.body?.walletAddress ?? '').toLowerCase()
  const email = wallet ? `wallet:${wallet}` : 'anonymous'
  return { email, walletAddress: wallet }
}

// Create ticket (no auth required — wallet address used as identity fallback)
app.post('/api/support/tickets', (req, res) => {
  const identity = resolveIdentity(req)
  const { subject, message } = req.body as { subject: string; message: string }
  if (!subject || !message) { res.status(400).json({ success: false, error: 'subject and message required' }); return }
  const id = `TKT-${Date.now().toString(36).toUpperCase()}`
  const now = new Date().toISOString()
  const ticket: SupportTicket = {
    id, userEmail: identity.email, subject, status: 'open',
    messages: [{ id: `msg-${Date.now()}`, author: 'customer', content: message, timestamp: now }],
    createdAt: now, updatedAt: now, hasUnreadAdmin: false, hasUnreadCustomer: true,
  }
  supportStore.set(id, ticket)
  debouncedSave('support-tickets', Object.fromEntries(supportStore))
  if (identity.email !== 'anonymous') {
    addNotification(identity.email, {
      type: 'support',
      title: 'Support request received',
      body: `Your request "${subject}" has been submitted. We'll get back to you shortly.`,
      ticketId: id,
    })
  }
  res.json({ success: true, ticket })
})

// Get tickets for current user (session or wallet)
app.get('/api/support/tickets', (req, res) => {
  const identity = resolveIdentity(req)
  res.json({ success: true, tickets: getTicketsByEmail(identity.email) })
})

// Get single ticket
app.get('/api/support/tickets/:id', (req, res) => {
  const identity = resolveIdentity(req)
  const ticket = supportStore.get(req.params.id)
  if (!ticket) { res.status(404).json({ success: false, error: 'Not found' }); return }
  if (ticket.userEmail !== identity.email) { res.status(403).json({ success: false, error: 'Forbidden' }); return }
  ticket.hasUnreadAdmin = false
  res.json({ success: true, ticket })
})

// Customer reply
app.post('/api/support/tickets/:id/reply', (req, res) => {
  const identity = resolveIdentity(req)
  const ticket = supportStore.get(req.params.id)
  if (!ticket) { res.status(404).json({ success: false, error: 'Not found' }); return }
  if (ticket.userEmail !== identity.email) { res.status(403).json({ success: false, error: 'Forbidden' }); return }
  const { message } = req.body as { message: string }
  if (!message) { res.status(400).json({ success: false, error: 'message required' }); return }
  const now = new Date().toISOString()
  ticket.messages.push({ id: `msg-${Date.now()}`, author: 'customer', content: message, timestamp: now })
  ticket.updatedAt = now
  if (ticket.status === 'resolved') ticket.status = 'open'
  ticket.hasUnreadCustomer = true
  debouncedSave('support-tickets', Object.fromEntries(supportStore))
  res.json({ success: true, ticket })
})

// ── Admin support endpoints ────────────────────────────────────────────────────

// Get all tickets (admin)
app.get('/api/admin/support/tickets', (_req, res) => {
  const all = [...supportStore.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  res.json({ success: true, tickets: all })
})

// Admin reply + status change
app.post('/api/admin/support/tickets/:id/reply', (req, res) => {
  const ticket = supportStore.get(req.params.id)
  if (!ticket) { res.status(404).json({ success: false, error: 'Not found' }); return }
  const { message, status } = req.body as { message?: string; status?: SupportTicket['status'] }
  const now = new Date().toISOString()
  if (message) {
    ticket.messages.push({ id: `msg-${Date.now()}`, author: 'admin', content: message, timestamp: now })
    ticket.hasUnreadAdmin = true
    ticket.hasUnreadCustomer = false
    // Notify the customer
    addNotification(ticket.userEmail, {
      type: 'support_reply',
      title: 'Support response received',
      body: `An admin has replied to your request "${ticket.subject}".`,
      ticketId: ticket.id,
    })
  }
  if (status) ticket.status = status
  ticket.updatedAt = now
  debouncedSave('support-tickets', Object.fromEntries(supportStore))
  res.json({ success: true, ticket })
})

// Mark ticket unread for admin (after reading)
app.post('/api/admin/support/tickets/:id/read', (_req, res) => {
  const ticket = supportStore.get(_req.params.id)
  if (ticket) { ticket.hasUnreadCustomer = false; debouncedSave('support-tickets', Object.fromEntries(supportStore)) }
  res.json({ success: true })
})

// ── Notifications ──────────────────────────────────────────────────────────────

interface AppNotification {
  id: string
  userEmail: string
  type: 'support' | 'support_reply' | 'system' | 'payment'
  title: string
  body: string
  read: boolean
  createdAt: string
  ticketId?: string
}

const notificationStore = new Map<string, AppNotification[]>() // email -> notifications

function addNotification(email: string, n: Omit<AppNotification, 'id' | 'userEmail' | 'read' | 'createdAt'>) {
  const list = notificationStore.get(email) ?? []
  list.unshift({
    ...n,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userEmail: email,
    read: false,
    createdAt: new Date().toISOString(),
  })
  notificationStore.set(email, list.slice(0, 100))
}

app.get('/api/notifications', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const list = notificationStore.get(session.email) ?? []
  res.json({ success: true, notifications: list })
})

app.post('/api/notifications/read', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const { id, all } = req.body as { id?: string; all?: boolean }
  const list = notificationStore.get(session.email) ?? []
  if (all) {
    notificationStore.set(session.email, list.map(n => ({ ...n, read: true })))
  } else if (id) {
    notificationStore.set(session.email, list.map(n => n.id === id ? { ...n, read: true } : n))
  }
  res.json({ success: true })
})

// ── FAQs ───────────────────────────────────────────────────────────────────────

interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

const FAQ_DEFAULTS: FaqItem[] = [
  { id: 'faq-1', category: 'Getting Started', question: 'What is NAN?', answer: 'NAN is an AI-powered financial platform that lets you give AI agents USDC budgets and permission rules so they can make payments on your behalf. You stay in control — agents only spend what you allow.', order: 0 },
  { id: 'faq-2', category: 'Getting Started', question: 'How do I create an account?', answer: 'Sign in with your email address. NAN uses a secure one-time password (OTP) sent to your inbox — no password required. Once verified, your account is ready instantly.', order: 1 },
  { id: 'faq-3', category: 'Getting Started', question: 'What blockchain does NAN use?', answer: 'NAN runs on Arc Testnet, where USDC is the native gas token. This means every transaction costs USDC, with stable and predictable fees.', order: 2 },
  { id: 'faq-4', category: 'Payments & Wallet', question: 'How do I get USDC?', answer: 'You can get free testnet USDC from the Faucet page. For real USDC, use the Buy section to onramp from your bank or card via Circle.', order: 3 },
  { id: 'faq-5', category: 'Payments & Wallet', question: 'How do I send USDC?', answer: 'Go to Wallet → Send. Enter the recipient wallet address and the amount you want to send. Review and confirm the transaction.', order: 4 },
  { id: 'faq-6', category: 'Payments & Wallet', question: 'Can I bridge USDC to other chains?', answer: 'Yes. The Bridge section lets you move USDC between Arc, Ethereum, Base, and Arbitrum using Circle\'s CCTP v2 protocol.', order: 5 },
  { id: 'faq-7', category: 'AI Agents', question: 'What can AI agents do?', answer: 'NAN agents can search for products, make purchases, send payments, and execute scheduled transactions — all within the spending limits and category rules you set.', order: 6 },
  { id: 'faq-8', category: 'AI Agents', question: 'How do I control what my agent spends?', answer: 'In the Agents section, you can set a daily spending limit, per-transaction limit, allowed categories, and whether to require your approval before each purchase.', order: 7 },
  { id: 'faq-9', category: 'AI Agents', question: 'Can I pause my agent?', answer: 'Yes. You can pause or revoke an agent\'s spending permissions at any time from the Agents or Settings page. The agent cannot spend USDC while paused.', order: 8 },
  { id: 'faq-10', category: 'Security & Privacy', question: 'Is my wallet safe?', answer: 'NAN uses industry-standard secure wallet infrastructure. You always control your funds — agents only have access to what you explicitly authorize.', order: 9 },
  { id: 'faq-11', category: 'Security & Privacy', question: 'Who has access to my account?', answer: 'Only you. NAN never stores private keys. Authentication uses email OTP. Agents only act within the permissions you grant them.', order: 10 },
  { id: 'faq-12', category: 'Support', question: 'How do I contact support?', answer: 'Open the Support section from the menu and submit a request. Our team typically responds within 24 hours.', order: 11 },
]
const faqStore: FaqItem[] = loadStore<FaqItem[]>('faqs', FAQ_DEFAULTS)

app.get('/api/faqs', (_req, res) => {
  res.json({ success: true, faqs: faqStore.sort((a, b) => a.order - b.order) })
})

app.post('/api/admin/faqs', (req, res) => {
  const { action, faq, id } = req.body as {
    action: 'create' | 'update' | 'delete' | 'reorder'
    faq?: Partial<FaqItem>
    id?: string
  }
  if (action === 'create' && faq) {
    const newFaq: FaqItem = {
      id: `faq-${Date.now()}`,
      category: faq.category ?? 'General',
      question: faq.question ?? '',
      answer: faq.answer ?? '',
      order: faqStore.length,
    }
    faqStore.push(newFaq)
    debouncedSave('faqs', faqStore)
    res.json({ success: true, faqs: faqStore })
  } else if (action === 'update' && id && faq) {
    const idx = faqStore.findIndex(f => f.id === id)
    if (idx === -1) { res.status(404).json({ success: false, error: 'Not found' }); return }
    faqStore[idx] = { ...faqStore[idx], ...faq, id }
    debouncedSave('faqs', faqStore)
    res.json({ success: true, faqs: faqStore })
  } else if (action === 'delete' && id) {
    const idx = faqStore.findIndex(f => f.id === id)
    if (idx !== -1) faqStore.splice(idx, 1)
    debouncedSave('faqs', faqStore)
    res.json({ success: true, faqs: faqStore })
  } else {
    res.status(400).json({ success: false, error: 'Invalid action' })
  }
})

// ── About Nan ──────────────────────────────────────────────────────────────────

interface AboutContent {
  headline: string
  tagline: string
  body: string
  mission: string
  contact: string
  updatedAt: string
}

let aboutContent: AboutContent = {
  headline: 'NAN — The Agent-First Financial Platform',
  tagline: 'Give AI agents money and permissions. Stay in control.',
  body: `NAN is a next-generation financial platform built for the age of autonomous AI agents. We believe the future of money is not about managing transactions yourself — it's about giving intelligent agents the right budgets, the right permissions, and the right context to act on your behalf.

NAN is built on Arc Testnet, where USDC is the native gas token. Every payment, every trade, every transfer happens with stable, predictable fees and sub-second finality.

Our platform lets you create AI agents, allocate USDC budgets, define spending rules by category, and approve or auto-approve transactions — all from a clean, minimal interface designed for both mobile and desktop.`,
  mission: 'Our mission is to make autonomous AI-powered finance accessible, secure, and genuinely useful for everyone.',
  contact: 'For support, open a ticket via the Support section. For business inquiries, email hello@nan.finance.',
  updatedAt: new Date().toISOString(),
}

app.get('/api/about', (_req, res) => {
  res.json({ success: true, about: aboutContent })
})

app.post('/api/admin/about', (req, res) => {
  const update = req.body as Partial<AboutContent>
  aboutContent = { ...aboutContent, ...update, updatedAt: new Date().toISOString() }
  res.json({ success: true, about: aboutContent })
})

// ── Feedback ───────────────────────────────────────────────────────────────────

interface FeedbackEntry {
  id: string
  userEmail: string
  rating: number          // 1-5
  comment: string
  category: string        // 'general' | 'payments' | 'agents' | 'support' | 'other'
  reviewed: boolean
  createdAt: string
}
const feedbackStore: FeedbackEntry[] = loadStore<FeedbackEntry[]>('feedback', [])

app.post('/api/feedback', (req, res) => {
  // Feedback is allowed from both authenticated and anonymous users.
  const session = getSession(req.headers.authorization)
  const { rating, comment = '', category = 'general' } = req.body as { rating: number; comment?: string; category?: string }
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ success: false, error: 'rating 1-5 required' }); return }
  const entry: FeedbackEntry = {
    id: `fb-${genToken(8)}`,
    userEmail: session?.email ?? 'anonymous',
    rating: Math.round(rating),
    comment: String(comment).slice(0, 1000),
    category,
    reviewed: false,
    createdAt: new Date().toISOString(),
  }
  feedbackStore.unshift(entry)
  debouncedSave('feedback', feedbackStore)
  res.json({ success: true, id: entry.id })
})

app.get('/api/admin/feedback', (_req, res) => {
  const avg = feedbackStore.length
    ? feedbackStore.reduce((s, f) => s + f.rating, 0) / feedbackStore.length
    : 0
  res.json({ success: true, feedback: feedbackStore, averageRating: Math.round(avg * 10) / 10, total: feedbackStore.length })
})

app.post('/api/admin/feedback/:id/review', (req, res) => {
  const entry = feedbackStore.find(f => f.id === req.params.id)
  if (!entry) { res.status(404).json({ success: false, error: 'Not found' }); return }
  entry.reviewed = true
  debouncedSave('feedback', feedbackStore)
  res.json({ success: true })
})

// ── Suggestions ─────────────────────────────────────────────────────────────────

type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'implemented' | 'closed'

interface SuggestionEntry {
  id: string
  userEmail: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  adminNote: string
  createdAt: string
  updatedAt: string
}
const suggestionStore: SuggestionEntry[] = loadStore<SuggestionEntry[]>('suggestions', [])

app.post('/api/suggestions', (req, res) => {
  // Suggestions are allowed from both authenticated and anonymous users.
  const session = getSession(req.headers.authorization)
  const { title, description = '', category = 'general' } = req.body as { title: string; description?: string; category?: string }
  if (!title?.trim()) { res.status(400).json({ success: false, error: 'title required' }); return }
  const entry: SuggestionEntry = {
    id: `sug-${genToken(8)}`,
    userEmail: session?.email ?? 'anonymous',
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 2000),
    category,
    status: 'new',
    adminNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  suggestionStore.unshift(entry)
  debouncedSave('suggestions', suggestionStore)
  res.json({ success: true, id: entry.id })
})

app.get('/api/suggestions', (req, res) => {
  // Return the current user's suggestions if authenticated, otherwise all anonymous ones.
  const session = getSession(req.headers.authorization)
  if (session) {
    const mine = suggestionStore.filter(s => s.userEmail === session.email)
    res.json({ success: true, suggestions: mine })
  } else {
    res.json({ success: true, suggestions: [] })
  }
})

app.get('/api/admin/suggestions', (_req, res) => {
  res.json({ success: true, suggestions: suggestionStore })
})

app.patch('/api/admin/suggestions/:id', (req, res) => {
  const entry = suggestionStore.find(s => s.id === req.params.id)
  if (!entry) { res.status(404).json({ success: false, error: 'Not found' }); return }
  const { status, adminNote } = req.body as { status?: SuggestionStatus; adminNote?: string }
  if (status) entry.status = status
  if (adminNote !== undefined) entry.adminNote = String(adminNote).slice(0, 1000)
  entry.updatedAt = new Date().toISOString()
  debouncedSave('suggestions', suggestionStore)
  res.json({ success: true, suggestion: entry })
})

// ── Admin audit log ────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  action: string
  actor: string          // 'admin' | email
  detail: string
  recordId?: string
  createdAt: string
}
export const auditLog: AuditEntry[] = []

export function appendAudit(action: string, actor: string, detail: string, recordId?: string) {
  auditLog.unshift({
    id: `aud-${genToken(6)}`,
    action, actor, detail, recordId,
    createdAt: new Date().toISOString(),
  })
  if (auditLog.length > 500) auditLog.length = 500
}

app.get('/api/admin/audit', (_req, res) => {
  res.json({ success: true, log: auditLog.slice(0, 200) })
})

// ── Session / login activity (per user) ────────────────────────────────────────

const loginHistory = new Map<string, Array<{ ts: string; ip: string; agent: string }>>()

// Login history entries are recorded when a session is created (see sessionStore.set proxy below)

app.get('/api/account/sessions', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const history = loginHistory.get(session.email) ?? []
  res.json({ success: true, sessions: history })
})

// ── Profile update ────────────────────────────────────────────────────────────

const profileStore = new Map<string, { displayName: string; bio: string; avatarUrl: string; notifPrefs: { supportReplies: boolean; systemUpdates: boolean; payments: boolean } }>(
  Object.entries(loadStore<Record<string, { displayName: string; bio: string; avatarUrl: string; notifPrefs: { supportReplies: boolean; systemUpdates: boolean; payments: boolean } }>>('profiles', {}))
)

app.get('/api/account/profile', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const profile = profileStore.get(session.email) ?? { displayName: '', bio: '', avatarUrl: '', notifPrefs: { supportReplies: true, systemUpdates: true, payments: true } }
  res.json({ success: true, profile, email: session.email, walletAddress: session.walletAddress })
})

app.patch('/api/account/profile', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const existing = profileStore.get(session.email) ?? { displayName: '', bio: '', avatarUrl: '', notifPrefs: { supportReplies: true, systemUpdates: true, payments: true } }
  const { displayName, bio, avatarUrl, notifPrefs } = req.body as { displayName?: string; bio?: string; avatarUrl?: string; notifPrefs?: typeof existing.notifPrefs }
  const updated = {
    ...existing,
    ...(displayName !== undefined ? { displayName: String(displayName).slice(0, 60) } : {}),
    ...(bio !== undefined ? { bio: String(bio).slice(0, 300) } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl: String(avatarUrl).slice(0, 200000) } : {}),
    ...(notifPrefs ? { notifPrefs: { ...existing.notifPrefs, ...notifPrefs } } : {}),
  }
  profileStore.set(session.email, updated)
  debouncedSave('profiles', Object.fromEntries(profileStore))
  res.json({ success: true, profile: updated })
})

// ── Analytics summary (admin) ─────────────────────────────────────────────────

app.get('/api/admin/analytics', (_req, res) => {
  const totalSessions = sessionStore.size
  const totalFeedback = feedbackStore.length
  const avgRating = feedbackStore.length
    ? Math.round((feedbackStore.reduce((s, f) => s + f.rating, 0) / feedbackStore.length) * 10) / 10
    : 0
  const totalSuggestions = suggestionStore.length
  const openSuggestions = suggestionStore.filter(s => s.status === 'new' || s.status === 'reviewing').length
  const totalVolume = txLedger.reduce((s, t) => s + t.amount, 0)
  const mainVolume  = txLedger.filter(t => t.walletType === 'main').reduce((s, t) => s + t.amount, 0)
  const agentVolume = txLedger.filter(t => t.walletType === 'agent').reduce((s, t) => s + t.amount, 0)
  res.json({
    success: true,
    totalUsers: totalSessions,
    totalFeedback,
    avgRating,
    totalSuggestions,
    openSuggestions,
    auditEntries: auditLog.length,
    totalTxCount: txLedger.length,
    totalVolume: Math.round(totalVolume * 100) / 100,
    mainVolume: Math.round(mainVolume * 100) / 100,
    agentVolume: Math.round(agentVolume * 100) / 100,
  })
})

// ── Transaction tracker ───────────────────────────────────────────────────────
// Called by the frontend whenever a transaction completes (main wallet or agent).
app.post('/api/tx-track', (req, res) => {
  const session = getSession(req.headers.authorization)
  const body = req.body as Partial<TxRecord>
  if (!body.type || body.amount === undefined) {
    res.status(400).json({ success: false, error: 'type and amount required' })
    return
  }
  const record: TxRecord = {
    id: `tx-${genToken(8)}`,
    walletType: body.walletType ?? 'main',
    walletAddress: body.walletAddress ?? session?.walletAddress ?? 'unknown',
    userEmail: session?.email ?? body.userEmail ?? 'anonymous',
    type: body.type,
    amount: Math.abs(Number(body.amount)),
    description: String(body.description ?? body.type),
    counterparty: body.counterparty,
    txHash: body.txHash,
    chain: body.chain ?? 'Arc Testnet',
    timestamp: new Date().toISOString(),
  }
  txLedger.unshift(record)
  if (txLedger.length > 2000) txLedger.splice(2000)
  debouncedSave('tx-ledger', txLedger)

  // ── Fraud heuristic: flag recipient receiving 3+ payments in 10 minutes ──
  let fraudFlag = false
  if (record.counterparty && record.type === 'sent') {
    const windowStart = Date.now() - 10 * 60 * 1000
    const recentToSame = txLedger.filter(t =>
      t.counterparty === record.counterparty &&
      t.type === 'sent' &&
      new Date(t.timestamp).getTime() > windowStart
    )
    if (recentToSame.length >= 3) {
      fraudFlag = true
      console.warn(`[FRAUD] Possible rapid-fire payments to ${record.counterparty} — ${recentToSame.length} in 10 min`)
    }
  }

  // Keep activityStore in sync so /api/activity-feed returns it immediately
  const actList = activityStore.get(record.walletAddress) ?? []
  actList.unshift({
    id: record.id,
    type: record.type,
    description: record.description,
    amount: String(record.amount),
    sign: (record.type === 'received' || record.type === 'bridge') ? '+' : '-',
    status: 'confirmed',
    counterparty: record.counterparty,
    txHash: record.txHash,
    timestamp: record.timestamp,
  })
  activityStore.set(record.walletAddress, actList.slice(0, 200))

  res.json({ success: true, id: record.id, fraudFlag })

  // Broadcast to any SSE listeners for this wallet
  broadcastActivity(record.walletAddress, record)
})

// ── SSE real-time activity feed ───────────────────────────────────────────────
type SSEClient = { write: (data: string) => void; close: () => void }
const sseMap = new Map<string, Set<SSEClient>>()

function broadcastActivity(walletAddress: string, record: Record<string, unknown>) {
  const clients = sseMap.get(walletAddress.toLowerCase())
  if (!clients) return
  const data = `data: ${JSON.stringify(record)}\n\n`
  clients.forEach(c => { try { c.write(data) } catch { /* client gone */ } })
}

app.get('/api/activity-stream', (req, res) => {
  const wallet = (req.query.wallet as string ?? '').toLowerCase()
  if (!wallet) { res.status(400).end(); return }
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()
  const client: SSEClient = { write: (d) => res.write(d), close: () => res.end() }
  if (!sseMap.has(wallet)) sseMap.set(wallet, new Set())
  sseMap.get(wallet)!.add(client)
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) } }, 25000)
  req.on('close', () => { clearInterval(heartbeat); sseMap.get(wallet)?.delete(client) })
})

// ── Referral system ────────────────────────────────────────────────────────────
const referralStore = new Map<string, { code: string; uses: number; createdAt: number }>(
  Object.entries(loadStore<Record<string, { code: string; uses: number; createdAt: number }>>('referrals', {}))
)

app.get('/api/referral', (req, res) => {
  const wallet = (req.query.wallet as string ?? '').toLowerCase()
  if (!wallet) { res.status(400).json({ error: 'wallet required' }); return }
  if (!referralStore.has(wallet)) {
    const code = wallet.slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()
    referralStore.set(wallet, { code, uses: 0, createdAt: Date.now() })
    debouncedSave('referrals', Object.fromEntries(referralStore))
  }
  res.json({ success: true, ...referralStore.get(wallet) })
})

app.post('/api/referral/use', (req, res) => {
  const { code } = req.body as { code: string }
  if (!code) { res.status(400).json({ error: 'code required' }); return }
  let found = false
  referralStore.forEach((v, k) => {
    if (v.code === code.toUpperCase()) {
      referralStore.set(k, { ...v, uses: v.uses + 1 })
      found = true
    }
  })
  if (!found) { res.status(404).json({ error: 'Invalid referral code' }); return }
  debouncedSave('referrals', Object.fromEntries(referralStore))
  res.json({ success: true })
})

app.get('/api/admin/tx-report', (_req, res) => {
  const totalVolume = txLedger.reduce((s, t) => s + t.amount, 0)
  const mainVolume  = txLedger.filter(t => t.walletType === 'main').reduce((s, t) => s + t.amount, 0)
  const agentVolume = txLedger.filter(t => t.walletType === 'agent').reduce((s, t) => s + t.amount, 0)
  const byType = txLedger.reduce<Record<string, { count: number; volume: number }>>((acc, t) => {
    if (!acc[t.type]) acc[t.type] = { count: 0, volume: 0 }
    acc[t.type].count++
    acc[t.type].volume = Math.round((acc[t.type].volume + t.amount) * 100) / 100
    return acc
  }, {})
  res.json({
    success: true,
    totalVolume: Math.round(totalVolume * 100) / 100,
    mainVolume:  Math.round(mainVolume  * 100) / 100,
    agentVolume: Math.round(agentVolume * 100) / 100,
    txCount: txLedger.length,
    byType,
    recent: txLedger.slice(0, 100),
  })
})

// Patch the OTP verify handler to record login history
// (done by wrapping the existing sessionStore.set call — we proxy via a helper here)
const _origSet = sessionStore.set.bind(sessionStore)
sessionStore.set = function(key: string, value: { email: string; walletAddress: string; walletId: string; createdAt: number }) {
  _origSet(key, value)
  debouncedSave('sessions', Object.fromEntries(sessionStore))
  const list = loginHistory.get(value.email) ?? []
  // Only record if this is a brand-new session (not an overwrite)
  if (!list.find(l => l.ts === new Date(value.createdAt).toISOString())) {
    list.unshift({
      ts: new Date().toISOString(),
      ip: 'recorded-on-verify',
      agent: 'browser',
    })
    loginHistory.set(value.email, list.slice(0, 20))
  }
  return sessionStore
}

// ── Google OAuth (dev server) ─────────────────────────────────────────────────
// Mirrors the Vercel function at api/misc.ts for the local Express dev server.

app.get('/api/auth/google', (req, res) => {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    // No client-id configured — redirect back with a mock session so devs can
    // still exercise the auth flow without a real Google project.
    const mockToken = Buffer.from(JSON.stringify({ email: 'demo@google.com', name: 'Demo User', exp: Date.now() + 86400000 })).toString('base64')
    const appUrl = `http://localhost:${PORT === 3001 ? 5173 : PORT}/#google-auth=${encodeURIComponent(mockToken)}&email=${encodeURIComponent('demo@google.com')}&name=${encodeURIComponent('Demo User')}`
    res.redirect(appUrl)
    return
  }
  const redirectUri = `${req.protocol}://${req.headers.host}/api/auth/google/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code as string | undefined
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${req.protocol}://${req.headers.host}/api/auth/google/callback`
  // Use the configured public URL (Railway/Vercel) or derive from the Host header
  const appBase = process.env.APP_URL
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    ?? `${req.protocol}://${(req.headers.host ?? 'localhost:5173').replace(':3001', ':5173')}`

  if (!code || !clientId || !clientSecret) {
    res.redirect(`${appBase}/#google-error=missing_config`)
    return
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenRes.json() as { id_token?: string; access_token?: string; error?: string }
    if (tokens.error || !tokens.access_token) throw new Error(tokens.error ?? 'No access_token')

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const user = await userRes.json() as { email?: string; name?: string; picture?: string }

    const sessionToken = Buffer.from(JSON.stringify({ email: user.email, name: user.name, exp: Date.now() + 86400000 })).toString('base64')
    const appUrl = `${appBase}/#google-auth=${encodeURIComponent(sessionToken)}&email=${encodeURIComponent(user.email ?? '')}&name=${encodeURIComponent(user.name ?? '')}`
    res.redirect(appUrl)
  } catch (e) {
    console.error('Google callback error:', e)
    res.redirect(`${appBase}/#google-error=${encodeURIComponent(e instanceof Error ? e.message : 'auth_error')}`)
  }
})

// ── App Kit — swap + bridge via developer-controlled wallets (nan pattern) ───────
// These routes serve Circle users whose wallets are managed server-side.
// Wagmi/browser wallet users call App Kit directly from the frontend.

const APPKIT_CHAIN = 'Arc_Testnet'
// Token addresses come from env — never hardcoded in source.
const APPKIT_USDC = process.env.VITE_USDC_ADDRESS
const APPKIT_EURC = process.env.VITE_EURC_ADDRESS

const BRIDGE_CHAIN_MAP: Record<string, string> = {
  'Arc_Testnet':          'Arc_Testnet',
  'Ethereum_Sepolia':     'Ethereum_Sepolia',
  'Base_Sepolia':         'Base_Sepolia',
  'Arbitrum_Sepolia':     'Arbitrum_Sepolia',
  'Optimism_Sepolia':     'Optimism_Sepolia',
  'Polygon_Amoy_Testnet': 'Polygon_Amoy_Testnet',
  'Avalanche_Fuji':       'Avalanche_Fuji',
  'Unichain_Sepolia':     'Unichain_Sepolia',
  'Sei_Testnet':          'Sei_Testnet',
  'World_Chain_Sepolia':  'World_Chain_Sepolia',
}

// Cache AppKit singleton so it warms up once and reuses across requests
let _appKitCache: { kit: import('@circle-fin/app-kit').AppKit; adapter: unknown } | null = null
async function getAppKit() {
  if (_appKitCache) return _appKitCache
  const { AppKit } = await import('@circle-fin/app-kit')
  const { createCircleWalletsAdapter } = await import('@circle-fin/adapter-circle-wallets')
  const apiKey = process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET
  if (!apiKey || !entitySecret) throw new Error('Circle developer-controlled wallet credentials not configured.')
  const adapter = createCircleWalletsAdapter({ apiKey, entitySecret })
  _appKitCache = { kit: new AppKit(), adapter }
  return _appKitCache
}

// POST /api/appkit/swap — action: 'quote' | 'swap'
app.post('/api/appkit/swap', async (req, res) => {
  const { action, walletAddress, tokenIn, tokenOut, amountIn } = req.body as {
    action?: string; walletAddress?: string; tokenIn?: string; tokenOut?: string; amountIn?: string
  }
  const fromToken = (tokenIn  ?? 'USDC').toUpperCase()
  const toToken   = (tokenOut ?? 'EURC').toUpperCase()
  const amtIn     = parseFloat(amountIn ?? '0')
  if (!amtIn || amtIn <= 0) { res.json({ success: false, error: 'Valid amountIn required' }); return }

  const TOKEN_ADDRESSES: Record<string, string | undefined> = { USDC: APPKIT_USDC, EURC: APPKIT_EURC }
  if (!TOKEN_ADDRESSES[fromToken] || !TOKEN_ADDRESSES[toToken]) {
    res.json({ success: false, error: `Unsupported token pair: ${fromToken} → ${toToken}. Only USDC and EURC are supported on Arc Testnet. (VITE_USDC_ADDRESS / VITE_EURC_ADDRESS may not be set in .env)` }); return
  }

  try {
    const { kit, adapter } = await getAppKit()
    const swapParams = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: { adapter: adapter as any, chain: APPKIT_CHAIN as any, address: walletAddress ?? 'estimate' },
      tokenIn: fromToken, tokenOut: toToken, amountIn: amtIn.toString(),
      config: { slippageBps: 300 },
    }

    if (action === 'quote') {
      const estimate = await kit.estimateSwap(swapParams)
      res.json({
        success: true,
        amountOut:       estimate.estimatedOutput?.amount ?? null,
        estimatedOutput: estimate.estimatedOutput ?? null,
        stopLimit:       estimate.stopLimit ?? null,
        fees:            estimate.fees ?? [],
      })
      return
    }

    if (!walletAddress) { res.json({ success: false, error: 'walletAddress required for swap' }); return }

    // Non-blocking — return immediately, swap executes in background.
    // Frontend shows "Swap submitted" and polls balance for the change.
    res.json({ success: true, pending: true, message: 'Swap submitted via Circle App Kit' })
    kit.swap(swapParams)
      .then(r => console.log('[appkit/swap] done:', (r as { txHash?: string }).txHash))
      .catch(e => console.error('[appkit/swap] error:', e instanceof Error ? e.message : e))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Swap failed'
    console.error('[appkit/swap]', msg)
    if (!res.headersSent) res.json({ success: false, error: msg.slice(0, 150) })
  }
})

// POST /api/appkit/bridge
app.post('/api/appkit/bridge', async (req, res) => {
  const { walletAddress, destChain, destAddr, amount } = req.body as {
    walletAddress?: string; destChain?: string; destAddr?: string; amount?: string
  }
  const parsed = parseFloat(amount ?? '0')
  const destChainName = destChain ? BRIDGE_CHAIN_MAP[destChain] : undefined

  if (!walletAddress || !destChain || !parsed || parsed <= 0)
    { res.json({ success: false, error: 'walletAddress, destChain, amount required' }); return }
  if (!destChainName)
    { res.json({ success: false, error: `Unsupported bridge chain: ${destChain}` }); return }

  try {
    const { kit, adapter } = await getAppKit()

    // Non-blocking — CCTP bridge takes 8-30s on testnet via the Orbit forwarder.
    // Return immediately so the frontend does not timeout.
    res.json({ success: true, pending: true, state: 'pending', message: 'Bridge submitted via CCTP V2 — USDC arriving on destination chain via Circle Orbit forwarder' })

    kit.bridge({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: { adapter: adapter as any, chain: APPKIT_CHAIN as any, address: walletAddress },
      to: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chain: destChainName as any,
        recipientAddress: destAddr ?? walletAddress,
        useForwarder: true,  // Circle's Orbit relayer mints on destination — no dest adapter needed
      },
      amount: parsed.toFixed(2),
      token: 'USDC',
    })
      .then(r => console.log('[appkit/bridge] complete, state:', (r as { state?: string }).state))
      .catch(e => console.error('[appkit/bridge] background error:', e instanceof Error ? e.message : e))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bridge failed'
    console.error('[appkit/bridge]', msg)
    if (!res.headersSent) res.json({ success: false, error: msg.slice(0, 200) })
  }
})

// Warm up AppKit singleton at server start when credentials are present
if (process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY && process.env.CIRCLE_ENTITY_SECRET) {
  getAppKit()
    .then(() => console.log('  ✓  AppKit singleton warmed (Circle dev wallets ready)'))
    .catch(e => console.log('  ⚠  AppKit warmup skipped:', e instanceof Error ? e.message : e))
}

// ── Web Push / VAPID ──────────────────────────────────────────────────────────
import webpush from 'web-push'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_CONTACT = process.env.VAPID_CONTACT     ?? 'mailto:admin@paywell.app'

// Map<walletAddress, Set<serialisedSubscription>>
const pushSubStore = new Map<string, Set<string>>()

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)
  console.log('  ✓  Web Push (VAPID) enabled')
} else {
  console.log('  ⚠  VAPID keys not set — push notifications disabled')
}

app.get('/api/push/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC || null })
})

app.post('/api/push/subscribe', (req, res) => {
  const { address, subscription } = req.body as {
    address: string
    subscription: webpush.PushSubscription
  }
  if (!address || !subscription?.endpoint) {
    res.status(400).json({ success: false, error: 'address and subscription required' })
    return
  }
  const key = address.toLowerCase()
  const subs = pushSubStore.get(key) ?? new Set()
  subs.add(JSON.stringify(subscription))
  pushSubStore.set(key, subs)
  console.log(`[push] subscribed ${key} (${subs.size} total)`)
  res.json({ success: true })
})

app.post('/api/push/unsubscribe', (req, res) => {
  const { address, subscription } = req.body as {
    address: string
    subscription: webpush.PushSubscription
  }
  if (!address) { res.json({ success: true }); return }
  const key = address.toLowerCase()
  const subs = pushSubStore.get(key)
  if (subs) {
    subs.delete(JSON.stringify(subscription))
    if (subs.size === 0) pushSubStore.delete(key)
  }
  res.json({ success: true })
})

async function sendPushToAddress(address: string, payload: object) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  const key  = address.toLowerCase()
  const subs = pushSubStore.get(key)
  if (!subs || subs.size === 0) return
  const dead: string[] = []
  for (const raw of subs) {
    try {
      await webpush.sendNotification(
        JSON.parse(raw) as webpush.PushSubscription,
        JSON.stringify(payload),
      )
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) dead.push(raw)
      else console.error('[push] send error:', e instanceof Error ? e.message : e)
    }
  }
  dead.forEach(r => subs.delete(r))
}

// ── Chain Watcher — polls Arc Testnet for incoming USDC transfers ─────────────
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'

// Build Arc Testnet RPC URL: prefer the provisioned proxy, fall back to the
// public endpoint read from the onchain-facts registry (never a typed literal).
function buildArcRpcUrl(): string {
  const proxyBase   = process.env.RPC_PROXY_BASE_URL
  const proxyToken  = process.env.RPC_PROXY_TOKEN
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map(s => s.trim())
  const CHAIN_KEY   = 'Arc_Testnet'
  if (proxyBase && proxyToken && proxyChains.includes(CHAIN_KEY)) {
    return `${proxyBase}/api/rpc/${CHAIN_KEY}?_rpc_token=${proxyToken}`
  }
  // Public fallback — rate limit unknown; may throttle under heavy load
  console.log('  ⚠  Arc Testnet RPC proxy not available — using public endpoint for chain watcher')
  return 'https://rpc.testnet.arc.io' // arc-studio-allow-onchain-literal
}

// USDC address on Arc Testnet — read from onchain-facts at runtime.
// We inline the import statically to avoid a dynamic import in a hot path.
import { getUsdc } from '../src/onchain-facts.js'

const ARC_CHAIN_ID  = 5042002
const usdcFact      = getUsdc(ARC_CHAIN_ID)
if (!usdcFact) throw new Error('USDC facts not found for Arc Testnet')
const USDC_ADDR     = usdcFact.address as `0x${string}`
const USDC_DEC      = usdcFact.decimals
const WATCHER_INTERVAL = 30_000

let watcherLastBlock: bigint | null = null

function buildArcClient() {
  const rpc = buildArcRpcUrl()
  return createPublicClient({
    chain: {
      id: ARC_CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  })
}

const arcClient = buildArcClient()

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

async function runWatcher() {
  try {
    const latest = await arcClient.getBlockNumber()
    if (watcherLastBlock === null) {
      // Always initialize the cursor, even with no subscribers yet,
      // so we don't miss transfers that arrive before the first user subscribes.
      watcherLastBlock = latest
      return
    }
    if (pushSubStore.size === 0) return
    if (latest <= watcherLastBlock) return
    const fromBlock = watcherLastBlock + 1n
    const toBlock   = latest
    watcherLastBlock = latest

    const logs = await arcClient.getLogs({
      address: USDC_ADDR,
      event: transferEvent,
      fromBlock,
      toBlock,
    })

    for (const log of logs) {
      const to = (log.args.to as string | undefined)?.toLowerCase()
      if (!to || !pushSubStore.has(to)) continue
      const amount = parseFloat(formatUnits(log.args.value ?? 0n, USDC_DEC))
      const from   = (log.args.from as string | undefined) ?? ''
      const short  = from ? `${from.slice(0, 6)}…${from.slice(-4)}` : 'someone'
      const txHash = log.transactionHash ?? ''
      await sendPushToAddress(to, { type: 'payment', title: `You received ${amount.toFixed(2)} USDC`, body: `From ${short}`, txHash, amount, from })
      console.log(`[watcher] pushed → ${to} (${amount} USDC)`)
    }
  } catch (e) {
    console.error('[watcher] error:', e instanceof Error ? e.message : e)
  }
}

function startChainWatcher() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.log('  ⚠  Chain watcher disabled (VAPID keys missing)')
    return
  }
  console.log('  ✓  Chain watcher started (Arc Testnet, 30 s interval)')
  void runWatcher()
  setInterval(() => { void runWatcher() }, WATCHER_INTERVAL)
}

// ── Payment Requests ─────────────────────────────────────────────────────────
// Keyed by walletAddress (lower-cased). Persisted to DATA_DIR/payment-requests.json.

interface StoredPaymentRequest {
  id: string; refNumber: string; title: string; description?: string
  recipientName?: string; amount: number; currency: string; note?: string
  reference?: string; dueDate?: string; createdAt: string; status: string
  paidAt?: string; paidTxHash?: string; paidAmount?: number; creatorAddress?: string
  updatedAt: string
}

const prStore = new Map<string, StoredPaymentRequest[]>(
  Object.entries(loadStore<Record<string, StoredPaymentRequest[]>>('payment-requests', {}))
)

function prKey(req: express.Request): string {
  const wallet = (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
  const session = getSession(req.headers.authorization)
  return wallet || session?.walletAddress?.toLowerCase() || ''
}

app.get('/api/payment-requests', (req, res) => {
  const key = prKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  res.json({ success: true, requests: prStore.get(key) ?? [] })
})

app.post('/api/payment-requests', (req, res) => {
  const key = prKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const body = req.body as Partial<StoredPaymentRequest>
  if (!body.title || !body.amount || !body.currency) {
    res.status(400).json({ success: false, error: 'title, amount, currency required' }); return
  }
  const list = prStore.get(key) ?? []
  const seq = (list.length + 1).toString().padStart(4, '0')
  const pr: StoredPaymentRequest = {
    id: body.id ?? `pr-${genToken(8)}`,
    refNumber: body.refNumber ?? `NAN-PR-${seq}`,
    title: body.title, description: body.description,
    recipientName: body.recipientName, amount: Number(body.amount),
    currency: body.currency, note: body.note, reference: body.reference,
    dueDate: body.dueDate, createdAt: body.createdAt ?? new Date().toISOString(),
    status: body.status ?? 'pending', paidAt: body.paidAt, paidTxHash: body.paidTxHash,
    paidAmount: body.paidAmount, creatorAddress: body.creatorAddress ?? key,
    updatedAt: new Date().toISOString(),
  }
  list.unshift(pr)
  prStore.set(key, list.slice(0, 500))
  debouncedSave('payment-requests', Object.fromEntries(prStore))
  res.json({ success: true, request: pr })
})

app.patch('/api/payment-requests/:id', (req, res) => {
  const key = prKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const list = prStore.get(key) ?? []
  const idx = list.findIndex(r => r.id === req.params.id)
  if (idx === -1) { res.status(404).json({ success: false, error: 'Not found' }); return }
  list[idx] = { ...list[idx], ...(req.body as Partial<StoredPaymentRequest>), id: req.params.id, updatedAt: new Date().toISOString() }
  prStore.set(key, list)
  debouncedSave('payment-requests', Object.fromEntries(prStore))
  res.json({ success: true, request: list[idx] })
})

app.delete('/api/payment-requests/:id', (req, res) => {
  const key = prKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const list = prStore.get(key) ?? []
  prStore.set(key, list.filter(r => r.id !== req.params.id))
  debouncedSave('payment-requests', Object.fromEntries(prStore))
  res.json({ success: true })
})

// ── Recurring Tasks ───────────────────────────────────────────────────────────
// Keyed by walletAddress. Persisted to DATA_DIR/recurring-tasks.json.

interface StoredRecurringTask {
  id: string; name: string; recipient: string; amount: string
  active: boolean; frequency: string; nextRunAt?: string
  lastRun?: string; lastTxHash?: string; runCount: number; createdAt: string
}

const rtStore = new Map<string, StoredRecurringTask[]>(
  Object.entries(loadStore<Record<string, StoredRecurringTask[]>>('recurring-tasks', {}))
)

function rtKey(req: express.Request): string {
  const wallet = (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
  const session = getSession(req.headers.authorization)
  return wallet || session?.walletAddress?.toLowerCase() || ''
}

app.get('/api/recurring-tasks', (req, res) => {
  const key = rtKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  res.json({ success: true, tasks: rtStore.get(key) ?? [] })
})

app.post('/api/recurring-tasks', (req, res) => {
  const key = rtKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const body = req.body as Partial<StoredRecurringTask>
  if (!body.name || !body.recipient || !body.amount) {
    res.status(400).json({ success: false, error: 'name, recipient, amount required' }); return
  }
  const list = rtStore.get(key) ?? []
  const task: StoredRecurringTask = {
    id: body.id ?? `rec-${genToken(8)}`,
    name: body.name, recipient: body.recipient, amount: body.amount,
    active: body.active ?? true, frequency: body.frequency ?? 'manual',
    nextRunAt: body.nextRunAt, lastRun: body.lastRun, lastTxHash: body.lastTxHash,
    runCount: body.runCount ?? 0, createdAt: body.createdAt ?? new Date().toISOString(),
  }
  list.push(task)
  rtStore.set(key, list.slice(0, 200))
  debouncedSave('recurring-tasks', Object.fromEntries(rtStore))
  res.json({ success: true, task })
})

app.patch('/api/recurring-tasks/:id', (req, res) => {
  const key = rtKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const list = rtStore.get(key) ?? []
  const idx = list.findIndex(t => t.id === req.params.id)
  if (idx === -1) { res.status(404).json({ success: false, error: 'Not found' }); return }
  list[idx] = { ...list[idx], ...(req.body as Partial<StoredRecurringTask>), id: req.params.id }
  rtStore.set(key, list)
  debouncedSave('recurring-tasks', Object.fromEntries(rtStore))
  res.json({ success: true, task: list[idx] })
})

app.delete('/api/recurring-tasks/:id', (req, res) => {
  const key = rtKey(req)
  if (!key) { res.status(401).json({ success: false, error: 'wallet address required' }); return }
  const list = rtStore.get(key) ?? []
  rtStore.set(key, list.filter(t => t.id !== req.params.id))
  debouncedSave('recurring-tasks', Object.fromEntries(rtStore))
  res.json({ success: true })
})

// ── Circle Services — onramp session minting ─────────────────────────────────
// Mirrors api/circle-services.ts (Vercel). Route: POST /api/circle-services?service=onramp
// Docs: https://docs.arc.io/app-kit/onramp · /app-kit/references/onramp-hosting-requirements
// Keys are environment-bound: Arc Testnet => sandbox key + sandbox API/widget (defaults below).
// For mainnet set ONRAMP_API_BASE_URL=https://api.circle.com and
// ONRAMP_WIDGET_BASE_URL=https://onramp.arc.io with a production key.

const _onrampApiKey =
  process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.ONRAMP_API_KEY ?? process.env.CIRCLE_API_KEY
const _onrampBaseUrl = process.env.ONRAMP_API_BASE_URL ?? 'https://api-test.circle.com'
const _onrampWidgetUrl = process.env.ONRAMP_WIDGET_BASE_URL ?? 'https://onramp-sandbox.arc.io'
// Bare hostname of the page embedding the widget (server-side config only)
const _onrampReferrer = process.env.ONRAMP_REFERRER_DOMAIN ?? 'nanarc.xyz'
const _onrampDestChain = process.env.ONRAMP_DESTINATION_CHAIN ?? 'Arc'

type _OnrampServer = { onramp: { createSession: (p: Record<string, unknown>) => Promise<Record<string, unknown>> } }
let _onrampServer: _OnrampServer | null = null

async function getOnrampServer(): Promise<_OnrampServer> {
  if (_onrampServer) return _onrampServer
  if (!_onrampApiKey) throw new Error('Onramp API key not configured')
  const { createAppServerKit } = await import('@circle-fin/app-kit/server')
  _onrampServer = createAppServerKit({
    onramp: {
      apiKey: _onrampApiKey,
      baseUrl: _onrampBaseUrl,
      widgetBaseUrl: _onrampWidgetUrl,
      referrerDomain: _onrampReferrer,
    },
  }) as unknown as _OnrampServer
  return _onrampServer
}

app.post(['/api/circle-services', '/api/onramp-session'], async (req, res) => {
  const service = req.path.endsWith('/onramp-session') ? 'onramp' : ((req.query.service ?? '') as string)

  if (service !== 'onramp') {
    res.status(400).json({ error: 'service param required: onramp' })
    return
  }

  if (!_onrampApiKey) {
    res.status(503).json({
      error: 'onramp_not_configured',
      message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY or CIRCLE_API_KEY to .env to enable fiat onramp.',
    })
    return
  }

  const { destinationAddress, amount: amountRaw, appUserId } = (req.body ?? {}) as {
    destinationAddress?: string; amount?: string | number; appUserId?: string
  }

  if (!destinationAddress) {
    res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
    return
  }

  try {
    const server = await getOnrampServer()
    const session = await server.onramp.createSession({
      appUserId: appUserId ?? destinationAddress,
      destinationAddress,
      destinationChain: _onrampDestChain,
      ...(amountRaw !== undefined ? { amount: String(amountRaw) } : {}),
      currency: 'USD',
      assets: { tokens: ['USDC'], chains: ['arc'] },
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(session)
  } catch (err) {
    // Same KitError.type -> HTTP status mapping as createSessionRouteHandler
    const e = err as { message?: string; type?: string; code?: number | string }
    let status = 500
    switch (e?.type) {
      case 'INPUT': status = 400; break
      case 'RATE_LIMIT': status = 429; break
      case 'NETWORK': status = 504; break
      case 'SERVICE':
      case 'RPC': status = 502; break
    }
    const message = e?.message ?? 'Onramp session error'
    console.error('[circle-services/onramp]', e?.type, e?.code, message)
    res.status(status).json({ message, error: message, code: e?.code })
  }
})

// ── Serve Vite build (production) ─────────────────────────────────────────────
// In dev, Vite proxies /api to this server; in production Express serves both.
const DIST = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist')
app.use(express.static(DIST))
// SPA fallback: any non-API route returns index.html
// ── Gateway REST proxy ────────────────────────────────────────────────────────
// Mirrors api/gateway-proxy.ts (Vercel) for the local Express dev server.
// Passkey transfer path in GatewayPage.tsx calls /api/gateway-proxy to avoid CORS.
const GATEWAY_API_BASE = 'https://gateway-api-testnet.circle.com/v1'
const gwBigintReplacer = (_k: string, v: unknown): unknown =>
  typeof v === 'bigint' ? v.toString() : v

app.post('/api/gateway-proxy', async (req, res) => {
  const action = (req.query.action ?? '') as string

  if (action === 'gateway-transfer') {
    const { items, enableForwarder } = req.body as { items?: unknown[]; enableForwarder?: boolean }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items array required' }); return
    }
    const url = enableForwarder
      ? `${GATEWAY_API_BASE}/transfer?enableForwarder=true`
      : `${GATEWAY_API_BASE}/transfer`
    try {
      const gwRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items, gwBigintReplacer),
      })
      const text = await gwRes.text()
      res.setHeader('content-type', 'application/json')
      res.status(gwRes.status).send(text)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway transfer failed' })
    }
    return
  }

  if (action === 'gateway-poll') {
    const { transferId } = req.body as { transferId?: string }
    if (!transferId) { res.status(400).json({ error: 'transferId required' }); return }
    try {
      const pollRes = await fetch(`${GATEWAY_API_BASE}/transfer/${transferId}`)
      const text = await pollRes.text()
      res.setHeader('content-type', 'application/json')
      res.status(pollRes.status).send(text)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway poll failed' })
    }
    return
  }

  if (action === 'gateway-estimate') {
    const { items, enableForwarder } = req.body as { items?: unknown[]; enableForwarder?: boolean }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'items array required' }); return
    }
    const url = enableForwarder
      ? `${GATEWAY_API_BASE}/estimate?enableForwarder=true`
      : `${GATEWAY_API_BASE}/estimate`
    try {
      const gwRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items, gwBigintReplacer),
      })
      const text = await gwRes.text()
      res.setHeader('content-type', 'application/json')
      res.status(gwRes.status).send(text)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway estimate failed' })
    }
    return
  }

  res.status(400).json({ error: 'action param required: gateway-transfer | gateway-poll | gateway-estimate' })
})

app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'))
})

// ── start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Paywell API running on port ${PORT}`)
  if (!process.env.OPENAI_API_KEY && !process.env.GROQ_API_KEY) console.log('  ⚠  OPENAI_API_KEY / GROQ_API_KEY not set — using mock AI replies')
  if (process.env.OPENAI_API_KEY) console.log('  ✓  OpenAI GPT-4o-mini enabled for AI chat')
  else if (process.env.GROQ_API_KEY) console.log('  ✓  Groq LLaMA enabled for AI chat')
  if (!process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY) console.log('  ⚠  CIRCLE_DEVELOPER_CONTROLLED_API_KEY not set — using mock wallets')
  if (!process.env.SMTP_USER) console.log('  ⚠  SMTP not configured — OTP codes printed to console')
  startChainWatcher()
})
