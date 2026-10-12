/**
 * api/onramp-session.ts — Circle Onramp Kit session minting (standalone function)
 *
 * Deliberately isolated from api/circle-services.ts: that file imports the wallet SDK and Redis
 * at module load, and any failure there crashes the whole function (FUNCTION_INVOCATION_FAILED)
 * before our error handling runs. This file has NO heavy top-level imports.
 *
 * Docs: https://docs.arc.io/app-kit/onramp · /app-kit/references/onramp-hosting-requirements
 * Arc => sandbox key + sandbox API + sandbox widget (defaults below).
 * Mainnet: ONRAMP_API_BASE_URL=https://api.circle.com, ONRAMP_WIDGET_BASE_URL=https://onramp.arc.io + production key.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

type KitServer = {
  onramp: { createSession: (p: Record<string, unknown>) => Promise<Record<string, unknown>> }
}
let server: KitServer | null = null

function cleanEnv(v?: string): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '').trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  // GET = non-secret setup check (open /api/onramp-session in a browser): shows what we send to Circle.
  if (req.method === 'GET') {
    const k = process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.ONRAMP_API_KEY ?? process.env.CIRCLE_API_KEY ?? ''
    const clean = (v?: string) => (v ?? '').trim().replace(/^["']|["']$/g, '')
    const referrer = clean(process.env.ONRAMP_REFERRER_DOMAIN) || 'nanarc.xyz'
    return res.status(200).json({
      keyConfigured: !!k,
      keyType: /^LIVE_/i.test(k) ? 'LIVE' : /^TEST_/i.test(k) ? 'TEST' : k ? 'unknown' : 'none',
      referrerDomain: referrer,
      referrerLooksValid: /^[a-z0-9.-]+$/i.test(referrer) && !/^https?:|\/|:/.test(referrer),
      widgetBaseUrl: clean(process.env.ONRAMP_WIDGET_BASE_URL) || 'https://onramp.arc.io',
      apiBaseUrl: clean(process.env.ONRAMP_API_BASE_URL) || 'https://api.circle.com',
      destinationChain: process.env.ONRAMP_DESTINATION_CHAIN ?? 'Arc',
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const apiKey =
      process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.ONRAMP_API_KEY ?? process.env.CIRCLE_API_KEY
    if (!apiKey) {
      return res.status(503).json({
        error: 'onramp_not_configured',
        message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY to Vercel environment variables',
      })
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as {
      destinationAddress?: string; amount?: string | number; appUserId?: string
    }
    const { destinationAddress, amount, appUserId } = body

    // NAN platform fee (1%) is displayed in the UI and collected post-settlement.
    // Circle does not expose a partner-fee param in the session API, so we pass
    // the gross amount (what the user intends to pay) to Circle.  The DEPOSIT_SETTLED
    // webhook triggers a separate USDC transfer of the 1% fee from the user's wallet
    // to FEE_WALLET once the USDC lands.  This keeps Circle's disclosed amount accurate.
    const NAN_FEE_BPS = Number(process.env.VITE_FEE_ONRAMP_BPS ?? 100)
    const grossAmount = amount !== undefined ? Number(amount) : undefined
    const nanFee = grossAmount !== undefined ? Math.round(grossAmount * NAN_FEE_BPS) / 10000 : undefined
    void nanFee // collected post-settlement via DEPOSIT_SETTLED webhook
    if (!destinationAddress) {
      return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
    }

    if (!server) {
      const { createAppServerKit } = await import('@circle-fin/app-kit/server')
      server = createAppServerKit({
        onramp: {
          apiKey,
          baseUrl: cleanEnv(process.env.ONRAMP_API_BASE_URL) || 'https://api.circle.com',
          widgetBaseUrl: cleanEnv(process.env.ONRAMP_WIDGET_BASE_URL) || 'https://onramp.arc.io',
          // single bare hostname, no scheme/port/path (per Circle docs); stray quotes/spaces in Vercel are stripped
          referrerDomain: cleanEnv(process.env.ONRAMP_REFERRER_DOMAIN) || 'nanarc.xyz',
        },
      }) as unknown as KitServer
    }

    const session = await server.onramp.createSession({
      appUserId: appUserId ?? destinationAddress,
      destinationAddress,
      destinationChain: process.env.ONRAMP_DESTINATION_CHAIN ?? 'Arc',
      ...(amount !== undefined ? { amount: String(amount) } : {}),
      currency: 'USD',
      assets: { tokens: ['USDC'], chains: ['arc'] },
    })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(session)
  } catch (err) {
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
    console.error('[onramp-session]', e?.type, e?.code, message)
    return res.status(status).json({ message, error: message, code: e?.code })
  }
}
