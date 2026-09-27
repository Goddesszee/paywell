import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAppServerKit, createSessionRouteHandler } from '@circle-fin/app-kit/server'

const apiKey = process.env.CIRCLE_API_KEY
const domain = process.env.VERCEL_URL ?? 'paywell-puce.vercel.app'

// Lazily initialise so the module still loads when the key is absent
let routeHandler: ((req: Request) => Promise<Response>) | null = null

function getRouteHandler() {
  if (!apiKey) return null
  if (routeHandler) return routeHandler
  const server = createAppServerKit({
    onramp: {
      apiKey,
      referrerDomain: domain,
    },
  })
  routeHandler = createSessionRouteHandler(server.onramp)
  return routeHandler
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!apiKey) {
    return res.status(503).json({
      error: 'onramp_not_configured',
      message: 'Add CIRCLE_API_KEY to Vercel environment variables',
    })
  }

  const fn = getRouteHandler()
  if (!fn) return res.status(503).json({ error: 'Failed to initialise onramp handler' })

  try {
    // The kit handler expects a Fetch API Request object
    const url = `https://${domain}/api/onramp-session`
    const fetchReq = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    })

    const fetchRes = await fn(fetchReq)
    const text = await fetchRes.text()

    res.setHeader('content-type', 'application/json')
    return res.status(fetchRes.status).send(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onramp error'
    return res.status(500).json({ error: message })
  }
}
