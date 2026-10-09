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

// ── onramp — Circle Onramp Kit (App Kit server) ──────────────────────────────
// Docs: https://docs.arc.io/app-kit/onramp and /app-kit/references/onramp-hosting-requirements
// - Sessions are minted via POST {baseUrl}/v1/stablecoinKits/sessions. The SDK builds the wire body
//   (it maps destinationAddress -> walletAddress), so we call server.onramp.createSession().
//   createSessionRouteHandler is Fetch-only, but createSession() works in any Node runtime.
// - API keys are environment-bound. Arc Testnet => SANDBOX key + sandbox base URL + sandbox widget.
//   Set ONRAMP_API_BASE_URL=https://api.circle.com and ONRAMP_WIDGET_BASE_URL=https://onramp.arc.io
//   (plus a production key) only when going to mainnet.
// - Use the key exactly as issued from the Console (prefix included).
const onrampApiKey =
  process.env.CIRCLE_STABLECOIN_KIT_API_KEY ??
  process.env.ONRAMP_API_KEY ??
  process.env.CIRCLE_API_KEY
const ONRAMP_API_BASE_URL = process.env.ONRAMP_API_BASE_URL ?? 'https://api-test.circle.com'
const ONRAMP_WIDGET_BASE_URL = process.env.ONRAMP_WIDGET_BASE_URL ?? 'https://onramp-sandbox.arc.io'
// Bare hostname of the page embedding the widget — server-side config only (never from request headers).
const ONRAMP_REFERRER_DOMAIN = process.env.ONRAMP_REFERRER_DOMAIN ?? 'nanarc.xyz'
const ONRAMP_DESTINATION_CHAIN = process.env.ONRAMP_DESTINATION_CHAIN ?? 'Arc'

type OnrampServerKit = {
  onramp: { createSession: (p: Record<string, unknown>) => Promise<Record<string, unknown>> }
}
let _onrampServer: OnrampServerKit | null = null

async function getOnrampServer(): Promise<OnrampServerKit> {
  if (_onrampServer) return _onrampServer
  if (!onrampApiKey) throw new Error('Onramp API key not configured')
  const { createAppServerKit } = await import('@circle-fin/app-kit/server')
  _onrampServer = createAppServerKit({
    onramp: {
      apiKey: onrampApiKey,
      baseUrl: ONRAMP_API_BASE_URL,
      widgetBaseUrl: ONRAMP_WIDGET_BASE_URL,
      referrerDomain: ONRAMP_REFERRER_DOMAIN,
    },
  }) as unknown as OnrampServerKit
  return _onrampServer
}

async function mintOnrampSession(opts: {
  appUserId: string
  destinationAddress: string
  amount?: string
  currency?: string
}): Promise<Record<string, unknown>> {
  const server = await getOnrampServer()
  return server.onramp.createSession({
    appUserId: opts.appUserId,
    destinationAddress: opts.destinationAddress,
    destinationChain: ONRAMP_DESTINATION_CHAIN,
    ...(opts.amount ? { amount: opts.amount } : {}),
    currency: opts.currency ?? 'USD',
    assets: { tokens: ['USDC'], chains: ['arc'] },
  })
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

    const { destinationAddress, amount: amountRaw, appUserId } = (req.body ?? {}) as {
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
        amount,
        currency: 'USD',
      })
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json(session)
    } catch (err) {
      // Map KitError.type -> HTTP status (same mapping as createSessionRouteHandler)
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
      return res.status(status).json({ message, error: message, code: e?.code })
    }
  }

  return res.status(400).json({ error: 'service param required: wallets | onramp' })
}
