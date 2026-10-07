/**
 * /api/misc — consolidated miscellaneous handler
 * Merges activity-feed, agent-registry, and faucet to stay under Vercel Hobby's 12-function limit.
 *
 * Routes:
 *   GET  ?route=activity-feed&address=0x…   returns empty tx list (activity from onchain getLogs)
 *   GET  ?route=agent-registry               returns the SERVICE_REGISTRY list
 *   POST ?route=faucet  { address }          drips testnet USDC via Circle faucet
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAddress } from 'viem'
import { SERVICE_REGISTRY } from '../src/lib/agent-registry'

// ── faucet config ─────────────────────────────────────────────────────────────
const FAUCET_URL  = 'https://api.circle.com/v1/faucet/drips'
const BLOCKCHAIN  = 'ARC-TESTNET'
const COOLDOWN_MS = 24 * 60 * 60 * 1000
const lastRequestByAddress = new Map<string, number>()

function faucetApiKey() {
  return process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const route = (req.query.route ?? req.body?.route) as string | undefined

  // ── GET activity-feed ──────────────────────────────────────────────────────
  if (route === 'activity-feed') {
    const { address } = req.query
    if (!address) return res.status(400).json({ error: 'address required' })
    return res.status(200).json({ transactions: [] })
  }

  // ── GET agent-registry ─────────────────────────────────────────────────────
  if (route === 'agent-registry') {
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.status(200).json({ services: SERVICE_REGISTRY, count: SERVICE_REGISTRY.length })
  }

  // ── POST faucet ────────────────────────────────────────────────────────────
  if (route === 'faucet') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const key = faucetApiKey()
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
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ address, blockchain: BLOCKCHAIN, usdc: true }),
      })

      if (!circleRes.ok) {
        const errBody = await circleRes.json().catch(() => ({}))
        const message = (errBody as { message?: string })?.message ?? `Circle faucet request failed (HTTP ${circleRes.status})`
        if (circleRes.status === 429) return res.status(429).json({ error: 'cooldown', message })
        return res.status(circleRes.status).json({ error: 'faucet_request_failed', message })
      }

      lastRequestByAddress.set(normalized, now)
      return res.status(200).json({ ok: true, message: 'Testnet USDC is on its way — it usually lands within a minute.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Faucet request error'
      return res.status(500).json({ error: 'faucet_request_failed', message })
    }
  }

  return res.status(400).json({ error: 'Unknown route.' })
}
