import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Plus, ChevronRight, ArrowLeft,
  Send, Clock, CheckCircle, AlertCircle, RotateCcw
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const SANS = "var(--nan-font, 'Inter', sans-serif)"

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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  const map = {
    open: { label: 'Open', color: 'var(--nan-blue)', bg: 'var(--nan-blue-dim)', Icon: Clock },
    in_progress: { label: 'In Progress', color: 'var(--nan-gold)', bg: 'var(--nan-gold-dim)', Icon: AlertCircle },
    resolved: { label: 'Resolved', color: 'var(--nan-green)', bg: 'var(--nan-green-dim)', Icon: CheckCircle },
  }
  const { label, color, bg, Icon } = map[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: bg, color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={11} color={color} />
      {label}
    </span>
  )
}

const HELP_TOPICS = [
  { icon: '💳', title: 'Payments & Transfers', desc: 'Sending, receiving, and transaction issues' },
  { icon: '🤖', title: 'AI Agent Help', desc: 'Agent permissions, spending limits, and behaviour' },
  { icon: '🔒', title: 'Account & Security', desc: 'Login, access, and account settings' },
  { icon: '🔄', title: 'Bridge & Swap', desc: 'Cross-chain transfers and token exchanges' },
]

export function SupportPage() {
  const { auth, fetchNotifications } = useAppStore()
  const [view, setView] = useState<'list' | 'new' | 'ticket'>('list')
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [replyLoading, setReplyLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const token = auth?.sessionToken

  async function safeJson<T>(res: Response): Promise<T | null> {
    const text = await res.text()
    try { return JSON.parse(text) as T }
    catch { return null }
  }

  const fetchTickets = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', { headers: { authorization: `Bearer ${token}` } })
      const data = await safeJson<{ tickets: SupportTicket[] }>(res)
      if (data?.tickets) setTickets(data.tickets)
    } finally {
      setLoading(false)
    }
  }

  const openTicket = async (t: SupportTicket) => {
    if (!token) return
    try {
      const res = await fetch(`/api/support/tickets/${t.id}`, { headers: { authorization: `Bearer ${token}` } })
      const data = await safeJson<{ ticket: SupportTicket }>(res)
      if (data?.ticket) {
        setSelected(data.ticket)
        setTickets(prev => prev.map(x => x.id === t.id ? { ...x, hasUnreadAdmin: false } : x))
      }
    } catch {
      setSelected(t)
    }
    setView('ticket')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const submitNew = async () => {
    if (!token || !newSubject.trim() || !newMessage.trim()) {
      setError('Please fill in both fields.')
      return
    }
    setSubmitLoading(true)
    setError('')
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: newSubject.trim(), message: newMessage.trim() }),
      })
      const data = await safeJson<{ ticket: SupportTicket; success?: boolean; error?: string; message?: string }>(res)
      if (!data) throw new Error(res.status === 503 ? 'Service temporarily unavailable — please try again shortly.' : `Server error (${res.status})`)
      if (data.error ?? data.message) throw new Error(data.error ?? data.message)
      if (data.ticket) {
        setTickets(prev => [data.ticket, ...prev])
        setNewSubject('')
        setNewMessage('')
        setSelected(data.ticket)
        setView('ticket')
        void fetchNotifications()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit. Please try again.')
    } finally {
      setSubmitLoading(false)
    }
  }

  const sendReply = async () => {
    if (!token || !selected || !replyText.trim()) return
    setReplyLoading(true)
    try {
      const res = await fetch(`/api/support/tickets/${selected.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: replyText.trim() }),
      })
      const data = await safeJson<{ ticket: SupportTicket }>(res)
      if (data?.ticket) {
        setSelected(data.ticket)
        setTickets(prev => prev.map(x => x.id === data.ticket.id ? data.ticket : x))
        setReplyText('')
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      }
    } finally {
      setReplyLoading(false)
    }
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchTickets() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── List view ────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <MessageSquare size={18} color="var(--nan-blue)" />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--nan-text)' }}>Support</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Get help and track your requests</div>
        </div>
        <button onClick={() => setView('new')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--nan-blue)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: SANS }}>
          <Plus size={14} />
          New request
        </button>
      </div>

      {/* Help topics */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Common topics</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {HELP_TOPICS.map(t => (
            <button key={t.title} onClick={() => { setNewSubject(t.title); setView('new') }} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', cursor: 'pointer', fontFamily: SANS, transition: 'border-color 0.15s' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 2 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--nan-text2)', lineHeight: 1.4 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ticket list */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Your requests</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
          <MessageSquare size={28} style={{ margin: '0 auto 12px', color: 'var(--nan-text3)' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 6 }}>No support requests yet</div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginBottom: 16, lineHeight: 1.5 }}>Need help? Submit a request and our team will respond shortly.</div>
          <button onClick={() => setView('new')} style={{ padding: '8px 20px', borderRadius: 9, background: 'var(--nan-blue)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: SANS }}>
            Submit a request
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, overflow: 'hidden' }}>
          {tickets.map((t, i) => (
            <div key={t.id} onClick={() => { void openTicket(t) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < tickets.length - 1 ? '1px solid var(--nan-bdr)' : 'none', cursor: 'pointer', background: t.hasUnreadAdmin ? 'var(--nan-blue-dim)' : 'transparent', transition: 'background 0.15s' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: t.hasUnreadAdmin ? 700 : 600, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{t.subject}</span>
                  {t.hasUnreadAdmin && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--nan-blue)', flexShrink: 0 }} />}
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>{t.id} · updated {timeAgo(t.updatedAt)}</div>
              </div>
              <ChevronRight size={14} color="var(--nan-text3)" />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── New ticket view ──────────────────────────────────────────────────────────
  if (view === 'new') return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS }}>
      <button onClick={() => { setView('list'); setError('') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', background: 'none', border: 'none', color: 'var(--nan-text2)', fontSize: 13, cursor: 'pointer', marginBottom: 18, fontFamily: SANS }}>
        <ArrowLeft size={14} /> Back
      </button>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>New support request</div>
      <div style={{ fontSize: 13, color: 'var(--nan-text2)', marginBottom: 22 }}>Describe your issue and we'll get back to you.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text2)', display: 'block', marginBottom: 6 }}>Subject</label>
          <input
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
            placeholder="Brief description of your issue"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)', fontSize: 14, fontFamily: SANS, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text2)', display: 'block', marginBottom: 6 }}>Message</label>
          <textarea
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Describe your issue in detail..."
            rows={6}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)', fontSize: 14, fontFamily: SANS, boxSizing: 'border-box', outline: 'none', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--nan-red)', fontWeight: 500 }}>{error}</div>}
        <button
          onClick={() => { void submitNew() }}
          disabled={submitLoading}
          style={{ padding: '12px', borderRadius: 11, background: submitLoading ? 'var(--nan-surface2)' : 'var(--nan-blue)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: submitLoading ? 'default' : 'pointer', fontFamily: SANS, transition: 'background 0.15s' }}
        >
          {submitLoading ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </div>
  )

  // ── Ticket conversation view ─────────────────────────────────────────────────
  if (view === 'ticket' && selected) return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => { setView('list'); void fetchTickets() }} style={{ background: 'none', border: 'none', color: 'var(--nan-text2)', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={18} color="var(--nan-text2)" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.subject}</div>
          <div style={{ fontSize: 11, color: 'var(--nan-text3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
            <span>{selected.id}</span>
            <span>·</span>
            <StatusBadge status={selected.status} />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
        {selected.messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.author === 'customer' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '78%' }}>
              <div style={{ fontSize: 10, color: 'var(--nan-text3)', marginBottom: 3, textAlign: msg.author === 'customer' ? 'right' : 'left', fontWeight: 500 }}>
                {msg.author === 'customer' ? 'You' : 'NAN Support'} · {fmtTime(msg.timestamp)}
              </div>
              <div style={{
                padding: '11px 14px', borderRadius: msg.author === 'customer' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.author === 'customer' ? 'var(--nan-blue)' : 'var(--nan-surface)',
                border: msg.author === 'customer' ? 'none' : '1px solid var(--nan-bdr)',
                color: msg.author === 'customer' ? '#fff' : 'var(--nan-text)',
                fontSize: 13, lineHeight: 1.6,
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {selected.status === 'resolved' && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--nan-green)', background: 'var(--nan-green-dim)', padding: '5px 14px', borderRadius: 20, fontWeight: 600 }}>
              ✓ This request has been resolved
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      {selected.status !== 'resolved' ? (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Type a reply…"
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply() } }}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, resize: 'none', lineHeight: 1.5 }}
          />
          <button onClick={() => { void sendReply() }} disabled={replyLoading || !replyText.trim()} style={{ width: 36, height: 36, borderRadius: 9, background: replyText.trim() ? 'var(--nan-blue)' : 'var(--nan-surface2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: replyText.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}>
            <Send size={15} color={replyText.trim() ? '#fff' : 'var(--nan-text3)'} />
          </button>
        </div>
      ) : (
        <button onClick={() => {
          void fetch(`/api/support/tickets/${selected.id}/reply`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ message: 'Reopening this request.' }),
          }).then(r => r.json()).then((d: { ticket: SupportTicket }) => {
            if (d.ticket) { setSelected(d.ticket); setTickets(prev => prev.map(x => x.id === d.ticket.id ? d.ticket : x)) }
          })
        }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 11, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>
          <RotateCcw size={14} /> Reopen this request
        </button>
      )}
    </div>
  )

  return null
}
