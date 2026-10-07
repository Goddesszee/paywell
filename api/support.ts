/**
 * Vercel Serverless: /api/support
 * Handles support tickets with Redis persistence via Upstash KV.
 *
 * Routes (query param `route`):
 *   GET  route=tickets                          → list own tickets
 *   GET  route=ticket&id=TKT-xxx               → get single ticket
 *   POST route=tickets  { subject, message }   → create ticket
 *   POST route=reply    { id, message }        → reply to ticket
 *   GET  route=admin-tickets                   → admin: list all
 *   POST route=admin-reply { id, message, status } → admin reply/status
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getRedis, REDIS_NOT_CONFIGURED } from './_redis'

const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

interface SupportMessage { id: string; author: 'customer'|'admin'; content: string; timestamp: string }
interface SupportTicket {
  id: string; userEmail: string; subject: string
  status: 'open'|'in_progress'|'resolved'
  messages: SupportMessage[]; createdAt: string; updatedAt: string
  hasUnreadAdmin: boolean; hasUnreadCustomer: boolean
}

function ok(res: VercelResponse, body: unknown) { return res.status(200).json(body) }
function fail(res: VercelResponse, code: number, msg: string) { return res.status(code).json({ success: false, error: msg }) }

/** Decode email from sessionToken (Circle userToken JWT or btoa-encoded address) */
function emailFromToken(authHeader?: string): string | null {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return null
  // Try JWT payload decode (Circle userToken)
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>
      if (typeof payload.sub === 'string' && payload.sub) return payload.sub
      if (typeof payload.email === 'string') return payload.email
    }
  } catch { /* not a JWT */ }
  // Try btoa-encoded "email:timestamp" or "address:timestamp"
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [identity] = decoded.split(':')
    if (identity) return identity
  } catch { /* ignore */ }
  // Use token itself as identity key
  return token.slice(0, 64)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const redis = getRedis()
  const route = (req.query.route ?? (req.body as Record<string, unknown>)?.route) as string | undefined

  // ── Admin: list all tickets ──────────────────────────────────────────────
  if (route === 'admin-tickets' && req.method === 'GET') {
    if (!redis) return ok(res, { success: true, tickets: [] })
    const keys = await redis.keys('support:ticket:*')
    if (!keys.length) return ok(res, { success: true, tickets: [] })
    const tickets = (await redis.mget<SupportTicket[]>(...keys)).filter(Boolean) as SupportTicket[]
    tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return ok(res, { success: true, tickets })
  }

  // ── Admin: reply or change status ────────────────────────────────────────
  if (route === 'admin-reply' && req.method === 'POST') {
    if (!redis) return fail(res, 503, REDIS_NOT_CONFIGURED.message)
    const { id, message, status } = (req.body ?? {}) as { id?: string; message?: string; status?: string }
    if (!id) return fail(res, 400, 'id required')
    const ticket = await redis.get<SupportTicket>(`support:ticket:${id}`)
    if (!ticket) return fail(res, 404, 'Not found')
    const now = new Date().toISOString()
    if (message?.trim()) {
      ticket.messages.push({ id: `msg-${crypto.randomBytes(4).toString('hex')}`, author: 'admin', content: message.trim(), timestamp: now })
      ticket.hasUnreadAdmin = true
      ticket.hasUnreadCustomer = false
    }
    if (status && ['open','in_progress','resolved'].includes(status)) ticket.status = status as SupportTicket['status']
    ticket.updatedAt = now
    await redis.set(`support:ticket:${id}`, ticket)
    return ok(res, { success: true, ticket })
  }

  // ── User auth required from here ─────────────────────────────────────────
  const userEmail = emailFromToken(req.headers.authorization)
  if (!userEmail) return fail(res, 401, 'Unauthorized')

  // ── GET own tickets ───────────────────────────────────────────────────────
  if (route === 'tickets' && req.method === 'GET') {
    if (!redis) return ok(res, { success: true, tickets: [] })
    const keys = await redis.keys(`support:user:${userEmail}:*`)
    if (!keys.length) return ok(res, { success: true, tickets: [] })
    const ids = keys.map(k => k.replace(`support:user:${userEmail}:`, ''))
    const ticketKeys = ids.map(id => `support:ticket:${id}`)
    const tickets = (await redis.mget<SupportTicket[]>(...ticketKeys)).filter(Boolean) as SupportTicket[]
    tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return ok(res, { success: true, tickets })
  }

  // ── GET single ticket ─────────────────────────────────────────────────────
  if (route === 'ticket' && req.method === 'GET') {
    if (!redis) return fail(res, 503, REDIS_NOT_CONFIGURED.message)
    const { id } = req.query as { id?: string }
    if (!id) return fail(res, 400, 'id required')
    const ticket = await redis.get<SupportTicket>(`support:ticket:${id}`)
    if (!ticket) return fail(res, 404, 'Not found')
    if (ticket.userEmail !== userEmail) return fail(res, 403, 'Forbidden')
    ticket.hasUnreadAdmin = false
    await redis.set(`support:ticket:${id}`, ticket)
    return ok(res, { success: true, ticket })
  }

  // ── POST new ticket ───────────────────────────────────────────────────────
  if (route === 'tickets' && req.method === 'POST') {
    if (!redis) return fail(res, 503, REDIS_NOT_CONFIGURED.message)
    const { subject, message } = (req.body ?? {}) as { subject?: string; message?: string }
    if (!subject?.trim() || !message?.trim()) return fail(res, 400, 'subject and message required')
    const id = `TKT-${Date.now().toString(36).toUpperCase()}`
    const now = new Date().toISOString()
    const ticket: SupportTicket = {
      id, userEmail,
      subject: subject.trim().slice(0, 200),
      status: 'open',
      messages: [{ id: `msg-${crypto.randomBytes(4).toString('hex')}`, author: 'customer', content: message.trim(), timestamp: now }],
      createdAt: now, updatedAt: now,
      hasUnreadAdmin: false, hasUnreadCustomer: true,
    }
    await redis.set(`support:ticket:${id}`, ticket)
    await redis.set(`support:user:${userEmail}:${id}`, 1)
    return ok(res, { success: true, ticket })
  }

  // ── POST reply ────────────────────────────────────────────────────────────
  if (route === 'reply' && req.method === 'POST') {
    if (!redis) return fail(res, 503, REDIS_NOT_CONFIGURED.message)
    const { id, message } = (req.body ?? {}) as { id?: string; message?: string }
    if (!id || !message?.trim()) return fail(res, 400, 'id and message required')
    const ticket = await redis.get<SupportTicket>(`support:ticket:${id}`)
    if (!ticket) return fail(res, 404, 'Not found')
    if (ticket.userEmail !== userEmail) return fail(res, 403, 'Forbidden')
    const now = new Date().toISOString()
    ticket.messages.push({ id: `msg-${crypto.randomBytes(4).toString('hex')}`, author: 'customer', content: message.trim(), timestamp: now })
    ticket.updatedAt = now
    if (ticket.status === 'resolved') ticket.status = 'open'
    ticket.hasUnreadCustomer = true
    await redis.set(`support:ticket:${id}`, ticket)
    return ok(res, { success: true, ticket })
  }

  return fail(res, 400, 'Unknown route')
}
