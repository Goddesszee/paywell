/**
 * api/payments-data.ts — merged handler for payment-requests and recurring-tasks
 * Replaces api/payment-requests.ts and api/recurring-tasks.ts (both deleted).
 *
 * Route selection via query param:  ?type=payment-requests | recurring-tasks
 * All CRUD operations use the same method semantics as before.
 * The id for PATCH/DELETE is passed as ?id=<id>.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis'

function walletKey(req: VercelRequest): string {
  return (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
}

// ── Payment Request types ──────────────────────────────────────────────────────
interface StoredPR {
  id: string; refNumber: string; title: string; description?: string
  recipientName?: string; amount: number; currency: string; note?: string
  reference?: string; dueDate?: string; createdAt: string; status: string
  paidAt?: string; paidTxHash?: string; paidAmount?: number; creatorAddress?: string
  updatedAt: string
}

// ── Recurring Task types ───────────────────────────────────────────────────────
interface StoredTask {
  id: string; name: string; recipient: string; amount: string
  active: boolean; frequency: string; nextRunAt?: string
  lastRun?: string; lastTxHash?: string; runCount: number; createdAt: string
}

function rand() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-wallet-address, authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const type = (req.query.type ?? '') as string
  const wallet = walletKey(req)
  if (!wallet) return res.status(401).json({ success: false, error: 'x-wallet-address header required' })

  const kv = getRedis()

  // ── PAYMENT REQUESTS ────────────────────────────────────────────────────────
  if (type === 'payment-requests') {
    const storeKey = `pr:${wallet}`

    if (!kv) {
      if (req.method === 'GET') return res.json({ success: true, requests: [], warning: 'storage_not_configured' })
      return res.json({ success: true, warning: 'storage_not_configured' })
    }

    if (req.method === 'GET') {
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      return res.json({ success: true, requests: list })
    }

    if (req.method === 'POST') {
      const body = req.body as Partial<StoredPR>
      if (!body.title || !body.amount || !body.currency)
        return res.status(400).json({ success: false, error: 'title, amount, currency required' })
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      const seq = (list.length + 1).toString().padStart(4, '0')
      const pr: StoredPR = {
        id: body.id ?? `pr-${rand()}`,
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
      await kv.set(storeKey, list.slice(0, 500), { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true, request: pr })
    }

    if (req.method === 'PATCH') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      const idx = list.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
      list[idx] = { ...list[idx], ...(req.body as Partial<StoredPR>), id, updatedAt: new Date().toISOString() }
      await kv.set(storeKey, list, { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true, request: list[idx] })
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      await kv.set(storeKey, list.filter(r => r.id !== id), { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── RECURRING TASKS ─────────────────────────────────────────────────────────
  if (type === 'recurring-tasks') {
    const storeKey = `rt:${wallet}`

    if (!kv) {
      if (req.method === 'GET') return res.json({ success: true, tasks: [], warning: 'storage_not_configured' })
      return res.json({ success: true, warning: 'storage_not_configured' })
    }

    if (req.method === 'GET') {
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      return res.json({ success: true, tasks: list })
    }

    if (req.method === 'POST') {
      const body = req.body as Partial<StoredTask>
      if (!body.name || !body.recipient || !body.amount)
        return res.status(400).json({ success: false, error: 'name, recipient, amount required' })
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      const task: StoredTask = {
        id: body.id ?? `rec-${rand()}`,
        name: body.name, recipient: body.recipient, amount: body.amount,
        active: body.active ?? true, frequency: body.frequency ?? 'manual',
        nextRunAt: body.nextRunAt, lastRun: body.lastRun, lastTxHash: body.lastTxHash,
        runCount: body.runCount ?? 0, createdAt: body.createdAt ?? new Date().toISOString(),
      }
      list.push(task)
      await kv.set(storeKey, list.slice(0, 200), { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true, task })
    }

    if (req.method === 'PATCH') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      const idx = list.findIndex(t => t.id === id)
      if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
      list[idx] = { ...list[idx], ...(req.body as Partial<StoredTask>), id }
      await kv.set(storeKey, list, { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true, task: list[idx] })
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      await kv.set(storeKey, list.filter(t => t.id !== id), { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  return res.status(400).json({ success: false, error: 'type param required: payment-requests | recurring-tasks' })
}
