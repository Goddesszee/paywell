/**
 * api/recurring-tasks.ts
 * Vercel serverless handler for /api/recurring-tasks
 * Stores recurring payment tasks in Redis keyed by walletAddress.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis'

function walletKey(req: VercelRequest): string {
  return (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
}

function storeKey(wallet: string) { return `rt:${wallet}` }

interface StoredTask {
  id: string; name: string; recipient: string; amount: string
  active: boolean; frequency: string; nextRunAt?: string
  lastRun?: string; lastTxHash?: string; runCount: number; createdAt: string
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
    if (req.method === 'GET') return res.json({ success: true, tasks: [], warning: 'storage_not_configured' })
    return res.json({ success: true, warning: 'storage_not_configured' })
  }

  const key = storeKey(wallet)

  // GET — list all
  if (req.method === 'GET') {
    const list = (await kv.get<StoredTask[]>(key)) ?? []
    return res.json({ success: true, tasks: list })
  }

  // POST — create
  if (req.method === 'POST') {
    const body = req.body as Partial<StoredTask>
    if (!body.name || !body.recipient || !body.amount)
      return res.status(400).json({ success: false, error: 'name, recipient, amount required' })
    const list = (await kv.get<StoredTask[]>(key)) ?? []
    const task: StoredTask = {
      id: body.id ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      name: body.name, recipient: body.recipient, amount: body.amount,
      active: body.active ?? true, frequency: body.frequency ?? 'manual',
      nextRunAt: body.nextRunAt, lastRun: body.lastRun, lastTxHash: body.lastTxHash,
      runCount: body.runCount ?? 0, createdAt: body.createdAt ?? new Date().toISOString(),
    }
    list.push(task)
    await kv.set(key, list.slice(0, 200), { ex: 60 * 60 * 24 * 365 }) // 1 year
    return res.json({ success: true, task })
  }

  // PATCH /:id — update
  if (req.method === 'PATCH') {
    const id = (req.url ?? '').split('/').pop() ?? ''
    const list = (await kv.get<StoredTask[]>(key)) ?? []
    const idx = list.findIndex(t => t.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    list[idx] = { ...list[idx], ...(req.body as Partial<StoredTask>), id }
    await kv.set(key, list, { ex: 60 * 60 * 24 * 365 })
    return res.json({ success: true, task: list[idx] })
  }

  // DELETE /:id — remove
  if (req.method === 'DELETE') {
    const id = (req.url ?? '').split('/').pop() ?? ''
    const list = (await kv.get<StoredTask[]>(key)) ?? []
    await kv.set(key, list.filter(t => t.id !== id), { ex: 60 * 60 * 24 * 365 })
    return res.json({ success: true })
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' })
}
