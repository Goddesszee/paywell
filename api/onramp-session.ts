/**
 * api/onramp-session.ts — Circle Onramp Kit session minting (standalone function)
 *
 * Deliberately isolated from api/circle-services.ts: that file imports the wallet SDK and Redis
 * at module load, and any failure there crashes the whole function (FUNCTION_INVOCATION_FAILED)
 * before our error handling runs. This file has NO heavy top-level imports.
 *
 * Docs: https://docs.arc.io/app-kit/onramp · /app-kit/references/onramp-hosting-requirements
 * Arc Testnet => sandbox key + sandbox API + sandbox widget (defaults below).
 * Mainnet: ONRAMP_API_BASE_URL=https://api.circle.com, ONRAMP_WIDGET_BASE_URL=https://onramp.arc.io + production key.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

type KitServer = {
  onramp: { createSession: (p: Record<string, unknown>) => Promise<Record<string, unknown>> }
}
let server: KitServer | null = null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
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
    if (!destinationAddress) {
      return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
    }

    if (!server) {
      const { createAppServerKit } = await import('@circle-fin/app-kit/server')
      server = createAppServerKit({
        onramp: {
          apiKey,
          baseUrl: process.env.ONRAMP_API_BASE_URL ?? 'https://api-test.circle.com',
          widgetBaseUrl: process.env.ONRAMP_WIDGET_BASE_URL ?? 'https://onramp-sandbox.arc.io',
          referrerDomain: process.env.ONRAMP_REFERRER_DOMAIN ?? 'nanarc.xyz',
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
