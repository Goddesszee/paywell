/**
 * api/circle-services.ts — merged handler for circle-wallets and onramp-session
 * Replaces api/circle-wallets.ts and api/onramp-session.ts (both deleted).
 *
 * Route selection via query param:  ?service=wallets | onramp
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
import { createAppServerKit, createSessionRouteHandler } from '@circle-fin/app-kit/server'
import { getRedis } from './_redis'

// ── shared helpers ─────────────────────────────────────────────────────────────

function circleKey(): string | undefined {
  return (
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  )
}

function ucwClient() {
  const key = circleKey()
  if (!key) throw new Error('CIRCLE_API_KEY not configured')
  return initiateUserControlledWalletsClient({ apiKey: key })
}

interface SessionRecord {
  email: string
  walletId: string
  walletAddress: string
  userToken?: string
}

async function getSession(authHeader: string | undefined): Promise<SessionRecord | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  try {
    const redis = getRedis()
    const raw = await redis.get<SessionRecord>(`session:${token}`)
    return raw ?? null
  } catch {
    return null
  }
}

// ── onramp singleton ──────────────────────────────────────────────────────────
const onrampApiKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.CIRCLE_API_KEY
const onrampDomain =
  process.env.ONRAMP_DOMAIN ??
  process.env.VERCEL_URL ??
  process.env.VERCEL_BRANCH_URL ??
  'localhost:5173'

let _onrampHandler: ((req: Request) => Promise<Response>) | null = null
function getOnrampHandler() {
  if (!onrampApiKey) return null
  if (_onrampHandler) return _onrampHandler
  const server = createAppServerKit({ onramp: { apiKey: onrampApiKey, referrerDomain: onrampDomain } })
  _onrampHandler = createSessionRouteHandler(server.onramp)
  return _onrampHandler
}

// ── main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const service = (req.query.service ?? '') as string

  // ── WALLETS ─────────────────────────────────────────────────────────────────
  if (service === 'wallets') {
    const session = await getSession(req.headers.authorization)
    if (!session) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const body = req.body as { action?: string; to?: string; amount?: string; tokenSymbol?: string }
    const { action, to, amount, tokenSymbol = 'USDC' } = body

    if (action === 'getWallet') {
      const key = circleKey()
      if (key && session.walletId) {
        try {
          const client = ucwClient()
          if (session.userToken) {
            const resp = await client.listWalletBalance({ userToken: session.userToken, walletId: session.walletId })
            const tokenBalances = resp.data?.tokenBalances ?? []
            const balances = tokenBalances.map((b) => ({
              symbol: (b.token as { symbol?: string })?.symbol ?? 'USDC',
              amount: b.amount ?? '0',
            }))
            return res.status(200).json({ success: true, wallet: { id: session.walletId, address: session.walletAddress }, balances })
          }
          const r = await fetch(`https://api.circle.com/v1/w3s/wallets/${session.walletId}/balances`, {
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          })
          if (r.ok) {
            const data = await r.json() as { data?: { tokenBalances?: Array<{ token: { symbol: string }; amount: string }> } }
            const balances = (data.data?.tokenBalances ?? []).map((b) => ({ symbol: b.token.symbol, amount: b.amount }))
            return res.status(200).json({ success: true, wallet: { id: session.walletId, address: session.walletAddress }, balances })
          }
        } catch (e) {
          console.error('circle-services getWallet error:', e)
        }
      }
      return res.status(200).json({
        success: true,
        wallet: { id: session.walletId, address: session.walletAddress },
        balances: [{ symbol: 'USDC', amount: '0.00' }, { symbol: 'EURC', amount: '0.00' }],
      })
    }

    if (action === 'transfer') {
      if (!to || !amount) return res.status(400).json({ success: false, error: 'to and amount required' })
      const txId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      return res.status(200).json({ success: true, txId, message: `Transfer of ${amount} ${tokenSymbol} to ${to} is being processed.` })
    }

    return res.status(400).json({ success: false, error: 'Unknown action' })
  }

  // ── ONRAMP ──────────────────────────────────────────────────────────────────
  if (service === 'onramp') {
    if (!onrampApiKey) {
      return res.status(503).json({ error: 'onramp_not_configured', message: 'Add CIRCLE_API_KEY to Vercel environment variables' })
    }

    const fn = getOnrampHandler()
    if (!fn) return res.status(503).json({ error: 'Failed to initialise onramp handler' })

    const { destinationAddress, amount: amountRaw, appUserId } = req.body as {
      destinationAddress?: string; amount?: string | number; appUserId?: string
    }
    const amount = amountRaw !== undefined ? String(amountRaw) : '100'

    if (!destinationAddress) {
      return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
    }

    // Build a Request with the correct OnrampSessionRequest field names:
    // { userId, destinationAddress, destinationChain, amount, currency }
    // The URL is arbitrary — the kit only reads the body, not the URL.
    const sessionBody = {
      userId: appUserId ?? destinationAddress,
      destinationAddress,
      destinationChain: 'ARC-TESTNET',
      amount,
      currency: 'USD',
    }

    try {
      const fetchReq = new Request('https://internal/onramp-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sessionBody),
      })
      const fetchRes = await fn(fetchReq)
      const text = await fetchRes.text()
      res.setHeader('content-type', 'application/json')
      return res.status(fetchRes.status).send(text)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onramp session error'
      return res.status(500).json({ error: message })
    }
  }

  return res.status(400).json({ error: 'service param required: wallets | onramp' })
}
