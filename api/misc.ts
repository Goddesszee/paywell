/**
 * /api/misc — consolidated miscellaneous handler
 * Merges activity-feed, agent-registry, faucet, and gateway-proxy to stay under
 * Vercel Hobby's 12-function limit.
 *
 * Routes:
 *   GET  ?route=activity-feed&address=0x…      returns empty tx list (activity from onchain getLogs)
 *   GET  ?route=agent-registry                  returns the SERVICE_REGISTRY list
 *   POST ?route=faucet  { address }             drips testnet USDC via Circle faucet
 *   POST ?route=gateway&action=modular-rpc      proxies modular SDK JSON-RPC call
 *   POST ?route=gateway&action=gateway-transfer submits a Gateway burn intent
 *   POST ?route=gateway&action=gateway-poll     polls a Gateway transfer
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

  // ── POST gateway proxy ─────────────────────────────────────────────────────
  if (route === 'gateway') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1'
    const MODULAR_SDK = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
    const action = req.query.action as string | undefined

    try {
      if (action === 'modular-rpc') {
        const { chain, clientKey, body } = req.body as { chain: string; clientKey: string; body: unknown }
        if (!chain || !clientKey || !body) return res.status(400).json({ error: 'chain, clientKey, and body are required' })
        const upstream = await fetch(`${MODULAR_SDK}/${chain}?clientKey=${encodeURIComponent(clientKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const text = await upstream.text()
        return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
      }

      if (action === 'gateway-transfer') {
        const { items, enableForwarder } = req.body as { items: unknown[]; enableForwarder?: boolean }
        if (!items?.length) return res.status(400).json({ error: 'items array required' })
        const url = enableForwarder ? `${GATEWAY_API}/transfer?enableForwarder=true` : `${GATEWAY_API}/transfer`
        const upstream = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items),
        })
        if (!upstream.ok) {
          const text = await upstream.text()
          return res.status(upstream.status).json({ error: `Gateway API ${upstream.status}: ${text}` })
        }
        return res.status(200).json(await upstream.json())
      }

      if (action === 'gateway-poll') {
        const { transferId } = req.body as { transferId: string }
        if (!transferId) return res.status(400).json({ error: 'transferId required' })
        const upstream = await fetch(`${GATEWAY_API}/transfer/${transferId}`)
        if (!upstream.ok) return res.status(upstream.status).json({ error: 'poll failed' })
        return res.status(200).json(await upstream.json())
      }

      return res.status(400).json({ error: `Unknown gateway action: ${String(action)}` })
    } catch (e: unknown) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
    }
  }

  return res.status(400).json({ error: 'Unknown route.' })
}
