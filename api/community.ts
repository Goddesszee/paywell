/**
 * /api/community — Vercel serverless function
 * Handles: feedback, suggestions, support tickets, notifications
 *
 * Requires Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN).
 * Add a Vercel KV / Upstash Redis store in the Vercel dashboard → Storage.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getRedis, REDIS_NOT_CONFIGURED } from './_redis'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ── types ─────────────────────────────────────────────────────────────────────

interface Session { email: string; walletAddress: string; walletId: string; createdAt: number }

interface FeedbackEntry {
  id: string; userEmail: string; rating: number; comment: string
  category: string; reviewed: boolean; createdAt: string
}

type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'implemented' | 'closed'
interface SuggestionEntry {
  id: string; userEmail: string; title: string; description: string
  category: string; status: SuggestionStatus; adminNote: string
  createdAt: string; updatedAt: string
}

interface SupportMessage { id: string; author: 'customer' | 'admin'; content: string; timestamp: string }
interface SupportTicket {
  id: string; userEmail: string; subject: string; status: 'open' | 'in_progress' | 'resolved'
  messages: SupportMessage[]; createdAt: string; updatedAt: string
  hasUnreadAdmin: boolean; hasUnreadCustomer: boolean
}

interface AppNotification {
  id: string; userEmail: string
  type: 'support' | 'support_reply' | 'system' | 'payment'
  title: string; body: string; read: boolean; createdAt: string; ticketId?: string
}

type RedisClient = NonNullable<ReturnType<typeof getRedis>>

// ── helpers ───────────────────────────────────────────────────────────────────

function genId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`
}

async function resolveSession(authHeader: string | undefined, kv: RedisClient): Promise<Session | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return await kv.get<Session>(`session:${token}`) ?? null }
  catch { return null }
}

async function pushNotif(kv: RedisClient, email: string, n: Omit<AppNotification, 'id' | 'userEmail' | 'read' | 'createdAt'>) {
  const entry: AppNotification = { ...n, id: genId('notif'), userEmail: email, read: false, createdAt: new Date().toISOString() }
  await kv.lpush(`notifs:${email}`, entry)
  await kv.ltrim(`notifs:${email}`, 0, 99)
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()

  const kv = getRedis()
  if (!kv) return res.status(503).json(REDIS_NOT_CONFIGURED)

  const routeParam = (req.query.route ?? '') as string
  const route = routeParam.replace(/^\/+/, '')
  const auth = req.headers.authorization as string | undefined
  const sess = await resolveSession(auth, kv)

  // ── feedback ─────────────────────────────────────────────────────────────────

  if (route === 'feedback' && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const { rating, comment = '', category = 'general' } = req.body as { rating: number; comment?: string; category?: string }
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'rating 1-5 required' })
    const entry: FeedbackEntry = {
      id: genId('fb'), userEmail: sess.email,
      rating: Math.round(rating), comment: String(comment).slice(0, 1000),
      category, reviewed: false, createdAt: new Date().toISOString(),
    }
    await kv.lpush('feedback:all', entry)
    await kv.ltrim('feedback:all', 0, 499)
    return res.status(200).json({ success: true, id: entry.id })
  }

  if (route === 'admin/feedback' && req.method === 'GET') {
    const all = (await kv.lrange<FeedbackEntry>('feedback:all', 0, 199)) ?? []
    const avg = all.length ? all.reduce((s, f) => s + f.rating, 0) / all.length : 0
    return res.status(200).json({ success: true, feedback: all, averageRating: Math.round(avg * 10) / 10, total: all.length })
  }

  if (route.startsWith('admin/feedback/') && route.endsWith('/review') && req.method === 'POST') {
    const id = route.split('/')[2]
    const all = (await kv.lrange<FeedbackEntry>('feedback:all', 0, 499)) ?? []
    const idx = all.findIndex(f => f.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    all[idx].reviewed = true
    await kv.del('feedback:all')
    if (all.length) await kv.rpush('feedback:all', ...all)
    return res.status(200).json({ success: true })
  }

  // ── suggestions ──────────────────────────────────────────────────────────────

  if (route === 'suggestions' && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const { title, description = '', category = 'general' } = req.body as { title: string; description?: string; category?: string }
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'title required' })
    const entry: SuggestionEntry = {
      id: genId('sug'), userEmail: sess.email,
      title: String(title).slice(0, 200), description: String(description).slice(0, 2000),
      category, status: 'new', adminNote: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }
    await kv.lpush('suggestions:all', entry)
    await kv.ltrim('suggestions:all', 0, 499)
    return res.status(200).json({ success: true, id: entry.id })
  }

  if (route === 'suggestions' && req.method === 'GET') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const all = (await kv.lrange<SuggestionEntry>('suggestions:all', 0, 499)) ?? []
    return res.status(200).json({ success: true, suggestions: all.filter(s => s.userEmail === sess.email) })
  }

  if (route === 'admin/suggestions' && req.method === 'GET') {
    const all = (await kv.lrange<SuggestionEntry>('suggestions:all', 0, 499)) ?? []
    return res.status(200).json({ success: true, suggestions: all })
  }

  if (route.startsWith('admin/suggestions/') && req.method === 'PATCH') {
    const id = route.split('/')[2]
    const all = (await kv.lrange<SuggestionEntry>('suggestions:all', 0, 499)) ?? []
    const idx = all.findIndex(s => s.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    const { status, adminNote } = req.body as { status?: SuggestionStatus; adminNote?: string }
    if (status) all[idx].status = status
    if (adminNote !== undefined) all[idx].adminNote = String(adminNote).slice(0, 1000)
    all[idx].updatedAt = new Date().toISOString()
    await kv.del('suggestions:all')
    if (all.length) await kv.rpush('suggestions:all', ...all)
    return res.status(200).json({ success: true, suggestion: all[idx] })
  }

  // ── support tickets ───────────────────────────────────────────────────────────

  if (route === 'support/tickets' && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const { subject, message } = req.body as { subject: string; message: string }
    if (!subject || !message) return res.status(400).json({ success: false, error: 'subject and message required' })
    const now = new Date().toISOString()
    const ticket: SupportTicket = {
      id: `TKT-${Date.now().toString(36).toUpperCase()}`,
      userEmail: sess.email, subject, status: 'open',
      messages: [{ id: genId('msg'), author: 'customer', content: message, timestamp: now }],
      createdAt: now, updatedAt: now, hasUnreadAdmin: false, hasUnreadCustomer: true,
    }
    await kv.set(`ticket:${ticket.id}`, ticket)
    await kv.lpush(`tickets:user:${sess.email}`, ticket.id)
    await kv.lpush('tickets:all', ticket.id)
    await pushNotif(kv, sess.email, {
      type: 'support', title: 'Support request received',
      body: `Your request "${subject}" has been submitted. We'll get back to you shortly.`,
      ticketId: ticket.id,
    })
    return res.status(200).json({ success: true, ticket })
  }

  if (route === 'support/tickets' && req.method === 'GET') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const ids = (await kv.lrange<string>(`tickets:user:${sess.email}`, 0, 49)) ?? []
    const tickets = (await Promise.all(ids.map(id => kv.get<SupportTicket>(`ticket:${id}`)))).filter(Boolean) as SupportTicket[]
    return res.status(200).json({ success: true, tickets: tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) })
  }

  if (route.startsWith('support/tickets/') && !route.endsWith('/reply') && req.method === 'GET') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const id = route.split('/')[2]
    const ticket = await kv.get<SupportTicket>(`ticket:${id}`)
    if (!ticket) return res.status(404).json({ success: false, error: 'Not found' })
    if (ticket.userEmail !== sess.email) return res.status(403).json({ success: false, error: 'Forbidden' })
    ticket.hasUnreadAdmin = false
    await kv.set(`ticket:${id}`, ticket)
    return res.status(200).json({ success: true, ticket })
  }

  if (route.startsWith('support/tickets/') && route.endsWith('/reply') && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const id = route.split('/')[2]
    const ticket = await kv.get<SupportTicket>(`ticket:${id}`)
    if (!ticket) return res.status(404).json({ success: false, error: 'Not found' })
    if (ticket.userEmail !== sess.email) return res.status(403).json({ success: false, error: 'Forbidden' })
    const { message } = req.body as { message: string }
    if (!message) return res.status(400).json({ success: false, error: 'message required' })
    const now = new Date().toISOString()
    ticket.messages.push({ id: genId('msg'), author: 'customer', content: message, timestamp: now })
    ticket.updatedAt = now
    if (ticket.status === 'resolved') ticket.status = 'open'
    ticket.hasUnreadCustomer = true
    await kv.set(`ticket:${id}`, ticket)
    return res.status(200).json({ success: true, ticket })
  }

  if (route === 'admin/support/tickets' && req.method === 'GET') {
    const ids = (await kv.lrange<string>('tickets:all', 0, 199)) ?? []
    const tickets = (await Promise.all(ids.map(id => kv.get<SupportTicket>(`ticket:${id}`)))).filter(Boolean) as SupportTicket[]
    return res.status(200).json({ success: true, tickets: tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) })
  }

  if (route.startsWith('admin/support/tickets/') && route.endsWith('/reply') && req.method === 'POST') {
    const id = route.split('/')[3]
    const ticket = await kv.get<SupportTicket>(`ticket:${id}`)
    if (!ticket) return res.status(404).json({ success: false, error: 'Not found' })
    const { message, status } = req.body as { message?: string; status?: SupportTicket['status'] }
    const now = new Date().toISOString()
    if (message) {
      ticket.messages.push({ id: genId('msg'), author: 'admin', content: message, timestamp: now })
      ticket.hasUnreadAdmin = true
      ticket.hasUnreadCustomer = false
      await pushNotif(kv, ticket.userEmail, {
        type: 'support_reply', title: 'Support response received',
        body: `An admin replied to your request "${ticket.subject}".`,
        ticketId: ticket.id,
      })
    }
    if (status) ticket.status = status
    ticket.updatedAt = now
    await kv.set(`ticket:${id}`, ticket)
    return res.status(200).json({ success: true, ticket })
  }

  // ── notifications ─────────────────────────────────────────────────────────────

  if (route === 'notifications' && req.method === 'GET') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const list = (await kv.lrange<AppNotification>(`notifs:${sess.email}`, 0, 99)) ?? []
    return res.status(200).json({ success: true, notifications: list })
  }

  if (route === 'notifications/read' && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const { id, all } = req.body as { id?: string; all?: boolean }
    const key = `notifs:${sess.email}`
    const list = (await kv.lrange<AppNotification>(key, 0, 99)) ?? []
    const updated = all
      ? list.map(n => ({ ...n, read: true }))
      : list.map(n => (!id || n.id === id) ? { ...n, read: true } : n)
    await kv.del(key)
    if (updated.length) await kv.rpush(key, ...updated)
    return res.status(200).json({ success: true })
  }

  return res.status(404).json({ success: false, error: `Unknown route: ${route}` })
}
