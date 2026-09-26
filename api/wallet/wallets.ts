import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })

  const userToken = req.headers['x-user-token'] as string
  if (!userToken) return res.status(401).json({ error: 'x-user-token header required' })

  try {
    const client = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.listWallets({ userToken })
    return res.json({ wallets: response.data?.wallets ?? [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Circle API error'
    return res.status(500).json({ error: msg })
  }
}
