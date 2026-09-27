import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAppServerKit, createSessionRouteHandler } from '@circle-fin/app-kit/server'

const apiKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY ?? process.env.CIRCLE_API_KEY
const domain = 'paywell-puce.vercel.app'

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

  const { destinationAddress, amount: amountRaw, appUserId } = req.body as {
    destinationAddress?: string
    amount?: string | number
    appUserId?: string
  }
  const amount = amountRaw !== undefined ? String(amountRaw) : '100'

  if (!destinationAddress) {
    return res.status(400).json({ error: 'destinationAddress is required — connect a wallet first' })
  }

  // Build the exact request body the Circle SDK expects
  const body = {
    appUserId: appUserId ?? destinationAddress, // use wallet address as user ID if not provided
    destinationAddress,
    destinationChain: 'ARC-TESTNET',
    amount,
    currency: 'USD',
    assets: {
      tokens: ['USDC'],
      chains: ['ARC-TESTNET'],
    },
  }

  try {
    const fetchReq = new Request(`https://${domain}/api/onramp-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
