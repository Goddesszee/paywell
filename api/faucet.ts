import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAddress } from 'viem'

// Circle's public faucet REST endpoint — same one self-deploy.ts / compass-deploy.ts
// use via the SDK's requestTestnetTokens(). We hit it directly here since this route
// only ever needs one call, not the full Developer-Controlled Wallets client.
const FAUCET_URL = 'https://api.circle.com/v1/faucet/drips'
const BLOCKCHAIN = 'ARC-TESTNET'

// In-memory per-address cooldown so one wallet can't hammer Circle's faucet (and
// so we give a fast, friendly response instead of relaying Circle's rate-limit error).
// This resets on cold start — fine for a testnet faucet, not meant to be bulletproof.
const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24h, matches Circle's own faucet cadence
const lastRequestByAddress = new Map<string, number>()

function apiKey(): string | undefined {
  return process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = apiKey()
  if (!key) {
    return res.status(503).json({
      error: 'faucet_not_configured',
      message: 'Add CIRCLE_DEVELOPER_CONTROLLED_API_KEY to Vercel environment variables',
    })
  }

  const { address } = (req.body ?? {}) as { address?: string }

  if (!address || !isAddress(address)) {
    return res.status(400).json({ error: 'A valid wallet address is required' })
  }

  const normalized = address.toLowerCase()
  const lastRequest = lastRequestByAddress.get(normalized)
  const now = Date.now()

  if (lastRequest && now - lastRequest < COOLDOWN_MS) {
    const retryAfterMs = COOLDOWN_MS - (now - lastRequest)
    return res.status(429).json({
      error: 'cooldown',
      message: 'This address already claimed testnet funds in the last 24 hours',
      retryAfterMs,
    })
  }

  try {
    const circleRes = await fetch(FAUCET_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      // Arc's gas token IS USDC (18-decimal native view of the same asset), so
      // requesting usdc:true is enough to fund both gas and the ERC-20 balance —
      // there's no separate native drip to ask for on this chain.
      body: JSON.stringify({ address, blockchain: BLOCKCHAIN, usdc: true }),
    })

    if (!circleRes.ok) {
      const errBody = await circleRes.json().catch(() => ({}))
      const message =
        (errBody as { message?: string })?.message ?? `Circle faucet request failed (HTTP ${circleRes.status})`
      // Circle itself rate-limits per address/IP — surface that as our own cooldown response.
      if (circleRes.status === 429) {
        return res.status(429).json({ error: 'cooldown', message })
      }
      return res.status(circleRes.status).json({ error: 'faucet_request_failed', message })
    }

    lastRequestByAddress.set(normalized, now)

    return res.status(200).json({
      ok: true,
      message: 'Testnet USDC is on its way — it usually lands within a minute.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Faucet request error'
    return res.status(500).json({ error: 'faucet_request_failed', message })
  }
}
