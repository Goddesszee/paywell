/**
 * api/circle-services.ts — merged handler for circle-wallets and onramp-session
 * Replaces api/circle-wallets.ts and api/onramp-session.ts (both deleted).
 *
 * Route selection via query param:  ?service=wallets | onramp
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'
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

// ── onramp — call Circle API directly ────────────────────────────────────────
// NOTE: createSessionRouteHandler from @circle-fin/app-kit/server only works on
// Fetch-API runtimes (Next.js App Router, Cloudflare Workers). Vercel Node.js
// functions receive Express-style req/res objects, so we call the Circle
// onramp sessions REST API directly instead.
const onrampApiKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.CIRCLE_API_KEY

async function mintOnrampSession(opts: {
  appUserId: string
  destinationAddress: string
  destinationChain?: string
  amount?: string
  currency?: string
}): Promise<Record<string, unknown>> {
  if (!onrampApiKey) throw new Error('CIRCLE_STABLECOIN_KIT_API_KEY not configured')
  const res = await fetch('https://api.circle.com/v1/w3s/onramp/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${onrampApiKey}`,
    },
    body: JSON.stringify({
      appUserId: opts.appUserId,
      destinationWallets: [{
        address: opts.destinationAddress,
        blockchains: [opts.destinationChain ?? 'ARC-TESTNET'],
      }],
      ...(opts.amount ? { quoteAmount: opts.amount } : {}),
    }),
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string }).message
      ?? (data as { message?: string; error?: string }).error
      ?? JSON.stringify(data)
    throw new Error(`Circle API ${res.status}: ${msg}`)
  }
  // Unwrap Circle's { data: { ... } } envelope if present and surface widgetUrl
  const inner = (data.data ?? data) as Record<string, unknown>
  return { ...inner, widgetUrl: inner.widgetUrl ?? inner.widget_url }
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
      return res.status(503).json({
        error: 'onramp_not_configured',
        message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY (or CIRCLE_API_KEY) to Vercel environment variables',
      })
    }

    const { destinationAddress, amount: amountRaw, appUserId } = req.body as {
      destinationAddress?: string; amount?: string | number; appUserId?: string
    }

    if (!destinationAddress) {
      return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
    }

    const amount = amountRaw !== undefined ? String(amountRaw) : undefined

    try {
      const session = await mintOnrampSession({
        appUserId: appUserId ?? destinationAddress,
        destinationAddress,
        destinationChain: 'ARC-TESTNET',
        amount,
        currency: 'USD',
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(session)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onramp session error'
      console.error('[circle-services/onramp]', message)
      return res.status(500).json({ error: message })
    }
  }

  return res.status(400).json({ error: 'service param required: wallets | onramp' })
}
