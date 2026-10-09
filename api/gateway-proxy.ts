/**
 * api/gateway-proxy.ts
 *
 * Server-side passthrough to the Circle Gateway REST API.
 * Required for the passkey (Circle Modular Wallet) transfer path in GatewayPage.tsx:
 * direct browser fetch to gateway-api-testnet.circle.com hits CORS preflight rejection.
 *
 * Actions (passed as ?action=<action>):
 *   gateway-transfer  POST  POST /v1/transfer[?enableForwarder=true]
 *   gateway-poll      POST  GET  /v1/transfer/:transferId
 *   gateway-estimate  POST  POST /v1/estimate[?enableForwarder=true]
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const GATEWAY_BASE = 'https://gateway-api-testnet.circle.com/v1'

function bigintReplacer(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = (req.query.action ?? '') as string

  // ── gateway-transfer ──────────────────────────────────────────────────────
  if (action === 'gateway-transfer') {
    const { items, enableForwarder } = req.body as {
      items?: unknown[]
      enableForwarder?: boolean
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' })
    }

    const url = enableForwarder
      ? `${GATEWAY_BASE}/transfer?enableForwarder=true`
      : `${GATEWAY_BASE}/transfer`

    try {
      const gwRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items, bigintReplacer),
      })
      const text = await gwRes.text()
      res.setHeader('content-type', 'application/json')
      return res.status(gwRes.status).send(text)
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway transfer failed' })
    }
  }

  // ── gateway-poll ──────────────────────────────────────────────────────────
  if (action === 'gateway-poll') {
    const { transferId } = req.body as { transferId?: string }
    if (!transferId) return res.status(400).json({ error: 'transferId required' })

    try {
      const pollRes = await fetch(`${GATEWAY_BASE}/transfer/${transferId}`)
      const text = await pollRes.text()
      res.setHeader('content-type', 'application/json')
      return res.status(pollRes.status).send(text)
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway poll failed' })
    }
  }

  // ── gateway-estimate ──────────────────────────────────────────────────────
  if (action === 'gateway-estimate') {
    const { items, enableForwarder } = req.body as {
      items?: unknown[]
      enableForwarder?: boolean
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' })
    }

    const url = enableForwarder
      ? `${GATEWAY_BASE}/estimate?enableForwarder=true`
      : `${GATEWAY_BASE}/estimate`

    try {
      const gwRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items, bigintReplacer),
      })
      const text = await gwRes.text()
      res.setHeader('content-type', 'application/json')
      return res.status(gwRes.status).send(text)
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Gateway estimate failed' })
    }
  }

  return res.status(400).json({ error: 'action param required: gateway-transfer | gateway-poll | gateway-estimate' })
}
