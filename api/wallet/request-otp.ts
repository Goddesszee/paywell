import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.CIRCLE_USER_CONTROLLED_API_KEY || process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'CIRCLE_USER_CONTROLLED_API_KEY not configured' })

  const { deviceId, email } = req.body as { deviceId: string; email: string }
  if (!deviceId || !email) return res.status(400).json({ error: 'deviceId and email required' })

  try {
    const client = initiateUserControlledWalletsClient({ apiKey })
    const response = await client.createDeviceTokenForEmailLogin({ deviceId, email })
    const { deviceToken, deviceEncryptionKey, otpToken } = response.data ?? {}
    return res.json({ deviceToken, deviceEncryptionKey, otpToken })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Circle API error'
    return res.status(500).json({ error: msg })
  }
}
