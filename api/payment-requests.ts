/**
 * api/payment-requests.ts
 * Vercel serverless handler for /api/payment-requests
 * Stores payment requests in Redis keyed by walletAddress.
 * Falls back gracefully when Redis is not configured.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis'

function walletKey(req: VercelRequest): string {
  const w = (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
  return w || ''
}

function storeKey(wallet: string) { return `pr:${wallet}` }

interface StoredPR {
  id: string; refNumber: string; title: string; description?: string
  recipientName?: string; amount: number; currency: string; note?: string
  reference?: string; dueDate?: string; createdAt: string; status: string
  paidAt?: string; paidTxHash?: string; paidAmount?: number; creatorAddress?: string
  updatedAt: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-wallet-address, authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const wallet = walletKey(req)
  if (!wallet) return res.status(401).json({ success: false, error: 'x-wallet-address header required' })

  const kv = getRedis()
  if (!kv) {
    // No Redis — return empty list on GET, accept writes as no-ops with a warning
    if (req.method === 'GET') return res.json({ success: true, requests: [], warning: 'storage_not_configured' })
    return res.json({ success: true, warning: 'storage_not_configured' })
  }

  const key = storeKey(wallet)

  // GET — list all
  if (req.method === 'GET') {
    const list = (await kv.get<StoredPR[]>(key)) ?? []
    return res.json({ success: true, requests: list })
  }

  // POST — create
  if (req.method === 'POST') {
    const body = req.body as Partial<StoredPR>
    if (!body.title || !body.amount || !body.currency)
      return res.status(400).json({ success: false, error: 'title, amount, currency required' })
    const list = (await kv.get<StoredPR[]>(key)) ?? []
    const seq = (list.length + 1).toString().padStart(4, '0')
    const pr: StoredPR = {
      id: body.id ?? `pr-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      refNumber: body.refNumber ?? `NAN-PR-${seq}`,
      title: body.title, description: body.description,
      recipientName: body.recipientName, amount: Number(body.amount),
      currency: body.currency, note: body.note, reference: body.reference,
      dueDate: body.dueDate, createdAt: body.createdAt ?? new Date().toISOString(),
      status: body.status ?? 'pending', paidAt: body.paidAt, paidTxHash: body.paidTxHash,
      paidAmount: body.paidAmount, creatorAddress: body.creatorAddress ?? wallet,
      updatedAt: new Date().toISOString(),
    }
    list.unshift(pr)
    await kv.set(key, list.slice(0, 500), { ex: 60 * 60 * 24 * 90 }) // 90 days
    return res.json({ success: true, request: pr })
  }

  // PATCH /:id — update
  if (req.method === 'PATCH') {
    const id = (req.url ?? '').split('/').pop() ?? ''
    const list = (await kv.get<StoredPR[]>(key)) ?? []
    const idx = list.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    list[idx] = { ...list[idx], ...(req.body as Partial<StoredPR>), id, updatedAt: new Date().toISOString() }
    await kv.set(key, list, { ex: 60 * 60 * 24 * 90 })
    return res.json({ success: true, request: list[idx] })
  }

  // DELETE /:id — remove
  if (req.method === 'DELETE') {
    const id = (req.url ?? '').split('/').pop() ?? ''
    const list = (await kv.get<StoredPR[]>(key)) ?? []
    await kv.set(key, list.filter(r => r.id !== id), { ex: 60 * 60 * 24 * 90 })
    return res.json({ success: true })
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' })
}
