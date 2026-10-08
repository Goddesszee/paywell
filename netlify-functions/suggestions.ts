/**
 * Netlify Function: /api/suggestions and /api/admin/suggestions
 */
import type { Handler } from '@netlify/functions'
import { genToken, getSession } from './_shared'

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'implemented' | 'closed'

interface SuggestionEntry {
  id: string
  userEmail: string
  title: string
  description: string
  category: string
  status: SuggestionStatus
  adminNote: string
  createdAt: string
  updatedAt: string
}

const suggestionStore: SuggestionEntry[] = []

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' }

  const path = event.path ?? ''
  const isAdmin = path.includes('/admin/')

  // ── Admin: GET all suggestions ───────────────────────────────────────────
  if (isAdmin && event.httpMethod === 'GET') {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, suggestions: suggestionStore }) }
  }

  // ── Admin: PATCH status/note ─────────────────────────────────────────────
  if (isAdmin && (event.httpMethod === 'PATCH' || event.httpMethod === 'POST')) {
    const idMatch = path.match(/\/suggestions\/([^/]+)$/)
    const entry = idMatch ? suggestionStore.find(s => s.id === idMatch[1]) : null
    if (!entry) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Not found' }) }
    const body = JSON.parse(event.body ?? '{}') as { status?: SuggestionStatus; adminNote?: string }
    if (body.status) entry.status = body.status
    if (body.adminNote !== undefined) entry.adminNote = String(body.adminNote).slice(0, 1000)
    entry.updatedAt = new Date().toISOString()
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, suggestion: entry }) }
  }

  // ── User: GET own suggestions ────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const session = getSession(event.headers['authorization'] ?? event.headers['Authorization'])
    if (!session) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Unauthorized' }) }
    const mine = suggestionStore.filter(s => s.userEmail === session.email)
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, suggestions: mine }) }
  }

  // ── User: POST new suggestion ────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) }

  const session = getSession(event.headers['authorization'] ?? event.headers['Authorization'])
  if (!session) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Unauthorized' }) }

  const body = JSON.parse(event.body ?? '{}') as { title?: string; description?: string; category?: string }
  if (!body.title?.trim()) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ success: false, error: 'title required' }) }
  }

  const now = new Date().toISOString()
  const entry: SuggestionEntry = {
    id: `sug-${genToken(8)}`,
    userEmail: session.email,
    title: String(body.title).slice(0, 200),
    description: String(body.description ?? '').slice(0, 2000),
    category: body.category ?? 'feature',
    status: 'new',
    adminNote: '',
    createdAt: now,
    updatedAt: now,
  }
  suggestionStore.unshift(entry)

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, id: entry.id }) }
}
