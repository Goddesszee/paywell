/**
 * Paywell Backend Server
 * Bun + Express, runs on port 3001
 * Vite dev proxy forwards /api/* here
 */

import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(cors({ origin: '*', credentials: true }))
app.use(express.json())

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

// ── in-memory stores (replace with DB for production) ─────────────────────────
const otpStore = new Map<string, { otp: string; token: string; expiresAt: number }>()
const sessionStore = new Map<string, { email: string; walletAddress: string; walletId: string; createdAt: number }>()
const activityStore = new Map<string, Array<{
  id: string; type: string; description: string
  amount: string; sign: string; timestamp: string
  status: string; counterparty?: string; txHash?: string; agentInitiated?: boolean
}>>()

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

// ── OTP auth ─────────────────────────────────────────────────────────────────
app.post('/api/otp', async (req, res) => {
  try {
    const { action, email, otp, token, expiresAt } = req.body as {
      action: string; email: string; otp?: string; token?: string; expiresAt?: number
    }

    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'email required' })
      return
    }

    if (action === 'send') {
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
  } catch (_e) {
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
    const userMsg = message ?? messages?.[messages.length - 1]?.content ?? ''

    if (groqKey) {
      try {
        const reply = await groqChat(groqKey, userMsg, usdcBal ?? '0', userAddress ?? session.walletAddress)
        res.json({ success: true, reply })
        return
      } catch (e) {
        console.error('Groq chat failed:', e)
      }
    }

    // Fallback smart mock
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
  } catch (_e) {
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

const supportStore = new Map<string, SupportTicket>() // ticketId -> ticket

function getTicketsByEmail(email: string): SupportTicket[] {
  return [...supportStore.values()].filter(t => t.userEmail === email).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

// Create ticket
app.post('/api/support/tickets', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const { subject, message } = req.body as { subject: string; message: string }
  if (!subject || !message) { res.status(400).json({ success: false, error: 'subject and message required' }); return }
  const id = `TKT-${Date.now().toString(36).toUpperCase()}`
  const now = new Date().toISOString()
  const ticket: SupportTicket = {
    id, userEmail: session.email, subject, status: 'open',
    messages: [{ id: `msg-${Date.now()}`, author: 'customer', content: message, timestamp: now }],
    createdAt: now, updatedAt: now, hasUnreadAdmin: false, hasUnreadCustomer: true,
  }
  supportStore.set(id, ticket)
  // Create notification for customer (ticket created confirmation)
  addNotification(session.email, {
    type: 'support',
    title: 'Support request received',
    body: `Your request "${subject}" has been submitted. We'll get back to you shortly.`,
    ticketId: id,
  })
  res.json({ success: true, ticket })
})

// Get tickets for current user
app.get('/api/support/tickets', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  res.json({ success: true, tickets: getTicketsByEmail(session.email) })
})

// Get single ticket
app.get('/api/support/tickets/:id', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const ticket = supportStore.get(req.params.id)
  if (!ticket) { res.status(404).json({ success: false, error: 'Not found' }); return }
  if (ticket.userEmail !== session.email) { res.status(403).json({ success: false, error: 'Forbidden' }); return }
  // Mark customer as having read admin messages
  ticket.hasUnreadAdmin = false
  res.json({ success: true, ticket })
})

// Customer reply
app.post('/api/support/tickets/:id/reply', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const ticket = supportStore.get(req.params.id)
  if (!ticket) { res.status(404).json({ success: false, error: 'Not found' }); return }
  if (ticket.userEmail !== session.email) { res.status(403).json({ success: false, error: 'Forbidden' }); return }
  const { message } = req.body as { message: string }
  if (!message) { res.status(400).json({ success: false, error: 'message required' }); return }
  const now = new Date().toISOString()
  ticket.messages.push({ id: `msg-${Date.now()}`, author: 'customer', content: message, timestamp: now })
  ticket.updatedAt = now
  if (ticket.status === 'resolved') ticket.status = 'open'
  ticket.hasUnreadCustomer = true
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
  res.json({ success: true, ticket })
})

// Mark ticket unread for admin (after reading)
app.post('/api/admin/support/tickets/:id/read', (_req, res) => {
  const ticket = supportStore.get(_req.params.id)
  if (ticket) ticket.hasUnreadCustomer = false
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

const faqStore: FaqItem[] = [
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
    res.json({ success: true, faqs: faqStore })
  } else if (action === 'update' && id && faq) {
    const idx = faqStore.findIndex(f => f.id === id)
    if (idx === -1) { res.status(404).json({ success: false, error: 'Not found' }); return }
    faqStore[idx] = { ...faqStore[idx], ...faq, id }
    res.json({ success: true, faqs: faqStore })
  } else if (action === 'delete' && id) {
    const idx = faqStore.findIndex(f => f.id === id)
    if (idx !== -1) faqStore.splice(idx, 1)
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
const feedbackStore: FeedbackEntry[] = []

app.post('/api/feedback', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const { rating, comment = '', category = 'general' } = req.body as { rating: number; comment?: string; category?: string }
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ success: false, error: 'rating 1-5 required' }); return }
  const entry: FeedbackEntry = {
    id: `fb-${genToken(8)}`,
    userEmail: session.email,
    rating: Math.round(rating),
    comment: String(comment).slice(0, 1000),
    category,
    reviewed: false,
    createdAt: new Date().toISOString(),
  }
  feedbackStore.unshift(entry)
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
const suggestionStore: SuggestionEntry[] = []

app.post('/api/suggestions', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const { title, description = '', category = 'general' } = req.body as { title: string; description?: string; category?: string }
  if (!title?.trim()) { res.status(400).json({ success: false, error: 'title required' }); return }
  const entry: SuggestionEntry = {
    id: `sug-${genToken(8)}`,
    userEmail: session.email,
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 2000),
    category,
    status: 'new',
    adminNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  suggestionStore.unshift(entry)
  res.json({ success: true, id: entry.id })
})

app.get('/api/suggestions', (req, res) => {
  const session = requireSession(req, res)
  if (!session) return
  const mine = suggestionStore.filter(s => s.userEmail === session.email)
  res.json({ success: true, suggestions: mine })
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

const profileStore = new Map<string, { displayName: string; bio: string; avatarUrl: string; notifPrefs: { supportReplies: boolean; systemUpdates: boolean; payments: boolean } }>()

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
    ...(avatarUrl !== undefined ? { avatarUrl: String(avatarUrl).slice(0, 500) } : {}),
    ...(notifPrefs ? { notifPrefs: { ...existing.notifPrefs, ...notifPrefs } } : {}),
  }
  profileStore.set(session.email, updated)
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
  res.json({
    success: true,
    totalUsers: totalSessions,
    totalFeedback,
    avgRating,
    totalSuggestions,
    openSuggestions,
    auditEntries: auditLog.length,
  })
})

// Patch the OTP verify handler to record login history
// (done by wrapping the existing sessionStore.set call — we proxy via a helper here)
const _origSet = sessionStore.set.bind(sessionStore)
sessionStore.set = function(key: string, value: { email: string; walletAddress: string; walletId: string; createdAt: number }) {
  _origSet(key, value)
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
// In production the Netlify function at netlify/functions/auth-google-callback.ts
// handles /api/auth/google/callback. The routes below mirror that behaviour for
// the local dev server so the same Google login flow works in both environments.

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
  const appBase = `http://localhost:5173`

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

// ── start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Paywell API running on port ${PORT}`)
  if (!process.env.GROQ_API_KEY) console.log('  ⚠  GROQ_API_KEY not set — using mock AI replies')
  if (!process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY) console.log('  ⚠  CIRCLE_DEVELOPER_CONTROLLED_API_KEY not set — using mock wallets')
  if (!process.env.SMTP_USER) console.log('  ⚠  SMTP not configured — OTP codes printed to console')
})
