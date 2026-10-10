/**
 * /api/community — Vercel serverless function
 * Handles: feedback, suggestions, support tickets, notifications
 *
 * Requires Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN).
 * Add a Vercel KV / Upstash Redis store in the Vercel dashboard → Storage.
 *
 * Route dispatch:
 *   Simple routes:    ?route=feedback          (no :id)
 *   Parameterised:    ?route=support/tickets/item&_id=TKT-xxx
 *                     ?route=support/tickets/reply&_id=TKT-xxx
 *   (Vercel cannot interpolate :id into query strings, so vercel.json passes
 *   the real id as a separate ?_id= param and uses a simplified route name.)
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

  // 1. Try Redis (works for OTP tokens stored at login time)
  try {
    const stored = await kv.get<Session>(`session:${token}`)
    if (stored?.email) return stored
  } catch { /* fall through */ }

  // 2. JWT decode — handles Circle userToken (3-part dot-separated JWT)
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
      const identity = (payload.sub ?? payload.email ?? payload.userId ?? '') as string
      if (identity) return { email: identity, walletAddress: '', walletId: '', createdAt: 0 }
    }
  } catch { /* fall through */ }

  // 3. base64 fallback — wallets produce btoa("address:timestamp"), OTP login produces btoa("email:timestamp")
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const colonIdx = decoded.indexOf(':')
    if (colonIdx > 0) {
      const identity = decoded.slice(0, colonIdx)
      if (identity.includes('@') || /^0x[0-9a-fA-F]{40}$/.test(identity) || identity.startsWith('passkey:')) {
        const addr = identity.startsWith('0x') ? identity : ''
        return { email: identity, walletAddress: addr, walletId: '', createdAt: 0 }
      }
    }
  } catch { /* fall through */ }

  // 4. Last resort — use token prefix as identity key (avoids 401 for unknown token formats)
  return { email: token.slice(0, 64), walletAddress: '', walletId: '', createdAt: 0 }
}

async function pushNotif(kv: RedisClient, email: string, n: Omit<AppNotification, 'id' | 'userEmail' | 'read' | 'createdAt'>) {
  const entry: AppNotification = { ...n, id: genId('notif'), userEmail: email, read: false, createdAt: new Date().toISOString() }
  await kv.lpush(`notifs:${email}`, entry)
  await kv.ltrim(`notifs:${email}`, 0, 99)
}


// ── admin auth ────────────────────────────────────────────────────────────────
// Set ADMIN_PASSWORD in Vercel (falls back to VITE_ADMIN_PASSWORD so existing
// setups keep working). Tokens are HMAC-signed and expire after 8 hours.

const ADMIN_TTL_MS = 8 * 60 * 60 * 1000

function adminPassword(): string { return process.env.ADMIN_PASSWORD ?? process.env.VITE_ADMIN_PASSWORD ?? '' }
function adminSecret(): string { return process.env.ADMIN_SESSION_SECRET ?? adminPassword() }

function sha256(v: string) { return crypto.createHash('sha256').update(v).digest() }

function signAdminToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_TTL_MS })).toString('base64url')
  const sig = crypto.createHmac('sha256', adminSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyAdminToken(token: string): boolean {
  if (!adminSecret()) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  const expected = crypto.createHmac('sha256', adminSecret()).update(payload).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp: number }
    return typeof exp === 'number' && exp > Date.now()
  } catch { return false }
}

function adminGate(req: VercelRequest): { status: number; error: string } | null {
  if (!adminPassword()) return { status: 503, error: 'Admin is not configured. Set ADMIN_PASSWORD in your Vercel environment variables and redeploy.' }
  const token = ((req.headers['x-admin-token'] as string | undefined) ?? '').trim()
  if (!token || !verifyAdminToken(token)) return { status: 401, error: 'Admin session expired. Please sign in again.' }
  return null
}

async function auditLog(kv: RedisClient, action: string, detail: string, recordId?: string) {
  try {
    await kv.lpush('admin:audit', { id: genId('aud'), action, detail, actor: 'admin', recordId, createdAt: new Date().toISOString() })
    await kv.ltrim('admin:audit', 0, 499)
  } catch { /* never block the action on audit failure */ }
}

// ── user registry + counters ──────────────────────────────────────────────────
// users           hash  key -> UserProfile (JSON)
// u:txs / u:vol   hash  key -> counters (atomic, so they are not capped by the ledger size)
// u:last          hash  key -> ISO timestamp of last activity
// stats           hash  global counters (txCount, volume, mainVolume, agentVolume, type:<t>:count/volume)
// stats:day:<d>   hash  per-day counters (txCount, volume, newUsers)
// active:<d>      set   user keys active that day

interface UserProfile {
  key: string; email: string; loginType: 'email' | 'passkey' | 'wallet' | 'unknown'
  mainWallet: string; circleWallet: string; agentWallet: string
  firstSeen: string; lastSeen: string; sessions: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

function validKey(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (EMAIL_RE.test(s) || ADDR_RE.test(s) || s.startsWith('passkey:') || s.startsWith('wallet:')) return s.slice(0, 120)
  return ''
}

function pickUserKey(...candidates: unknown[]): string {
  for (const c of candidates) { const k = validKey(c); if (k) return k }
  return ''
}

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
const addr = (v: unknown) => { const s = String(v ?? '').trim(); return ADDR_RE.test(s) ? s : '' }

async function upsertUser(
  kv: RedisClient, key: string,
  patch: Partial<Pick<UserProfile, 'loginType' | 'mainWallet' | 'circleWallet' | 'agentWallet'>> & { email?: string },
  opts: { session?: boolean } = {},
) {
  const nowIso = new Date().toISOString()
  const existing = await kv.hget<UserProfile>('users', key)
  const clean = <T extends string>(v: T | undefined, fallback: string) => (v ? v : fallback)
  const user: UserProfile = {
    key,
    email: clean(patch.email, existing?.email ?? (EMAIL_RE.test(key) ? key : '')),
    loginType: patch.loginType && patch.loginType !== 'unknown' ? patch.loginType : (existing?.loginType ?? 'unknown'),
    mainWallet: clean(patch.mainWallet, existing?.mainWallet ?? (ADDR_RE.test(key) ? key : '')),
    circleWallet: clean(patch.circleWallet, existing?.circleWallet ?? ''),
    agentWallet: clean(patch.agentWallet, existing?.agentWallet ?? ''),
    firstSeen: existing?.firstSeen ?? nowIso,
    lastSeen: nowIso,
    sessions: (existing?.sessions ?? 0) + (opts.session ? 1 : 0),
  }
  await kv.hset('users', { [key]: user })
  await kv.hset('u:last', { [key]: nowIso })
  const day = dayKey()
  await kv.sadd(`active:${day}`, key)
  await kv.expire(`active:${day}`, 60 * 86400)
  if (!existing) {
    await kv.hincrby(`stats:day:${day}`, 'newUsers', 1)
    await kv.expire(`stats:day:${day}`, 120 * 86400)
  }
  return user
}

async function countTx(kv: RedisClient, key: string, walletType: string, type: string, amount: number) {
  const day = dayKey()
  const ops: Promise<unknown>[] = [
    kv.hincrby('stats', 'txCount', 1),
    kv.hincrby('stats', `type:${type}:count`, 1),
    kv.hincrby(`stats:day:${day}`, 'txCount', 1),
    kv.expire(`stats:day:${day}`, 120 * 86400),
  ]
  if (amount > 0) {
    ops.push(
      kv.hincrbyfloat('stats', 'volume', amount),
      kv.hincrbyfloat('stats', walletType === 'agent' ? 'agentVolume' : 'mainVolume', amount),
      kv.hincrbyfloat('stats', `type:${type}:volume`, amount),
      kv.hincrbyfloat(`stats:day:${day}`, 'volume', amount),
    )
  }
  if (key) {
    ops.push(kv.hincrby('u:txs', key, 1))
    if (amount > 0) ops.push(kv.hincrbyfloat('u:vol', key, amount))
  }
  await Promise.all(ops)
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const r2 = (n: number) => Math.round(n * 100) / 100

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    return await routeHandler(req, res)
  } catch (e) {
    console.error('[community] unhandled error:', e)
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Internal server error' })
  }
}

async function routeHandler(req: VercelRequest, res: VercelResponse) {
  const kv = getRedis()
  if (!kv) return res.status(503).json(REDIS_NOT_CONFIGURED)

  // route comes from vercel.json destination query string
  const routeParam = ((req.query.route ?? req.query.path ?? '') as string)
  const route = routeParam.replace(/^\/+/, '')
  // _id is the interpolated :id param from Vercel rewrites (cannot be put inline in query strings)
  const id = (req.query._id as string | undefined) ?? ''
  const auth = req.headers.authorization as string | undefined
  const sess = await resolveSession(auth, kv)

  // ── admin: login + gate ──────────────────────────────────────────────────────
  if (route === 'admin/login' && req.method === 'POST') {
    if (!adminPassword()) return res.status(503).json({ success: false, error: 'Admin is not configured. Set ADMIN_PASSWORD in your Vercel environment variables and redeploy.' })
    const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()
    const failKey = `admin:fail:${ip}`
    const fails = num(await kv.get(failKey))
    if (fails >= 5) return res.status(429).json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' })
    const { password = '' } = (req.body ?? {}) as { password?: string }
    const ok = crypto.timingSafeEqual(sha256(String(password)), sha256(adminPassword()))
    if (!ok) {
      await kv.incr(failKey); await kv.expire(failKey, 900)
      await auditLog(kv, 'login_failed', `Failed admin login from ${ip}`)
      return res.status(401).json({ success: false, error: 'Incorrect password.' })
    }
    await kv.del(failKey)
    await auditLog(kv, 'login', `Admin signed in from ${ip}`)
    return res.status(200).json({ success: true, token: signAdminToken(), expiresInMs: ADMIN_TTL_MS })
  }

  if (route.startsWith('admin/')) {
    const denied = adminGate(req)
    if (denied) return res.status(denied.status).json({ success: false, error: denied.error })
  }

  // ── identify: register / refresh a user + their wallets ──────────────────────
  if (route === 'identify' && req.method === 'POST') {
    const b = (req.body ?? {}) as Record<string, unknown>
    const key = pickUserKey(b.email, b.walletAddress, b.circleWalletAddress)
    if (!key) return res.status(200).json({ success: true, skipped: true })
    const lt = String(b.loginType ?? '')
    await upsertUser(kv, key, {
      email: EMAIL_RE.test(String(b.email ?? '').trim()) ? String(b.email).trim().toLowerCase() : undefined,
      loginType: (['email', 'passkey', 'wallet'].includes(lt) ? lt : 'unknown') as UserProfile['loginType'],
      mainWallet: addr(b.walletAddress), circleWallet: addr(b.circleWalletAddress), agentWallet: addr(b.agentWalletAddress),
    }, { session: b.newSession === true })
    return res.status(200).json({ success: true })
  }

  // ── feedback ─────────────────────────────────────────────────────────────────

  if (route === 'feedback' && req.method === 'POST') {
    const { rating, comment = '', category = 'general' } = req.body as { rating: number; comment?: string; category?: string }
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'rating 1-5 required' })
    const entry: FeedbackEntry = {
      id: genId('fb'), userEmail: sess?.email ?? 'anonymous',
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

  // route=admin/feedback/review&_id=fb-xxx
  if (route === 'admin/feedback/review' && req.method === 'POST') {
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
    const all = (await kv.lrange<FeedbackEntry>('feedback:all', 0, 499)) ?? []
    const idx = all.findIndex(f => f.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    all[idx].reviewed = true
    await kv.del('feedback:all')
    if (all.length) await kv.rpush('feedback:all', ...all)
    await auditLog(kv, 'review', `Marked feedback ${id} as reviewed`, id)
    return res.status(200).json({ success: true })
  }

  // ── suggestions ──────────────────────────────────────────────────────────────

  if (route === 'suggestions' && req.method === 'POST') {
    const { title, description = '', category = 'general' } = req.body as { title: string; description?: string; category?: string }
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'title required' })
    const entry: SuggestionEntry = {
      id: genId('sug'), userEmail: sess?.email ?? 'anonymous',
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

  // route=admin/suggestions/item&_id=sug-xxx
  if (route === 'admin/suggestions/item' && req.method === 'PATCH') {
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
    const all = (await kv.lrange<SuggestionEntry>('suggestions:all', 0, 499)) ?? []
    const idx = all.findIndex(s => s.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
    const { status, adminNote } = req.body as { status?: SuggestionStatus; adminNote?: string }
    if (status) all[idx].status = status
    if (adminNote !== undefined) all[idx].adminNote = String(adminNote).slice(0, 1000)
    all[idx].updatedAt = new Date().toISOString()
    await kv.del('suggestions:all')
    if (all.length) await kv.rpush('suggestions:all', ...all)
    await auditLog(kv, 'suggestion', `Suggestion ${id} → ${all[idx].status}${adminNote !== undefined ? ' (note updated)' : ''}`, id)
    return res.status(200).json({ success: true, suggestion: all[idx] })
  }

  // ── support tickets ───────────────────────────────────────────────────────────

  if (route === 'support/tickets' && req.method === 'POST') {
    // Allow wallet-only users — use wallet address as identity when no email session
    const walletAddr = (req.headers['x-wallet-address'] as string | undefined ?? req.body?.walletAddress ?? '').toLowerCase()
    const identity = sess?.email ?? (walletAddr ? `wallet:${walletAddr}` : 'anonymous')
    const { subject, message } = req.body as { subject: string; message: string }
    if (!subject || !message) return res.status(400).json({ success: false, error: 'subject and message required' })
    const now = new Date().toISOString()
    const ticket: SupportTicket = {
      id: `TKT-${Date.now().toString(36).toUpperCase()}`,
      userEmail: identity, subject, status: 'open',
      messages: [{ id: genId('msg'), author: 'customer', content: message, timestamp: now }],
      createdAt: now, updatedAt: now, hasUnreadAdmin: false, hasUnreadCustomer: true,
    }
    await kv.set(`ticket:${ticket.id}`, ticket)
    await kv.lpush(`tickets:user:${identity}`, ticket.id)
    await kv.lpush('tickets:all', ticket.id)
    await pushNotif(kv, identity, {
      type: 'support', title: 'Support request received',
      body: `Your request "${subject}" has been submitted. We'll get back to you shortly.`,
      ticketId: ticket.id,
    })
    return res.status(200).json({ success: true, ticket })
  }

  if (route === 'support/tickets' && req.method === 'GET') {
    const walletAddr2 = (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
    const identity2 = sess?.email ?? (walletAddr2 ? `wallet:${walletAddr2}` : null)
    if (!identity2) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const ids = (await kv.lrange<string>(`tickets:user:${identity2}`, 0, 49)) ?? []
    const tickets = (await Promise.all(ids.map(tid => kv.get<SupportTicket>(`ticket:${tid}`)))).filter(Boolean) as SupportTicket[]
    return res.status(200).json({ success: true, tickets: tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) })
  }

  // route=support/tickets/item&_id=TKT-xxx  (GET a single ticket)
  if (route === 'support/tickets/item' && req.method === 'GET') {
    const wa3 = (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
    const id3 = sess?.email ?? (wa3 ? `wallet:${wa3}` : null)
    if (!id3) return res.status(401).json({ success: false, error: 'Unauthorized' })
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
    const ticket = await kv.get<SupportTicket>(`ticket:${id}`)
    if (!ticket) return res.status(404).json({ success: false, error: 'Not found' })
    if (ticket.userEmail !== id3) return res.status(403).json({ success: false, error: 'Forbidden' })
    ticket.hasUnreadAdmin = false
    await kv.set(`ticket:${id}`, ticket)
    return res.status(200).json({ success: true, ticket })
  }

  // route=support/tickets/reply&_id=TKT-xxx  (customer replies)
  if (route === 'support/tickets/reply' && req.method === 'POST') {
    if (!sess) return res.status(401).json({ success: false, error: 'Unauthorized' })
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
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
    const tickets = (await Promise.all(ids.map(tid => kv.get<SupportTicket>(`ticket:${tid}`)))).filter(Boolean) as SupportTicket[]
    return res.status(200).json({ success: true, tickets: tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) })
  }

  // route=admin/support/tickets/reply&_id=TKT-xxx  (admin replies)
  if (route === 'admin/support/tickets/reply' && req.method === 'POST') {
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
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
    await auditLog(kv, 'ticket', `${message ? 'Replied to' : 'Updated'} ticket ${id}${status ? ` → ${status}` : ''}`, id)
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
    const { id: notifId, all } = req.body as { id?: string; all?: boolean }
    const key = `notifs:${sess.email}`
    const list = (await kv.lrange<AppNotification>(key, 0, 99)) ?? []
    const updated = all
      ? list.map(n => ({ ...n, read: true }))
      : list.map(n => (!notifId || n.id === notifId) ? { ...n, read: true } : n)
    await kv.del(key)
    if (updated.length) await kv.rpush(key, ...updated)
    return res.status(200).json({ success: true })
  }

  // ── admin: mark ticket read ───────────────────────────────────────────────────
  if (route === 'admin/support/tickets/read' && req.method === 'POST') {
    if (!id) return res.status(400).json({ success: false, error: 'id required' })
    const ticket = await kv.get<SupportTicket>(`ticket:${id}`)
    if (ticket) { ticket.hasUnreadCustomer = false; await kv.set(`ticket:${id}`, ticket) }
    return res.status(200).json({ success: true })
  }

  // ── tx tracking ───────────────────────────────────────────────────────────────
  if (route === 'tx-track' && req.method === 'POST') {
    const b = (req.body ?? {}) as Record<string, unknown>
    if (!b.type) return res.status(400).json({ success: false, error: 'type required' })
    const type = String(b.type).slice(0, 40)
    const walletType = b.walletType === 'agent' ? 'agent' : 'main'
    const amount = Math.abs(num(b.amount))
    const walletAddress = String(b.walletAddress ?? sess?.walletAddress ?? '')
    const userKey = pickUserKey(sess?.email, b.userEmail, walletAddress)
    const record = {
      id: genId('tx'),
      walletType, walletAddress,
      userEmail: userKey || 'anonymous',
      type, amount,
      description: String(b.description ?? type).slice(0, 300),
      counterparty: b.counterparty, txHash: b.txHash,
      chain: b.chain ?? 'Arc Testnet',
      timestamp: new Date().toISOString(),
    }
    await kv.lpush('tx:ledger', record)
    await kv.ltrim('tx:ledger', 0, 1999)
    try {
      if (userKey) await upsertUser(kv, userKey, walletType === 'agent' ? { agentWallet: addr(walletAddress) } : { mainWallet: addr(walletAddress) })
      await countTx(kv, userKey, walletType, type, amount)
    } catch (e) { console.error('[community] registry update failed:', e) }
    return res.status(200).json({ success: true, id: record.id })
  }

  type LedgerTx = { id: string; walletType: string; amount: number; type: string; timestamp: string; walletAddress: string; userEmail: string; description: string; txHash?: string; chain?: string }

  if (route === 'admin/tx-report' && req.method === 'GET') {
    const all = (await kv.lrange<LedgerTx>('tx:ledger', 0, 1999)) ?? []
    const stats = (await kv.hgetall<Record<string, number | string>>('stats')) ?? {}
    // Lifetime counters come from the atomic stats hash; fall back to the (capped) ledger if it was never populated.
    const hasStats = num(stats.txCount) > 0
    const sum = (f: (t: LedgerTx) => boolean) => all.filter(f).reduce((s, t) => s + num(t.amount), 0)
    const byType: Record<string, { count: number; volume: number }> = {}
    if (hasStats) {
      for (const [k, v] of Object.entries(stats)) {
        const m = k.match(/^type:(.+):(count|volume)$/)
        if (!m) continue
        byType[m[1]] ??= { count: 0, volume: 0 }
        if (m[2] === 'count') byType[m[1]].count = num(v); else byType[m[1]].volume = r2(num(v))
      }
    } else {
      for (const t of all) { byType[t.type] ??= { count: 0, volume: 0 }; byType[t.type].count++; byType[t.type].volume += num(t.amount) }
    }
    return res.status(200).json({
      success: true,
      totalVolume: r2(hasStats ? num(stats.volume) : sum(() => true)),
      mainVolume:  r2(hasStats ? num(stats.mainVolume) : sum(t => t.walletType === 'main')),
      agentVolume: r2(hasStats ? num(stats.agentVolume) : sum(t => t.walletType === 'agent')),
      txCount: hasStats ? num(stats.txCount) : all.length,
      byType,
      recent: all.slice(0, 200),
    })
  }

  // ── admin: overview (everything on one screen) ────────────────────────────────
  if (route === 'admin/overview' && req.method === 'GET') {
    const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(Date.now() - (13 - i) * 86400000)))
    const [stats, usersHash, txs, vols, lastMap, feedback, suggestions, ticketIds, ledger, dayStats, dayActive, auditCount] = await Promise.all([
      kv.hgetall<Record<string, number | string>>('stats'),
      kv.hgetall<Record<string, UserProfile>>('users'),
      kv.hgetall<Record<string, number>>('u:txs'),
      kv.hgetall<Record<string, number>>('u:vol'),
      kv.hgetall<Record<string, string>>('u:last'),
      kv.lrange<FeedbackEntry>('feedback:all', 0, 499),
      kv.lrange<SuggestionEntry>('suggestions:all', 0, 499),
      kv.lrange<string>('tickets:all', 0, 499),
      kv.lrange<LedgerTx>('tx:ledger', 0, 19),
      Promise.all(days.map(d => kv.hgetall<Record<string, number | string>>(`stats:day:${d}`))),
      Promise.all(days.map(d => kv.scard(`active:${d}`))),
      kv.llen('admin:audit'),
    ])
    const users = Object.values(usersHash ?? {})
    const st = stats ?? {}
    const tids = ticketIds ?? []
    const tickets = tids.length ? ((await kv.mget<(SupportTicket | null)[]>(...tids.map(t => `ticket:${t}`))).filter(Boolean) as SupportTicket[]) : []
    const fb = feedback ?? [], sug = suggestions ?? []
    const dayAgo = Date.now() - 86400000, weekAgo = Date.now() - 7 * 86400000
    const lm = lastMap ?? {}
    const lastTs = (u: UserProfile) => new Date(lm[u.key] ?? u.lastSeen).getTime()
    const walletSet = new Set<string>()
    let agentWallets = 0
    for (const u of users) {
      for (const w of [u.mainWallet, u.circleWallet]) if (w) walletSet.add(w.toLowerCase())
      if (u.agentWallet) { agentWallets++; walletSet.add(u.agentWallet.toLowerCase()) }
    }
    const byLogin = users.reduce<Record<string, number>>((a, u) => { a[u.loginType] = (a[u.loginType] ?? 0) + 1; return a }, {})
    const rating = fb.length ? fb.reduce((x, f) => x + f.rating, 0) / fb.length : 0
    const ratingDist = [1, 2, 3, 4, 5].map(r => fb.filter(f => f.rating === r).length)
    return res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      users: {
        total: users.length,
        wallets: walletSet.size,
        agentWallets,
        active24h: users.filter(u => lastTs(u) >= dayAgo).length,
        active7d: users.filter(u => lastTs(u) >= weekAgo).length,
        new7d: users.filter(u => new Date(u.firstSeen).getTime() >= weekAgo).length,
        byLogin,
        recent: [...users].sort((a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime()).slice(0, 8),
        top: [...users].map(u => ({ key: u.key, email: u.email, mainWallet: u.mainWallet, volume: r2(num(vols?.[u.key])), txCount: num(txs?.[u.key]) }))
          .filter(u => u.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 8),
      },
      volume: { total: r2(num(st.volume)), main: r2(num(st.mainVolume)), agent: r2(num(st.agentVolume)), txCount: num(st.txCount) },
      series: days.map((d, i) => ({ date: d, volume: r2(num(dayStats[i]?.volume)), txCount: num(dayStats[i]?.txCount), newUsers: num(dayStats[i]?.newUsers), activeUsers: num(dayActive[i]) })),
      support: {
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        inProgress: tickets.filter(t => t.status === 'in_progress').length,
        resolved: tickets.filter(t => t.status === 'resolved').length,
        unread: tickets.filter(t => t.hasUnreadCustomer).length,
      },
      feedback: { total: fb.length, avgRating: Math.round(rating * 10) / 10, unreviewed: fb.filter(f => !f.reviewed).length, ratingDist },
      suggestions: { total: sug.length, open: sug.filter(s => s.status === 'new' || s.status === 'reviewing').length, planned: sug.filter(s => s.status === 'planned').length, implemented: sug.filter(s => s.status === 'implemented').length },
      auditEntries: num(auditCount),
      recentTx: ledger ?? [],
      registryEmpty: users.length === 0,
    })
  }

  // ── admin: users / wallets ────────────────────────────────────────────────────
  if (route === 'admin/users' && req.method === 'GET') {
    const [usersHash, txs, vols, lastMap] = await Promise.all([
      kv.hgetall<Record<string, UserProfile>>('users'),
      kv.hgetall<Record<string, number>>('u:txs'),
      kv.hgetall<Record<string, number>>('u:vol'),
      kv.hgetall<Record<string, string>>('u:last'),
    ])
    const list = Object.values(usersHash ?? {}).map(u => ({
      ...u, txCount: num(txs?.[u.key]), volume: r2(num(vols?.[u.key])), lastSeen: lastMap?.[u.key] ?? u.lastSeen,
    })).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    return res.status(200).json({ success: true, total: list.length, users: list.slice(0, 2000) })
  }

  // route=admin/users/item&_id=<user key>
  if (route === 'admin/users/item' && req.method === 'GET') {
    const key = id.toLowerCase()
    if (!key) return res.status(400).json({ success: false, error: 'id required' })
    const [user, txCount, volume, ledger, ticketIds, feedback, suggestions] = await Promise.all([
      kv.hget<UserProfile>('users', key), kv.hget<number>('u:txs', key), kv.hget<number>('u:vol', key),
      kv.lrange<LedgerTx>('tx:ledger', 0, 1999),
      kv.lrange<string>(`tickets:user:${key}`, 0, 49),
      kv.lrange<FeedbackEntry>('feedback:all', 0, 499),
      kv.lrange<SuggestionEntry>('suggestions:all', 0, 499),
    ])
    if (!user) return res.status(404).json({ success: false, error: 'User not found' })
    const wallets = [user.mainWallet, user.circleWallet, user.agentWallet].filter(Boolean).map(w => w.toLowerCase())
    const mine = (ledger ?? []).filter(t => (t.userEmail ?? '').toLowerCase() === key || wallets.includes((t.walletAddress ?? '').toLowerCase()))
    const tIds = ticketIds ?? []
    const tickets = tIds.length ? ((await kv.mget<(SupportTicket | null)[]>(...tIds.map(t => `ticket:${t}`))).filter(Boolean) as SupportTicket[]) : []
    return res.status(200).json({
      success: true,
      user: { ...user, txCount: num(txCount), volume: r2(num(volume)) },
      transactions: mine.slice(0, 100),
      tickets,
      feedback: (feedback ?? []).filter(f => (f.userEmail ?? '').toLowerCase() === key),
      suggestions: (suggestions ?? []).filter(s => (s.userEmail ?? '').toLowerCase() === key),
    })
  }

  // ── admin: audit log ──────────────────────────────────────────────────────────
  if (route === 'admin/audit' && req.method === 'GET') {
    const log = (await kv.lrange('admin:audit', 0, 499)) ?? []
    return res.status(200).json({ success: true, log })
  }

  // ── admin: one-time backfill of the registry from existing sessions + ledger ──
  if (route === 'admin/backfill' && req.method === 'POST') {
    if (await kv.get('stats:backfilled')) return res.status(409).json({ success: false, error: 'Backfill already ran. Running it again would double-count volume.' })
    if (num(await kv.hget('stats', 'txCount')) > 0) return res.status(409).json({ success: false, error: 'Live counters already exist, so backfill was skipped to avoid double-counting.' })
    let imported = 0, txCounted = 0
    try {
      const keys = (await kv.keys('session:*')) ?? []
      for (const k of keys) {
        const sv = await kv.get<Session>(k)
        const uk = pickUserKey(sv?.email, sv?.walletAddress)
        if (!uk) continue
        await upsertUser(kv, uk, { email: EMAIL_RE.test(sv?.email ?? '') ? sv?.email : undefined, mainWallet: addr(sv?.walletAddress), loginType: EMAIL_RE.test(uk) ? 'email' : 'unknown' })
        imported++
      }
    } catch { /* keys() unsupported — ledger import still runs */ }
    const ledger = ((await kv.lrange<LedgerTx>('tx:ledger', 0, 1999)) ?? []).reverse()
    for (const t of ledger) {
      const uk = pickUserKey(t.userEmail, t.walletAddress)
      if (uk) await upsertUser(kv, uk, t.walletType === 'agent' ? { agentWallet: addr(t.walletAddress) } : { mainWallet: addr(t.walletAddress) })
      await countTx(kv, uk, t.walletType, t.type, num(t.amount))
      txCounted++
    }
    await kv.set('stats:backfilled', new Date().toISOString())
    await auditLog(kv, 'backfill', `Imported ${imported} sessions and ${txCounted} ledger transactions`)
    return res.status(200).json({ success: true, imported, txCounted })
  }

  // ── admin: analytics (kept for older clients) ─────────────────────────────────
  if (route === 'admin/analytics' && req.method === 'GET') {
    const [feedback, suggestions, ticketIds, stats, userCount] = await Promise.all([
      kv.lrange<FeedbackEntry>('feedback:all', 0, 499), kv.lrange<SuggestionEntry>('suggestions:all', 0, 499),
      kv.lrange<string>('tickets:all', 0, 499), kv.hgetall<Record<string, number | string>>('stats'), kv.hlen('users'),
    ])
    const fb = feedback ?? [], sug = suggestions ?? [], tids = ticketIds ?? [], st = stats ?? {}
    const tickets = tids.length ? ((await kv.mget<(SupportTicket | null)[]>(...tids.map(t => `ticket:${t}`))).filter(Boolean) as SupportTicket[]) : []
    return res.status(200).json({
      success: true, totalUsers: num(userCount),
      totalFeedback: fb.length, avgRating: fb.length ? Math.round(fb.reduce((x, f) => x + f.rating, 0) / fb.length * 10) / 10 : 0,
      totalSuggestions: sug.length, openSuggestions: sug.filter(s => s.status === 'new' || s.status === 'reviewing').length,
      auditEntries: 0, totalTickets: tickets.length, openTickets: tickets.filter(t => t.status !== 'resolved').length,
      totalTxCount: num(st.txCount), totalVolume: r2(num(st.volume)), mainVolume: r2(num(st.mainVolume)), agentVolume: r2(num(st.agentVolume)),
    })
  }

  return res.status(404).json({ success: false, error: `Unknown route: ${route}` })
}
