import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { address } = req.query
  if (!address) return res.status(400).json({ error: 'address required' })

  // Return empty — real activity comes from onchain getLogs in the frontend
  return res.status(200).json({ transactions: [] })
}
