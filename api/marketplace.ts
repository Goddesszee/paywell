import type { VercelRequest, VercelResponse } from '@vercel/node'

// Proxy for Circle Agent Marketplace Discovery API
// https://agents.circle.com/services
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const upstream = await fetch('https://agents.circle.com/services', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Paywell/1.0' },
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` })
    }
    const data = await upstream.json()
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach Circle Agent Marketplace', detail: String(err) })
  }
}
