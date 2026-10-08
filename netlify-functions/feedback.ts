/**
 * Netlify Function: /api/feedback and /api/admin/feedback
 * Handles user feedback submissions and admin reads.
 * In-memory store survives warm lambdas; for production wire up Upstash Redis.
 */
import type { Handler } from '@netlify/functions'
import { genToken, getSession } from './_shared'

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

interface FeedbackEntry {
  id: string
  userEmail: string
  rating: number
  comment: string
  category: string
  reviewed: boolean
  createdAt: string
}

const feedbackStore: FeedbackEntry[] = []

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' }

  const path = event.path ?? ''
  const isAdmin = path.includes('/admin/')

  // ── Admin: GET all feedback ──────────────────────────────────────────────
  if (isAdmin && event.httpMethod === 'GET') {
    const avg = feedbackStore.length
      ? feedbackStore.reduce((s, f) => s + f.rating, 0) / feedbackStore.length
      : 0
    return {
      statusCode: 200, headers: HEADERS,
      body: JSON.stringify({ success: true, feedback: feedbackStore, averageRating: Math.round(avg * 10) / 10, total: feedbackStore.length }),
    }
  }

  // ── Admin: mark reviewed ─────────────────────────────────────────────────
  if (isAdmin && event.httpMethod === 'POST') {
    const idMatch = path.match(/\/([^/]+)\/review$/)
    const entry = idMatch ? feedbackStore.find(f => f.id === idMatch[1]) : null
    if (entry) entry.reviewed = true
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) }
  }

  // ── User: POST feedback ──────────────────────────────────────────────────
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) }

  const session = getSession(event.headers['authorization'] ?? event.headers['Authorization'])
  if (!session) return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ success: false, error: 'Unauthorized' }) }

  const body = JSON.parse(event.body ?? '{}') as { rating?: number; comment?: string; category?: string }
  const { rating, comment = '', category = 'general' } = body

  if (!rating || rating < 1 || rating > 5) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ success: false, error: 'rating 1-5 required' }) }
  }

  const entry: FeedbackEntry = {
    id: `fb-${genToken(8)}`,
    userEmail: session.email,
    rating: Math.round(rating),
    comment: String(comment).slice(0, 1000),
    category,
    reviewed: false,
    createdAt: new Date().toISOString(),
  }
  feedbackStore.unshift(entry)

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, id: entry.id }) }
}
