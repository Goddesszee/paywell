import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const kitKey = process.env.CIRCLE_STABLECOIN_KIT_API_KEY
  if (!kitKey) return res.status(503).json({ error: 'Onramp not configured. Add CIRCLE_STABLECOIN_KIT_API_KEY.' })

  const { walletAddress, amount, currency } = req.body as {
    walletAddress?: string; amount?: string; currency?: string
  }
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' })

  const response = await fetch('https://api.circle.com/v1/w3s/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kitKey}` },
    body: JSON.stringify({
      type: 'onramp',
      walletAddress,
      destinationCurrencyCode: currency ?? 'USDC',
      destinationAmount: amount,
      blockchain: 'ARC',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(response.status).json({ error: err })
  }

  const data = await response.json() as { data?: { sessionToken?: string } }
  return res.status(200).json({ sessionToken: data.data?.sessionToken })
}
