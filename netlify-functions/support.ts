/**
 * Netlify Function: /api/support/* and /api/admin/support/*
 * Handles support ticket creation, replies, and admin management.
 */
import type { Handler } from '@netlify/functions'
import { getSession } from './_shared'

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

interface SupportMessage {
  id: string
  author: 'customer' | 'admin'
  content: string
  timestamp: string
}

interface SupportTicket {
  id: string
  userEmail: string
  subject: string
  status: 'open' | 'in_progress' | 'resolved'
  messages: SupportMessage[]
  createdAt: string
  updatedAt: string
  hasUnreadAdmin: boolean
  hasUnreadCustomer: boolean
}

const supportStore = new Map<string, SupportTicket>()

function ok(body: unknown) {
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }
}
function err(code: number, msg: string) {
  return { statusCode: code, headers: HEADERS, body: JSON.stringify({ success: false, error: msg }) }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' }

  const path = event.path ?? ''
  const method = event.httpMethod
  const isAdmin = path.includes('/admin/')

  // ── Admin: GET all tickets ───────────────────────────────────────────────
  if (isAdmin && method === 'GET' && path.match(/\/admin\/support\/tickets\s*$/)) {
    const all = [...supportStore.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return ok({ success: true, tickets: all })
  }

  // ── Admin: reply or change status ────────────────────────────────────────
  if (isAdmin && method === 'POST') {
    const idMatch = path.match(/\/tickets\/([^/]+)\/reply/)
    if (idMatch) {
      const ticket = supportStore.get(idMatch[1])
      if (!ticket) return err(404, 'Not found')
      const body = JSON.parse(event.body ?? '{}') as { message?: string; status?: SupportTicket['status'] }
      const now = new Date().toISOString()
      if (body.message) {
        ticket.messages.push({ id: `msg-${Date.now()}`, author: 'admin', content: body.message, timestamp: now })
        ticket.hasUnreadAdmin = true
        ticket.hasUnreadCustomer = false
      }
      if (body.status) ticket.status = body.status
      ticket.updatedAt = now
      return ok({ success: true, ticket })
    }
    // mark read
    const readMatch = path.match(/\/tickets\/([^/]+)\/read/)
    if (readMatch) {
      const ticket = supportStore.get(readMatch[1])
      if (ticket) ticket.hasUnreadCustomer = false
      return ok({ success: true })
    }
  }

  // ── User: require session from here ─────────────────────────────────────
  const session = getSession(event.headers['authorization'] ?? event.headers['Authorization'])
  if (!session) return err(401, 'Unauthorized')

  // ── User: GET all own tickets ────────────────────────────────────────────
  if (method === 'GET' && path.match(/\/support\/tickets\s*$/)) {
    const tickets = [...supportStore.values()]
      .filter(t => t.userEmail === session.email)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return ok({ success: true, tickets })
  }

  // ── User: GET single ticket ──────────────────────────────────────────────
  if (method === 'GET') {
    const idMatch = path.match(/\/tickets\/([^/]+)$/)
    if (idMatch) {
      const ticket = supportStore.get(idMatch[1])
      if (!ticket) return err(404, 'Not found')
      if (ticket.userEmail !== session.email) return err(403, 'Forbidden')
      ticket.hasUnreadAdmin = false
      return ok({ success: true, ticket })
    }
  }

  // ── User: POST new ticket ────────────────────────────────────────────────
  if (method === 'POST' && path.match(/\/support\/tickets\s*$/)) {
    const body = JSON.parse(event.body ?? '{}') as { subject?: string; message?: string }
    if (!body.subject || !body.message) return err(400, 'subject and message required')
    const id = `TKT-${Date.now().toString(36).toUpperCase()}`
    const now = new Date().toISOString()
    const ticket: SupportTicket = {
      id, userEmail: session.email,
      subject: String(body.subject).slice(0, 200),
      status: 'open',
      messages: [{ id: `msg-${Date.now()}`, author: 'customer', content: body.message, timestamp: now }],
      createdAt: now, updatedAt: now,
      hasUnreadAdmin: false, hasUnreadCustomer: true,
    }
    supportStore.set(id, ticket)
    return ok({ success: true, ticket })
  }

  // ── User: reply to ticket ────────────────────────────────────────────────
  if (method === 'POST') {
    const idMatch = path.match(/\/tickets\/([^/]+)\/reply/)
    if (idMatch) {
      const ticket = supportStore.get(idMatch[1])
      if (!ticket) return err(404, 'Not found')
      if (ticket.userEmail !== session.email) return err(403, 'Forbidden')
      const body = JSON.parse(event.body ?? '{}') as { message?: string }
      if (!body.message) return err(400, 'message required')
      const now = new Date().toISOString()
      ticket.messages.push({ id: `msg-${Date.now()}`, author: 'customer', content: body.message, timestamp: now })
      ticket.updatedAt = now
      if (ticket.status === 'resolved') ticket.status = 'open'
      ticket.hasUnreadCustomer = true
      return ok({ success: true, ticket })
    }
  }

  return err(404, 'Not found')
}
