import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })

  const { userToken } = req.body as { userToken: string }
  if (!userToken) return res.status(400).json({ error: 'userToken required' })

  try {
    const client = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.createUserPinWithWallets({
      userToken,
      blockchains: [Blockchain.ArcTestnet],
      accountType: 'SCA',
    })
    return res.json({ challengeId: response.data?.challengeId })
  } catch (err: unknown) {
    // 155106 = user already initialized — load existing wallets
    const code = (err as { response?: { data?: { code?: number } } })?.response?.data?.code
    if (code === 155106) return res.json({ code: 155106, message: 'User already initialized' })
    const msg = err instanceof Error ? err.message : 'Circle API error'
    return res.status(500).json({ error: msg })
  }
}
