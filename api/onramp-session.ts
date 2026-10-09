/**
 * api/onramp-session.ts — Circle Onramp session minting
 *
 * Calls the Circle onramp sessions REST API directly.
 * Avoids createSessionRouteHandler / createAppServerKit which are incompatible
 * with Vercel Node.js serverless functions (they require a Fetch-API runtime).
 *
 * Docs: https://developers.circle.com/circle-mint/reference/createonrampsession
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const CIRCLE_API = 'https://api.circle.com'

function apiKey(): string | undefined {
  return (
    process.env.CIRCLE_STABLECOIN_KIT_API_KEY ??
    process.env.ONRAMP_API_KEY ??
    process.env.CIRCLE_API_KEY
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = apiKey()
  if (!key) {
    return res.status(503).json({
      error: 'onramp_not_configured',
      message: 'Add CIRCLE_STABLECOIN_KIT_API_KEY to Vercel environment variables',
    })
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as {
    destinationAddress?: string
    amount?: string | number
    appUserId?: string
  }
  const { destinationAddress, amount, appUserId } = body

  if (!destinationAddress) {
    return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
  }

  try {
    const sessionRes = await fetch(`${CIRCLE_API}/v1/w3s/onramp/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        appUserId: appUserId ?? destinationAddress,
        destinationWallets: [
          {
            address: destinationAddress,
            blockchains: ['ARC-TESTNET'],
          },
        ],
        ...(amount !== undefined ? { amount: { amount: String(amount), currency: 'USD' } } : {}),
      }),
    })

    const json = await sessionRes.json() as Record<string, unknown>

    if (!sessionRes.ok) {
      const message = (json?.message as string) ?? (json?.error as string) ?? `Circle API error ${sessionRes.status}`
      console.error('[onramp-session] Circle error', sessionRes.status, message)
      return res.status(sessionRes.status).json({ error: message, message })
    }

    // Normalise: surface widgetUrl at the top level regardless of nesting
    const data = (json?.data ?? json) as Record<string, unknown>
    const widgetUrl = (data?.widgetUrl ?? json?.widgetUrl) as string | undefined

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ...data, widgetUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onramp session error'
    console.error('[onramp-session]', message)
    return res.status(500).json({ error: message, message })
  }
}
