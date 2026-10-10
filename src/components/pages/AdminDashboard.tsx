import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { adminFetch, adminLogin, adminLogout, getAdminToken } from '../../lib/admin-api'
import { AdminOverviewPanel, AdminUsersPanel } from './AdminInsights'
import { BarChart3, Users, Zap, ArrowUpRight, ArrowDownLeft, RefreshCw, Shield, Globe, Cpu, CheckCircle, XCircle, Activity, ArrowLeft, Send, Plus, Trash2, Edit3, Save, X, Info, ChevronRight, ChevronLeft } from 'lucide-react'

// ── Admin Password Gate ────────────────────────────────────────────────────────
// The password is checked on the server (ADMIN_PASSWORD env var in Vercel). The server returns a signed, expiring token.

function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const { setActiveView } = useAppStore()
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)

  const [busy, setBusy] = useState(false)
  const attempt = async () => {
    if (busy || !pw) return
    setBusy(true)
    const r = await adminLogin(pw)
    setBusy(false)
    if (r.ok) {
      onUnlock()
    } else {
      setError(r.error)
      setShaking(true)
      setPw('')
      setTimeout(() => setShaking(false), 400)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--nan-bg)', fontFamily: "'Inter', sans-serif", zIndex: 10,
    }}>
      <div style={{
        width: 'min(360px, calc(100vw - 40px))',
        background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
        borderRadius: 20, padding: '36px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        animation: shaking ? 'nan-shake 0.4s ease' : undefined,
      }}>
        <style>{`@keyframes nan-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Shield size={22} color="#0066FF" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--nan-text)', letterSpacing: '-0.02em' }}>Admin Access</div>
          <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginTop: 4 }}>Enter the admin password to continue</div>
        </div>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && void attempt()}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 11, boxSizing: 'border-box',
            background: 'var(--nan-surface2)', border: `1px solid ${error ? '#FF3B3B' : 'var(--nan-bdr)'}`,
            color: 'var(--nan-text)', fontSize: 15, fontFamily: "'Inter', sans-serif", outline: 'none',
            marginBottom: error ? 8 : 16,
          }}
        />
        {error && <div style={{ fontSize: 12, color: '#FF3B3B', marginBottom: 12, fontWeight: 500 }}>{error}</div>}
        <button
          onClick={() => void attempt()} disabled={busy}
          style={{ width: '100%', padding: '12px', borderRadius: 11, background: '#0066FF', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginBottom: 10 }}
        >
          {busy ? 'Checking…' : 'Unlock Dashboard'}
        </button>
        <button
          onClick={() => setActiveView('home')}
          style={{ width: '100%', padding: '10px', borderRadius: 11, background: 'transparent', color: 'var(--nan-text2)', fontSize: 13, fontWeight: 500, border: '1px solid var(--nan-bdr)', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}


const SANS = "'Inter', -apple-system, sans-serif"
const S = 'var(--nan-surface)'
const B = 'var(--nan-bdr)'

// ── Support types (shared with server) ────────────────────────────────────────
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
  hasUnreadCustomer: boolean
}

interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

interface AboutContent {
  headline: string
  tagline: string
  body: string
  mission: string
  contact: string
  updatedAt: string
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: SupportTicket['status'] }) {
  const cfg = {
    open: { label: 'Open', color: 'var(--nan-blue)', bg: 'var(--nan-blue-dim)' },
    in_progress: { label: 'In Progress', color: 'var(--nan-gold)', bg: 'var(--nan-gold-dim)' },
    resolved: { label: 'Resolved', color: 'var(--nan-green)', bg: 'var(--nan-green-dim)' },
  }[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 20 }}>
      {cfg.label}
    </span>
  )
}

// ── Admin Support Panel ────────────────────────────────────────────────────────
function AdminSupportPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | SupportTicket['status']>('all')
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await adminFetch('/api/admin/support/tickets')
      const data = await res.json() as { tickets: SupportTicket[] }
      if (data.tickets) setTickets(data.tickets)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchAll() }, [])

  const openTicket = async (t: SupportTicket) => {
    setSelected(t)
    // Mark as read
    await adminFetch(`/api/admin/support/tickets/${t.id}/read`, { method: 'POST' })
    setTickets(prev => prev.map(x => x.id === t.id ? { ...x, hasUnreadCustomer: false } : x))
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const sendReply = async (status?: SupportTicket['status']) => {
    if (!selected) return
    setReplyLoading(true)
    try {
      const res = await adminFetch(`/api/admin/support/tickets/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() || undefined, status }),
      })
      const data = await res.json() as { ticket: SupportTicket }
      if (data.ticket) {
        setSelected(data.ticket)
        setTickets(prev => prev.map(x => x.id === data.ticket.id ? data.ticket : x))
        setReplyText('')
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } finally {
      setReplyLoading(false)
    }
  }

  const filtered = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) && !t.userEmail.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const unreadCount = tickets.filter(t => t.hasUnreadCustomer).length

  if (selected) return (
    <div>
      <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: 'var(--nan-text2)', fontSize: 13, cursor: 'pointer', marginBottom: 16, fontFamily: SANS }}>
        <ChevronLeft size={14} /> All tickets
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 3 }}>{selected.subject}</div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{selected.id}</span>
            <span>·</span>
            <span>{selected.userEmail}</span>
            <span>·</span>
            <StatusPill status={selected.status} />
          </div>
        </div>
        {/* Status controls */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          {selected.status !== 'in_progress' && (
            <button onClick={() => { void sendReply('in_progress') }} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--nan-gold-dim)', border: '1px solid var(--nan-gold)', color: 'var(--nan-gold)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
              Mark In Progress
            </button>
          )}
          {selected.status !== 'resolved' && (
            <button onClick={() => { void sendReply('resolved') }} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--nan-green-dim)', border: '1px solid var(--nan-green)', color: 'var(--nan-green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
              ✓ Resolve
            </button>
          )}
          {selected.status === 'resolved' && (
            <button onClick={() => { void sendReply('open') }} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--nan-blue-dim)', border: '1px solid var(--nan-blue-bd)', color: 'var(--nan-blue)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
              Reopen
            </button>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '16px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
        {selected.messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.author === 'admin' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%' }}>
              <div style={{ fontSize: 10, color: 'var(--nan-text3)', marginBottom: 3, textAlign: msg.author === 'admin' ? 'right' : 'left', fontWeight: 500 }}>
                {msg.author === 'admin' ? 'You (Admin)' : selected.userEmail} · {fmtTime(msg.timestamp)}
              </div>
              <div style={{
                padding: '10px 13px',
                borderRadius: msg.author === 'admin' ? '13px 13px 3px 13px' : '13px 13px 13px 3px',
                background: msg.author === 'admin' ? 'var(--nan-blue)' : 'var(--nan-surface2)',
                border: msg.author === 'admin' ? 'none' : `1px solid ${B}`,
                color: msg.author === 'admin' ? '#fff' : 'var(--nan-text)',
                fontSize: 13, lineHeight: 1.6,
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          placeholder="Type a response to the customer…"
          rows={3}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, resize: 'none', lineHeight: 1.5 }}
        />
        <button
          onClick={() => { void sendReply() }}
          disabled={replyLoading || !replyText.trim()}
          style={{ width: 36, height: 36, borderRadius: 9, background: replyText.trim() ? 'var(--nan-blue)' : 'var(--nan-surface2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: replyText.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}
        >
          <Send size={15} color={replyText.trim() ? '#fff' : 'var(--nan-text3)'} />
        </button>
      </div>
    </div>
  )

  // List view
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Support Inbox</div>
          <div style={{ fontSize: 13, color: 'var(--nan-text2)' }}>
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
            {unreadCount > 0 && <span style={{ marginLeft: 8, background: 'var(--nan-blue)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }}>{unreadCount} new</span>}
          </div>
        </div>
        <button onClick={() => { void fetchAll() }} style={{ padding: '6px 12px', borderRadius: 8, background: S, border: `1px solid ${B}`, color: 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>
          Refresh
        </button>
      </div>

      {/* Filter + Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subject or email…"
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none' }}
        />
        {(['all', 'open', 'in_progress', 'resolved'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '7px 12px', borderRadius: 9, background: filterStatus === s ? 'var(--nan-blue)' : S, border: `1px solid ${filterStatus === s ? 'var(--nan-blue)' : B}`, color: filterStatus === s ? '#fff' : 'var(--nan-text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
            {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>
          No support tickets {filterStatus !== 'all' ? `with status "${filterStatus}"` : 'yet'}.
        </div>
      ) : (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
          {filtered.map((t, i) => (
            <div key={t.id} onClick={() => { void openTicket(t) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${B}` : 'none', cursor: 'pointer', background: t.hasUnreadCustomer ? 'var(--nan-blue-dim)' : 'transparent', transition: 'background 0.15s' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: t.hasUnreadCustomer ? 700 : 500, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                  {t.hasUnreadCustomer && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--nan-blue)', flexShrink: 0 }} />}
                  <StatusPill status={t.status} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--nan-text3)', display: 'flex', gap: 6 }}>
                  <span>{t.userEmail}</span>
                  <span>·</span>
                  <span>{t.id}</span>
                  <span>·</span>
                  <span>{timeAgo(t.updatedAt)}</span>
                  <span>·</span>
                  <span>{t.messages.length} msg{t.messages.length !== 1 ? 's' : ''}</span>
                </div>
                {t.messages.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.messages[t.messages.length - 1].author === 'customer' ? '← ' : '→ '}
                    {t.messages[t.messages.length - 1].content.slice(0, 80)}
                  </div>
                )}
              </div>
              <ChevronRight size={14} color="var(--nan-text3)" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


interface FeedbackEntry { id: string; userEmail: string; rating: number; comment: string; category: string; reviewed: boolean; createdAt: string }

function StarRow({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ fontSize: 12, color: n <= rating ? '#F0A500' : 'var(--nan-text3)' }}>★</span>
      ))}
    </span>
  )
}

function AdminFeedbackPanel() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [avg, setAvg]           = useState(0)
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all' | 'unreviewed'>('all')
  const [search, setSearch]     = useState('')

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    adminFetch('/api/admin/feedback')
      .then(r => r.json())
      .then((d: { success: boolean; feedback: FeedbackEntry[]; averageRating: number }) => {
        if (d.success) { setFeedback(d.feedback); setAvg(d.averageRating) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const markReviewed = async (id: string) => {
    await adminFetch(`/api/admin/feedback/${id}/review`, { method: 'POST' })
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, reviewed: true } : f))
  }

  const visible = feedback
    .filter(f => filter === 'all' || !f.reviewed)
    .filter(f => !search || f.comment.toLowerCase().includes(search.toLowerCase()) || f.userEmail.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Customer Feedback</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 24, fontWeight: 800 }}>{avg}</span>
          <StarRow rating={Math.round(avg)} />
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 16 }}>{feedback.length} submissions</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search feedback…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none' }} />
        {['all','unreviewed'].map(f => (
          <button key={f} onClick={() => setFilter(f as typeof filter)}
            style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${filter === f ? '#0066FF' : B}`, background: filter === f ? 'rgba(0,102,255,0.10)' : S, color: filter === f ? '#0066FF' : 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>No feedback yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(f => (
            <div key={f.id} style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <StarRow rating={f.rating} />
                  <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 2 }}>
                    {f.userEmail.split('@')[0]}*** · {f.category} · {new Date(f.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                {!f.reviewed && (
                  <button onClick={() => { void markReviewed(f.id) }}
                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.20)', color: '#0066FF', cursor: 'pointer', fontFamily: SANS }}>
                    Mark reviewed
                  </button>
                )}
                {f.reviewed && <span style={{ fontSize: 11, color: 'var(--nan-text3)' }}>✓ Reviewed</span>}
              </div>
              {f.comment && <div style={{ fontSize: 13, color: 'var(--nan-text)', lineHeight: 1.5 }}>{f.comment}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AdminSuggestionsPanel ──────────────────────────────────────────────────────

type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'implemented' | 'closed'
interface SuggestionEntry { id: string; userEmail: string; title: string; description: string; category: string; status: SuggestionStatus; adminNote: string; createdAt: string; updatedAt: string }

const SUG_STATUSES: SuggestionStatus[] = ['new','reviewing','planned','implemented','closed']
const SUG_STATUS_COLORS: Record<SuggestionStatus, { bg: string; color: string }> = {
  new:         { bg: 'rgba(0,102,255,0.08)',   color: '#0066FF' },
  reviewing:   { bg: 'rgba(240,165,0,0.08)',   color: '#F0A500' },
  planned:     { bg: 'rgba(0,200,83,0.08)',    color: '#00C853' },
  implemented: { bg: 'rgba(0,200,83,0.12)',    color: '#00C853' },
  closed:      { bg: 'rgba(128,128,128,0.08)', color: '#888' },
}

function AdminSuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([])
  const [loading, setLoading]  = useState(true)
  const [search, setSearch]    = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'all'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [note, setNote]        = useState('')
  const [saving, setSaving]    = useState(false)

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    adminFetch('/api/admin/suggestions')
      .then(r => r.json())
      .then((d: { success: boolean; suggestions: SuggestionEntry[] }) => { if (d.success) setSuggestions(d.suggestions) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const update = async (id: string, status?: SuggestionStatus, adminNote?: string) => {
    setSaving(true)
    const res = await adminFetch(`/api/admin/suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...(status ? { status } : {}), ...(adminNote !== undefined ? { adminNote } : {}) }),
    })
    const data = await res.json() as { success: boolean; suggestion: SuggestionEntry }
    if (data.success) setSuggestions(prev => prev.map(s => s.id === id ? data.suggestion : s))
    setSaving(false)
  }

  const visible = suggestions
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => catFilter === 'all' || s.category === catFilter)
    .filter(s => !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()))

  const categories = ['all', ...new Set(suggestions.map(s => s.category))]

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Suggestion Box</div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 16 }}>{suggestions.length} submissions</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ padding: '8px 10px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 12, fontFamily: SANS, cursor: 'pointer' }}>
          <option value="all">All statuses</option>
          {SUG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 12, fontFamily: SANS, cursor: 'pointer' }}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>No suggestions found</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map(sug => {
            const badge = SUG_STATUS_COLORS[sug.status]
            const isOpen = expanded === sug.id
            return (
              <div key={sug.id} style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }} onClick={() => { setExpanded(isOpen ? null : sug.id); setNote(sug.adminNote) }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--nan-text)' }}>{sug.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>{sug.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>
                      {sug.userEmail.split('@')[0]}*** · {sug.category} · {new Date(sug.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--nan-text3)" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                </div>
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${B}`, padding: '14px 16px', background: 'var(--nan-surface2)' }}>
                    {sug.description && <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 12, lineHeight: 1.6 }}>{sug.description}</div>}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Status</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {SUG_STATUSES.map(st => (
                          <button key={st} onClick={() => { void update(sug.id, st) }}
                            style={{ padding: '4px 10px', borderRadius: 20, border: `1px solid ${sug.status === st ? '#0066FF' : B}`, background: sug.status === st ? 'rgba(0,102,255,0.12)' : S, color: sug.status === st ? '#0066FF' : 'var(--nan-text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textTransform: 'capitalize' }}>
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Admin note</div>
                      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Internal note…"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      <button onClick={() => { void update(sug.id, undefined, note) }} disabled={saving}
                        style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: '#0066FF', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: SANS, opacity: saving ? 0.7 : 1 }}>
                        <Save size={12} /> Save note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── AdminAuditPanel ────────────────────────────────────────────────────────────

interface AuditEntry { id: string; action: string; actor: string; detail: string; recordId?: string; createdAt: string }

function AdminAuditPanel() {
  const [log, setLog]       = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    adminFetch('/api/admin/audit')
      .then(r => r.json())
      .then((d: { success: boolean; log: AuditEntry[] }) => { if (d.success) setLog(d.log) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = log.filter(e =>
    !search ||
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    e.detail.toLowerCase().includes(search.toLowerCase()) ||
    e.actor.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Admin Audit Log</div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 16 }}>All important admin actions</div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search actions…"
        style={{ width: '100%', marginBottom: 12, padding: '9px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none', boxSizing: 'border-box' }} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>No audit entries yet. Admin actions will appear here.</div>
      ) : (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
          {visible.map((entry, i) => (
            <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', gap: 10, padding: '11px 16px', borderBottom: i < visible.length - 1 ? `1px solid ${B}` : 'none', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text)', background: 'var(--nan-surface2)', padding: '2px 8px', borderRadius: 20, textTransform: 'capitalize' }}>{entry.action}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail}</div>
                <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>{entry.actor}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>{new Date(entry.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type Metric = { label: string; value: string; sub: string; icon: React.ReactNode; trend?: string }

function MetricCard({ label, value, sub, icon, trend }: Metric) {
  return (
    <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nan-text)', background: 'var(--nan-surface2)', padding: '2px 7px', borderRadius: 20 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--nan-text2)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

type InfraItem = { name: string; status: 'live' | 'ready' | 'pending'; desc: string; icon: React.ReactNode }

function InfraCard({ name, status, desc, icon }: InfraItem) {
  const label = status === 'live' ? 'Live' : status === 'ready' ? 'Ready' : 'Needs key'
  const badgeColor = status === 'live' ? '#ffffff' : 'var(--nan-text3)'
  const badgeBg = status === 'live' ? 'var(--nan-surface)' : 'var(--nan-surface)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>{desc}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '3px 9px', borderRadius: 20, flexShrink: 0 }}>
        {label}
      </span>
    </div>
  )
}

export function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getAdminToken()))
  useEffect(() => {
    const lock = () => setUnlocked(false)
    window.addEventListener('nan-admin-expired', lock)
    return () => window.removeEventListener('nan-admin-expired', lock)
  }, [])

  if (!unlocked) return <AdminPasswordGate onUnlock={() => setUnlocked(true)} />

  return <AdminDashboardInner />
}


interface TxRecord {
  id: string
  walletType: 'main' | 'agent'
  walletAddress: string
  userEmail: string
  type: string
  amount: number
  description: string
  counterparty?: string
  txHash?: string
  chain?: string
  timestamp: string
}

interface TxReport {
  totalVolume: number
  mainVolume: number
  agentVolume: number
  txCount: number
  byType: Record<string, { count: number; volume: number }>
  recent: TxRecord[]
}

function AdminTxPanel() {
  const [report, setReport] = useState<TxReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [walletFilter, setWalletFilter] = useState<'all' | 'main' | 'agent'>('all')

  const load = useCallback(() => {
    setLoading(true)
    adminFetch('/api/admin/tx-report')
      .then(r => r.json())
      .then((d: TxReport & { success: boolean }) => { if (d.success !== false) setReport(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { load() }, [load])

  const txTypes = report ? ['all', ...Object.keys(report.byType)] : ['all']
  const visible = (report?.recent ?? [])
    .filter(t => walletFilter === 'all' || t.walletType === walletFilter)
    .filter(t => typeFilter === 'all' || t.type === typeFilter)
    .filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase())
      || t.walletAddress.toLowerCase().includes(search.toLowerCase())
      || t.userEmail.toLowerCase().includes(search.toLowerCase())
      || (t.txHash ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Transaction Volume</div>
        <button onClick={load} style={{ padding: '6px 12px', borderRadius: 8, background: S, border: `1px solid ${B}`, color: 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>Refresh</button>
      </div>

      {/* Volume summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20, marginTop: 16 }}>
        {[
          { label: 'Total Volume', value: report ? `$${report.totalVolume.toFixed(2)}` : '—', sub: `${report?.txCount ?? 0} transactions`, color: '#0066FF' },
          { label: 'Main Wallet', value: report ? `$${report.mainVolume.toFixed(2)}` : '—', sub: 'User transactions', color: '#00C853' },
          { label: 'Agent Wallet', value: report ? `$${report.agentVolume.toFixed(2)}` : '—', sub: 'Agent spend', color: '#F0A500' },
        ].map(card => (
          <div key={card.label} style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: card.color, letterSpacing: '-0.03em' }}>{card.value}</div>
            <div style={{ fontSize: 11, color: 'var(--nan-text2)', marginTop: 2 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* By-type breakdown */}
      {report && Object.keys(report.byType).length > 0 && (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>By Type</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(report.byType).map(([type, { count, volume }]) => (
              <div key={type} style={{ background: 'var(--nan-surface2)', border: `1px solid ${B}`, borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', color: 'var(--nan-text)' }}>{type}</span>
                <span style={{ color: 'var(--nan-text2)', marginLeft: 6 }}>{count}× · ${volume.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search address, email, hash…"
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none' }} />
        {(['all', 'main', 'agent'] as const).map(w => (
          <button key={w} onClick={() => setWalletFilter(w)}
            style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${walletFilter === w ? '#0066FF' : B}`, background: walletFilter === w ? 'rgba(0,102,255,0.10)' : S, color: walletFilter === w ? '#0066FF' : 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS, textTransform: 'capitalize' }}>{w}</button>
        ))}
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 12, fontFamily: SANS, cursor: 'pointer' }}>
          {txTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>
          No transactions tracked yet. They appear here as users make transfers.
        </div>
      ) : (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 70px 90px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${B}`, background: 'var(--nan-surface2)' }}>
            {['Wallet', 'Description', 'Amount', 'Type', 'Time'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          {visible.slice(0, 200).map((t, i) => (
            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 70px 90px', gap: 8, padding: '11px 16px', borderBottom: i < visible.length - 1 ? `1px solid ${B}` : 'none', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: t.walletType === 'agent' ? 'rgba(240,165,0,0.12)' : 'rgba(0,102,255,0.10)', color: t.walletType === 'agent' ? '#F0A500' : '#0066FF' }}>
                  {t.walletType}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                <div style={{ fontSize: 10, color: 'var(--nan-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.userEmail !== 'anonymous' ? t.userEmail.split('@')[0] + '***' : 'anon'}
                  {t.txHash ? ` · ${t.txHash.slice(0, 8)}…` : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.type === 'received' ? '#00C853' : 'var(--nan-text)' }}>
                ${t.amount.toFixed(2)}
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: 'var(--nan-surface2)', color: 'var(--nan-text2)', textTransform: 'capitalize' }}>{t.type}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>
                {new Date(t.timestamp).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminDashboardInner() {
  const { activity, setActiveView } = useAppStore()
  const [tab, setTab] = useState<'overview' | 'transactions' | 'support' | 'activity' | 'circle' | 'users' | 'feedback' | 'suggestions' | 'audit'>('overview')
  // 'My Activity' tab shows only this browser's own activity store
  // Env var check (Vite exposes VITE_ vars)
  const hasGroq = Boolean(import.meta.env.VITE_GROQ_API_KEY)
  const hasX402 = Boolean(import.meta.env.VITE_X402_SELLER_ADDRESS)
  const hasOnramp = Boolean(import.meta.env.VITE_STABLECOIN_KIT_KEY)

  const CIRCLE_INFRA: InfraItem[] = [
    { name: 'Arc Testnet RPC', status: 'live', desc: 'USDC as native gas · sub-second finality', icon: <Globe size={16} /> },
    { name: 'USDC ERC-20 Contract', status: 'live', desc: '0x3600...0000 · balances + transfers', icon: <CheckCircle size={16} color="#ffffff" /> },
    { name: 'CCTP V2 Bridge', status: 'live', desc: 'Arc ↔ Base ↔ Arbitrum ↔ Ethereum', icon: <ArrowUpRight size={16} /> },
    { name: 'Circle AppKit Swap', status: 'live', desc: 'USDC ↔ tokens via Circle swap routes', icon: <RefreshCw size={16} /> },
    { name: 'x402 Micropayments', status: hasX402 ? 'live' : 'ready', desc: 'Per-call USDC payments for AI agent API', icon: <Zap size={16} /> },
    { name: 'Circle Onramp Kit', status: hasOnramp ? 'live' : 'pending', desc: 'Fiat → USDC · needs Kit Key', icon: <ArrowDownLeft size={16} /> },
    { name: 'Groq AI (Agent Chat)', status: hasGroq ? 'live' : 'pending', desc: 'Real AI responses · needs GROQ_API_KEY', icon: <Cpu size={16} /> },
    { name: 'Permit2', status: 'live', desc: '0x0000...D473 · gasless USDC approvals', icon: <Shield size={16} /> },
  ]

  const tabs = [
    { id: 'overview',     label: 'Overview' },
    { id: 'users',        label: 'Users & Wallets' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'support',      label: 'Support' },
    { id: 'feedback',     label: 'Feedback' },
    { id: 'suggestions',  label: 'Suggestions' },
    { id: 'activity',     label: 'My Activity' },
    { id: 'circle',       label: 'Circle Infra' },
    { id: 'audit',        label: 'Audit Log' },
  ] as const

  return (
    <div style={{ height: '100vh', background: 'var(--nan-bg)', fontFamily: SANS, color: 'var(--nan-text)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--nan-surface2)', borderBottom: '1px solid var(--nan-bdr)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setActiveView('home')}
            aria-label="Back to app"
            style={{ background: S, border: `1px solid ${B}`, borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <ArrowLeft size={16} color='var(--nan-text)' />
          </button>
          <span style={{fontWeight:700,fontSize:18,letterSpacing:"-0.02em",color:"var(--nan-text)",fontFamily:"Inter,sans-serif"}}>NAN</span>
          <div style={{ width: 1, height: 20, background: B }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nan-text2)' }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={adminLogout} style={{ fontSize: 11, fontWeight: 600, color: 'var(--nan-text2)', background: S, border: `1px solid ${B}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: SANS }}>Sign out</button>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nan-text)', background: 'var(--nan-surface2)', padding: '2px 8px', borderRadius: 20 }}>● Live</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: 'var(--nan-surface2)', borderBottom: '1px solid var(--nan-bdr)', display: 'flex', overflowX: 'auto', padding: '0 20px', flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none',
            border: 'none', fontFamily: SANS, whiteSpace: 'nowrap',
            color: tab === t.id ? '#ffffff' : 'var(--nan-text2)',
            borderBottom: `2px solid ${tab === t.id ? '#ffffff' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ padding: '20px', maxWidth: 900, margin: '0 auto' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && <AdminOverviewPanel goTo={(t) => setTab(t as typeof tab)} />}

        {/* ── TRANSACTIONS ── */}
        {tab === 'transactions' && <AdminTxPanel />}

        {/* ── SUPPORT ── */}
        {tab === 'support' && <AdminSupportPanel />}

        {/* ── FEEDBACK ── */}
        {tab === 'feedback' && <AdminFeedbackPanel />}

        {/* ── SUGGESTIONS ── */}
        {tab === 'suggestions' && <AdminSuggestionsPanel />}




        {/* ── ACTIVITY ── */}
        {tab === 'activity' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>All Transactions</div>
            {activity.length === 0 ? (
              <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: 'var(--nan-text2)', fontSize: 13 }}>
                No transactions yet. Connect a wallet and make a transfer to see activity here.
              </div>
            ) : (
              <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: `1px solid ${B}`, background: S }}>
                  {['Type', 'Amount', 'Status', 'Hash'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {activity.map((a, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < activity.length - 1 ? `1px solid ${B}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{a.type}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{a.amount?.toFixed(2) ?? '—'} USDC</div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nan-text)', background: 'var(--nan-surface2)', padding: '2px 7px', borderRadius: 20 }}>
                        {a.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--nan-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.txHash ? a.txHash.slice(0, 12) + '...' : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CIRCLE INFRA ── */}
        {tab === 'circle' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Circle Infrastructure</div>
            <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 20 }}>All Circle SDKs and contracts integrated into NAN</div>
            {CIRCLE_INFRA.map(item => <InfraCard key={item.name} {...item} />)}

            {/* Env var checklist */}
            <div style={{ marginTop: 24, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Environment Variables</div>
            <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, overflow: 'hidden' }}>
              {[
                { key: 'GROQ_API_KEY', desc: 'Real AI agent chat', set: hasGroq },
                { key: 'VITE_X402_SELLER_ADDRESS', desc: 'x402 micropayment receiver', set: hasX402 },
                { key: 'CIRCLE_API_KEY', desc: 'Buy USDC onramp widget', set: hasOnramp },
                { key: 'SMTP_HOST + SMTP_USER + SMTP_PASS', desc: 'Real email OTP delivery', set: false },
              ].map(({ key, desc, set }, i) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < 3 ? `1px solid ${B}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: 'var(--nan-text)' }}>{key}</div>
                    <div style={{ fontSize: 11, color: 'var(--nan-text2)', marginTop: 2 }}>{desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12 }}>
                    {set ? <CheckCircle size={14} color="#ffffff" /> : <XCircle size={14} color="var(--nan-text3)" />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: set ? '#ffffff' : 'var(--nan-text3)' }}>{set ? 'Set' : 'Not set'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* ── FEEDBACK ── */}
        {tab === 'feedback' && <AdminFeedbackPanel />}

        {/* ── SUGGESTIONS ── */}
        {tab === 'suggestions' && <AdminSuggestionsPanel />}

        {/* ── AUDIT LOG ── */}
        {tab === 'audit' && <AdminAuditPanel />}

        {/* ── USERS ── */}
        {tab === 'users' && <AdminUsersPanel />}
      </div>
      </div>
    </div>
  )
}
