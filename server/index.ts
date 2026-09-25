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
function paywall(price: string): express.RequestHandler {
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

      res.json({
        success: true,
        token: otpToken,
        expiresAt: exp,
        dev: !smtpUser, // frontend shows OTP in dev mode
        ...(process.env.NODE_ENV !== 'production' && { _devOtp: code }),
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
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' })
  }
})

// ── AI chat ────────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
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
  } catch (e) {
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
  // Using Circle's developer-controlled wallets SDK would be the production path.
  // This REST call is a simplified placeholder — swap with SDK initiateDeveloperControlledWalletsClient for prod.
  const res = await fetch('https://api.circle.com/v1/w3s/developer/transactions/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletId: opts.walletId,
      destinationAddress: opts.to,
      amounts: [opts.amount],
      tokenAddress: opts.tokenSymbol === 'USDC' ? '0x3600000000000000000000000000000000000000' : undefined,
      feeLevel: 'MEDIUM',
      idempotencyKey: genToken(16),
    }),
  })
  const data = await res.json() as { data?: { transaction?: { id: string } }; message?: string }
  if (!res.ok) throw new Error(data.message ?? 'Circle transfer failed')
  return { txId: data.data?.transaction?.id ?? genToken(8) }
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

// ── start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Paywell API running on port ${PORT}`)
  if (!process.env.GROQ_API_KEY) console.log('  ⚠  GROQ_API_KEY not set — using mock AI replies')
  if (!process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY) console.log('  ⚠  CIRCLE_DEVELOPER_CONTROLLED_API_KEY not set — using mock wallets')
  if (!process.env.SMTP_USER) console.log('  ⚠  SMTP not configured — OTP codes printed to console')
})
