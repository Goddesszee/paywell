/**
 * api/gateway-proxy.ts — Proxy for Circle Modular SDK and Gateway API calls.
 *
 * Solves the CORS problem: the browser can't call modular-sdk.circle.com
 * or gateway-api-testnet.circle.com directly from nanarc.xyz because those
 * endpoints only allow requests from whitelisted domains.
 *
 * The frontend posts the sign+submit request body here; this function:
 *  1. Forwards the signTypedData call to modular-sdk.circle.com (no CORS from server)
 *  2. Submits the burn intent to the Gateway API
 *  3. Polls until confirmed/finalized
 *  4. Returns the transferId (forwarded) or attestation+operatorSig (direct)
 *
 * For the passkey path the browser still handles WebAuthn (biometric prompt)
 * — we only proxy the SDK RPC calls that fail due to CORS.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1'
const MODULAR_SDK = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action } = req.query

  try {
    // ── Action: proxy a modular SDK JSON-RPC call ─────────────────────────────
    if (action === 'modular-rpc') {
      const { chain, clientKey, body } = req.body as {
        chain: string
        clientKey: string
        body: unknown
      }
      if (!chain || !clientKey || !body) {
        return res.status(400).json({ error: 'chain, clientKey, and body are required' })
      }
      const upstream = await fetch(`${MODULAR_SDK}/${chain}?clientKey=${encodeURIComponent(clientKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await upstream.text()
      return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
    }

    // ── Action: submit burn intent to Gateway API ─────────────────────────────
    if (action === 'gateway-transfer') {
      const { items, enableForwarder } = req.body as {
        items: unknown[]
        enableForwarder?: boolean
      }
      if (!items?.length) return res.status(400).json({ error: 'items array required' })

      const url = enableForwarder
        ? `${GATEWAY_API}/transfer?enableForwarder=true`
        : `${GATEWAY_API}/transfer`

      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      })
      if (!upstream.ok) {
        const text = await upstream.text()
        return res.status(upstream.status).json({ error: `Gateway API ${upstream.status}: ${text}` })
      }
      const json = await upstream.json() as Record<string, unknown>
      return res.status(200).json(json)
    }

    // ── Action: poll Gateway transfer status ──────────────────────────────────
    if (action === 'gateway-poll') {
      const { transferId } = req.body as { transferId: string }
      if (!transferId) return res.status(400).json({ error: 'transferId required' })

      const upstream = await fetch(`${GATEWAY_API}/transfer/${transferId}`)
      if (!upstream.ok) return res.status(upstream.status).json({ error: 'poll failed' })
      const json = await upstream.json()
      return res.status(200).json(json)
    }

    return res.status(400).json({ error: `Unknown action: ${String(action)}` })
  } catch (e: unknown) {
    console.error('[gateway-proxy]', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
  }
}
