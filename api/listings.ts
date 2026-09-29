import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis, REDIS_NOT_CONFIGURED } from './_redis'

const PENDING_KEY = 'pw:listings:pending'
const APPROVED_KEY = 'pw:listings:approved'

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const redis = getRedis()
  if (!redis) return res.status(503).json(REDIS_NOT_CONFIGURED)

  if (req.method === 'GET') {
    const [pending, approved] = await Promise.all([
      redis.get<unknown[]>(PENDING_KEY),
      redis.get<unknown[]>(APPROVED_KEY),
    ])
    return res.status(200).json({ pending: pending ?? [], approved: approved ?? [] })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body ?? {}) as Record<string, unknown>
  const action = body.action

  try {
    if (action === 'create') {
      const listing = body.listing as Record<string, unknown>
      if (!listing || !listing.name || !listing.merchantWallet) {
        return res.status(400).json({ error: 'Missing required listing fields' })
      }
      const created = { ...listing, id: `lst-${uid()}`, submittedAt: new Date().toISOString() }
      const pending = (await redis.get<unknown[]>(PENDING_KEY)) ?? []
      const updated = [...pending, created]
      await redis.set(PENDING_KEY, updated)
      return res.status(200).json({ listing: created, pending: updated })
    }

    if (action === 'approve') {
      const { id, shopProduct } = body as { id?: string; shopProduct?: Record<string, unknown> }
      if (!id || !shopProduct) return res.status(400).json({ error: 'id and shopProduct are required' })

      const pending = (await redis.get<Record<string, unknown>[]>(PENDING_KEY)) ?? []
      const approved = (await redis.get<Record<string, unknown>[]>(APPROVED_KEY)) ?? []

      const listingIdx = pending.findIndex((l) => l.id === id)
      if (listingIdx === -1) return res.status(404).json({ error: 'Listing not found' })

      const updatedPending = pending.map((l) => (l.id === id ? { ...l, status: 'approved' } : l))
      const product = { ...shopProduct, id: `sp-${uid()}`, listedAt: new Date().toISOString() }
      const updatedApproved = [product, ...approved.filter((p) => p.id !== product.id)]

      await Promise.all([
        redis.set(PENDING_KEY, updatedPending),
        redis.set(APPROVED_KEY, updatedApproved),
      ])
      return res.status(200).json({ pending: updatedPending, approved: updatedApproved })
    }

    if (action === 'reject') {
      const { id } = body as { id?: string }
      if (!id) return res.status(400).json({ error: 'id is required' })

      const pending = (await redis.get<Record<string, unknown>[]>(PENDING_KEY)) ?? []
      const updatedPending = pending.map((l) => (l.id === id ? { ...l, status: 'rejected' } : l))
      await redis.set(PENDING_KEY, updatedPending)
      return res.status(200).json({ pending: updatedPending })
    }

    return res.status(400).json({ error: `Unknown action: ${String(action)}` })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Listings request failed'
    return res.status(500).json({ error: 'listings_request_failed', message })
  }
}
