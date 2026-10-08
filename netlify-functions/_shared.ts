/**
 * Shared helpers for Paywell Netlify Functions
 */
import crypto from 'crypto'

// ── In-memory stores (survive warm lambda, reset on cold start) ────────────────
// For production, replace these with a real DB (e.g. Upstash Redis, PlanetScale)

export const otpStore = new Map<string, { otp: string; token: string; expiresAt: number }>()
export const sessionStore = new Map<string, { email: string; walletAddress: string; walletId: string }>()
export const activityStore = new Map<string, ActivityRecord[]>()

export interface ActivityRecord {
  id: string
  type: string
  description: string
  amount: string
  sign: string
  timestamp: string
  status: string
  counterparty?: string
  txHash?: string
  agentInitiated?: boolean
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function genToken(len = 32) {
  return crypto.randomBytes(len).toString('hex')
}

export function deterministicAddress(email: string): string {
  const hash = crypto.createHash('sha256').update(email).digest('hex')
  return '0x' + hash.slice(0, 40)
}

export function getSession(authHeader?: string) {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  return sessionStore.get(token) ?? null
}

export function addActivityRecord(walletAddress: string, record: Omit<ActivityRecord, 'id' | 'timestamp'>) {
  const list = activityStore.get(walletAddress) ?? []
  list.unshift({ id: `srv-${genToken(6)}`, timestamp: new Date().toISOString(), ...record })
  activityStore.set(walletAddress, list.slice(0, 200))
}

// ── Groq chat ──────────────────────────────────────────────────────────────────

export async function groqChat(apiKey: string, message: string, usdcBal: string, walletAddress: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content: `You are the Paywell AI shopping assistant. The user's wallet address is ${walletAddress} and they have ${usdcBal} USDC available. Help them find products, answer payment questions, and suggest purchases. Be concise. Never ask for private keys or seed phrases.`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 300,
    }),
  })
  const data = await res.json() as {
    choices?: Array<{ message: { content: string } }>
    error?: { message: string }
  }
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not process that.'
}

export function mockAgentReply(message: string, usdcBal: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('balance') || msg.includes('how much'))
    return `You have ${usdcBal} USDC in your Paywell wallet. Would you like to browse products or send a payment?`
  if (msg.includes('buy') || msg.includes('purchase') || msg.includes('shop'))
    return `I can help you shop! Head to the Shop tab to browse products across tech, home, fashion, food, and digital categories.`
  if (msg.includes('send') || msg.includes('transfer') || msg.includes('pay'))
    return `To send USDC, go to the Wallet tab and tap Send. Enter the recipient address and amount.`
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey'))
    return `Hi! I'm your Paywell assistant. I can help you shop, send payments, and manage your wallet. What would you like to do?`
  return `I'm your Paywell shopping assistant. You have ${usdcBal} USDC available. I can help you find products, send USDC payments, or manage your wallet.`
}

// ── Products catalogue ─────────────────────────────────────────────────────────

export const PRODUCTS = [
  { id: 'wm-keyboard-01', name: 'Wireless Mechanical Keyboard', price: 24, merchant: 'TechFlow', merchantId: 'techflow', category: 'tech', description: 'Compact 75% layout with hot-swap switches and 3 connectivity modes.', image: '', rating: 4.7, reviewCount: 312, inStock: true, tags: ['keyboard', 'wireless', 'mechanical'] },
  { id: 'noise-headphones-02', name: 'Noise Cancelling Headphones', price: 45, merchant: 'SoundWave', merchantId: 'soundwave', category: 'tech', description: 'Up to 40-hour battery, ANC, foldable design.', image: '', rating: 4.5, reviewCount: 198, inStock: true, tags: ['headphones', 'audio', 'anc'] },
  { id: 'led-desk-lamp-03', name: 'LED Desk Lamp', price: 18, merchant: 'BrightSpace', merchantId: 'brightspace', category: 'home', description: 'Touch-dimmer, 5 colour temps, USB-A charging port.', image: '', rating: 4.6, reviewCount: 445, inStock: true, tags: ['lamp', 'desk', 'led'] },
  { id: 'coffee-blend-04', name: 'Premium Coffee Blend Pack', price: 8, merchant: 'BrewCo', merchantId: 'brewco', category: 'food', description: 'Three single-origin blends, specialty roast, 250g each.', image: '', rating: 4.8, reviewCount: 621, inStock: true, tags: ['coffee', 'specialty', 'food'] },
  { id: 'yoga-mat-05', name: 'Non-Slip Yoga Mat', price: 15, merchant: 'FlexLife', merchantId: 'flexlife', category: 'home', description: '6mm eco-friendly TPE, alignment lines, carry strap.', image: '', rating: 4.4, reviewCount: 287, inStock: true, tags: ['yoga', 'fitness', 'mat'] },
  { id: 'tshirt-06', name: 'Premium Cotton T-Shirt', price: 12, merchant: 'ThreadCo', merchantId: 'threadco', category: 'fashion', description: '100% organic cotton, relaxed fit, 6 colours.', image: '', rating: 4.3, reviewCount: 512, inStock: true, tags: ['tshirt', 'cotton', 'fashion'] },
  { id: 'vpn-07', name: 'VPN — 1 Year Subscription', price: 20, merchant: 'SecureNet', merchantId: 'securenet', category: 'digital', description: 'No-logs policy, 50+ countries, 5 devices.', image: '', rating: 4.6, reviewCount: 892, inStock: true, tags: ['vpn', 'privacy', 'digital'] },
  { id: 'plant-08', name: 'Low-Maintenance Indoor Plant', price: 22, merchant: 'GreenThumb', merchantId: 'greenthumb', category: 'home', description: 'Pothos or snake plant (random), includes ceramic pot.', image: '', rating: 4.7, reviewCount: 163, inStock: true, tags: ['plant', 'home', 'decor'] },
  { id: 'notebook-09', name: 'Dotted Notebook A5', price: 9, merchant: 'WriteMore', merchantId: 'writemore', category: 'home', description: '180 pages, hardcover, lay-flat binding, dotted pages.', image: '', rating: 4.5, reviewCount: 334, inStock: true, tags: ['notebook', 'stationery', 'writing'] },
  { id: 'icon-pack-10', name: 'Designer Icon Pack', price: 6, merchant: 'PixelShop', merchantId: 'pixelshop', category: 'digital', description: '2,400 SVG icons in 3 styles, lifetime licence.', image: '', rating: 4.9, reviewCount: 1204, inStock: true, tags: ['icons', 'design', 'digital'] },
  { id: 'standing-mat-11', name: 'Anti-Fatigue Standing Mat', price: 32, merchant: 'DeskLife', merchantId: 'desklife', category: 'home', description: '3/4" thick PU foam, bevelled edges, easy-clean surface.', image: '', rating: 4.4, reviewCount: 208, inStock: true, tags: ['mat', 'standing desk', 'ergonomic'] },
  { id: 'whey-12', name: 'Whey Protein — Chocolate', price: 28, merchant: 'NutriCore', merchantId: 'nutricore', category: 'food', description: '25g protein per serving, 30 servings, low sugar.', image: '', rating: 4.6, reviewCount: 741, inStock: true, tags: ['protein', 'fitness', 'food'] },
]
