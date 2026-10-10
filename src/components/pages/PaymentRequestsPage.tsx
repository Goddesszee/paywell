/**
 * PaymentRequestsPage — NAN Payment Requests management hub
 * Three sub-views: list → create form → detail
 */
import React, { useState, useMemo } from 'react'
import {
  Plus, Search, ChevronRight, Copy, Share2,
  X, Check, Clock, CheckCircle2, XCircle, Eye,
  Link2, FileText,
  AlertCircle, CalendarDays, DollarSign, User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, PaymentRequest, PaymentRequestStatus } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAccount } from 'wagmi'
import { syncPrCreate, syncPrUpdate, syncPrDelete } from '../../hooks/useBackendSync'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const BLUE = '#0066FF'
const GREEN = '#00C853'
const RED   = '#FF3B3B'
const GOLD  = '#F0A500'

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META: Record<PaymentRequestStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: GOLD,  bg: 'rgba(240,165,0,0.10)',   Icon: Clock },
  viewed:    { label: 'Viewed',    color: BLUE,  bg: 'rgba(0,102,255,0.08)',   Icon: Eye },
  paid:      { label: 'Paid',      color: GREEN, bg: 'rgba(0,200,83,0.10)',    Icon: CheckCircle2 },
  expired:   { label: 'Expired',   color: RED,   bg: 'rgba(255,59,59,0.08)',   Icon: XCircle },
  cancelled: { label: 'Cancelled', color: '#8A8FA8', bg: 'rgba(138,143,168,0.08)', Icon: XCircle },
}

function StatusBadge({ status }: { status: PaymentRequestStatus }) {
  const m = STATUS_META[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: m.bg, fontSize: 11, fontWeight: 700,
      color: m.color, letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      <m.Icon size={10} /> {m.label}
    </span>
  )
}

// ── Build the payment link for a request ──────────────────────────────────────
function buildPayLink(req: PaymentRequest): string {
  const base = window.location.origin
  const params = new URLSearchParams()
  params.set('pr', req.id)
  params.set('pay', req.creatorAddress ?? '')
  params.set('amount', String(req.amount))
  if (req.title) params.set('note', req.title)
  return `${base}?${params.toString()}`
}

// ── Row — module-level so it never remounts on parent re-render ───────────────
function Row({ label, value, mono, bdr, t3, text }: {
  label: string; value: string; mono?: boolean
  bdr: string; t3: string; text: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '10px 0', borderBottom: `1px solid ${bdr}`, gap: 16,
    }}>
      <span style={{ fontSize: 12, color: t3, whiteSpace: 'nowrap', paddingTop: 1 }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 600, color: text, textAlign: 'right',
        wordBreak: 'break-all', fontFamily: mono ? MONO : F,
      }}>{value}</span>
    </div>
  )
}

// ── Field — module-level so it never remounts on parent re-render ─────────────
function Field({ label, error, labelColor = '#6B7280', children }: {
  label: string; error?: string; labelColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: labelColor, marginBottom: 6, letterSpacing: '0.03em' }}>
        {label}
      </label>
      {children}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
          <AlertCircle size={12} color={RED} />
          <span style={{ fontSize: 11, color: RED }}>{error}</span>
        </div>
      )}
    </div>
  )
}

// ── sub-views ──────────────────────────────────────────────────────────────────
type SubView = 'list' | 'create' | 'detail'

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({
  onNew,
  onOpen,
}: {
  onNew: () => void
  onOpen: (req: PaymentRequest) => void
}) {
  const C = useNanTheme()
  const { paymentRequests, updatePaymentRequest } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaymentRequestStatus | 'all'>('all')

  // Auto-expire past-due pending/viewed requests
  useMemo(() => {
    const now = new Date()
    paymentRequests.forEach(r => {
      if ((r.status === 'pending' || r.status === 'viewed') && r.dueDate) {
        if (new Date(r.dueDate) < now) {
          updatePaymentRequest(r.id, { status: 'expired' })
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRequests.length])

  const filtered = useMemo(() => {
    return [...paymentRequests]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(r => statusFilter === 'all' || r.status === statusFilter)
      .filter(r => {
        if (!search) return true
        const q = search.toLowerCase()
        return (
          r.title.toLowerCase().includes(q) ||
          r.refNumber.toLowerCase().includes(q) ||
          (r.recipientName?.toLowerCase().includes(q) ?? false) ||
          (r.reference?.toLowerCase().includes(q) ?? false)
        )
      })
  }, [paymentRequests, statusFilter, search])

  const totals = useMemo(() => ({
    pending:  paymentRequests.filter(r => r.status === 'pending' || r.status === 'viewed').reduce((s, r) => s + r.amount, 0),
    paid:     paymentRequests.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0),
    total:    paymentRequests.reduce((s, r) => s + r.amount, 0),
    count:    paymentRequests.filter(r => r.status === 'pending' || r.status === 'viewed').length,
  }), [paymentRequests])

  const statuses: Array<{ id: PaymentRequestStatus | 'all'; label: string }> = [
    { id: 'all',      label: 'All' },
    { id: 'pending',  label: 'Pending' },
    { id: 'viewed',   label: 'Viewed' },
    { id: 'paid',     label: 'Paid' },
    { id: 'expired',  label: 'Expired' },
    { id: 'cancelled',label: 'Cancelled' },
  ]

  return (
    <div style={{ width: '100%', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Payment Requests
          </h1>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 3, marginBottom: 0 }}>
            Create, share and track payment requests
          </p>
        </div>
        <button
          onClick={onNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 12,
            background: BLUE, border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
            boxShadow: '0 4px 16px rgba(0,102,255,0.3)', flexShrink: 0,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Plus size={15} /> New
        </button>
      </div>

      {/* ── Summary cards ── */}
      {paymentRequests.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Pending', count: totals.count, sub: totals.pending.toFixed(2), color: GOLD },
            { label: 'Paid',    count: paymentRequests.filter(r => r.status === 'paid').length, sub: totals.paid.toFixed(2), color: GREEN },
            { label: 'Total',   count: paymentRequests.length, sub: totals.total.toFixed(2), color: BLUE },
          ].map(s => (
            <div key={s.label} style={{
              background: C.surf, border: `1px solid ${C.bdr}`,
              borderRadius: 16, padding: '14px 12px', minWidth: 0,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: MONO, lineHeight: 1, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.count}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.t2, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sub} USDC</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} color={C.t3} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search requests…"
          style={{
            width: '100%', padding: '12px 12px 12px 38px', boxSizing: 'border-box',
            background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12,
            fontSize: 14, fontFamily: F, color: C.text, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={14} color={C.t3} />
          </button>
        )}
      </div>

      {/* ── Filter chips ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2, msOverflowStyle: 'none', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {statuses.map(s => {
          const active = statusFilter === s.id
          return (
            <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
              padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
              background: active ? BLUE : C.surf,
              color: active ? '#fff' : C.t2,
              border: `1px solid ${active ? BLUE : C.bdr}`,
              transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent',
            }}>{s.label}</button>
          )
        })}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 20px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: C.surf, border: `1px solid ${C.bdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            {search || statusFilter !== 'all' ? <Search size={24} color={C.t3} /> : <FileText size={24} color={C.t3} />}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            {search ? 'No results found' : statusFilter !== 'all' ? `No ${statusFilter} requests` : 'No payment requests yet'}
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 28, lineHeight: 1.65, maxWidth: 280, margin: '0 auto 28px' }}>
            {search || statusFilter !== 'all'
              ? 'Try different search terms or clear the filter.'
              : 'Create a payment request and share the link to get paid instantly.'}
          </div>
          {!search && statusFilter === 'all' && (
            <button onClick={onNew} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '13px 24px', borderRadius: 12,
              background: BLUE, border: 'none', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
              boxShadow: '0 4px 16px rgba(0,102,255,0.28)',
              WebkitTapHighlightColor: 'transparent',
            }}>
              <Plus size={15} /> Create Request
            </button>
          )}
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setStatusFilter('all') }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 10,
              background: C.surf, border: `1px solid ${C.bdr}`, color: C.t2,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
            }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Request list ── */}
      {filtered.length > 0 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, overflow: 'hidden' }}>
          {filtered.map((req, idx) => (
            <div
              key={req.id}
              onClick={() => onOpen(req)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '16px',
                borderBottom: idx < filtered.length - 1 ? `1px solid ${C.bdr}` : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                background: STATUS_META[req.status].bg,
                border: `1px solid ${STATUS_META[req.status].color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={18} color={STATUS_META[req.status].color} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {req.title}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: MONO }}>{req.refNumber}</span>
                  {req.recipientName && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>{req.recipientName}</span></>}
                  {req.dueDate && <><span>·</span><span>Due {new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span></>}
                </div>
              </div>

              {/* Amount + status */}
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: req.status === 'paid' ? GREEN : C.text, fontFamily: MONO, whiteSpace: 'nowrap' }}>
                  {req.amount.toFixed(2)} <span style={{ fontSize: 10, color: C.t3, fontWeight: 600 }}>{req.currency}</span>
                </div>
                <StatusBadge status={req.status} />
              </div>

              <ChevronRight size={14} color={C.t3} style={{ flexShrink: 0, marginLeft: 2 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create form ───────────────────────────────────────────────────────────────
function CreateForm({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (req: PaymentRequest) => void
}) {
  const C = useNanTheme()
  const { addPaymentRequest, mainWalletAddress, auth } = useAppStore()
  const { address: wagmiAddress } = useAccount()
  const ownAddress = wagmiAddress ?? (auth?.circleWalletAddress) ?? mainWalletAddress

  const [title, setTitle] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'USDC' | 'EURC'>('USDC')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!title.trim())         e.title     = 'A title or description is required'
    if (!recipient.trim())     e.recipient = 'Enter a name or email for the recipient'
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) e.amount = 'Enter a valid amount greater than 0'
    if (dueDate && new Date(dueDate) < new Date()) e.dueDate = 'Due date must be in the future'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    if (!ownAddress) {
      toast.error('Connect a wallet first so we know where to receive payment')
      return
    }
    setSubmitting(true)
    const id = addPaymentRequest({
      title: title.trim(),
      description: note.trim() || undefined,
      recipientName: recipient.trim(),
      amount: parseFloat(amount),
      currency,
      dueDate: dueDate || undefined,
      note: note.trim() || undefined,
      reference: reference.trim() || undefined,
      status: 'pending',
      creatorAddress: ownAddress,
    })
    // Find the newly created request
    const { paymentRequests } = useAppStore.getState()
    const req = paymentRequests.find(r => r.id === id)
    setSubmitting(false)
    if (req) {
      void syncPrCreate(ownAddress, req)
      toast.success(`Request ${req.refNumber} created`)
      onCreated(req)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', boxSizing: 'border-box',
    background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10,
    fontSize: 14, fontFamily: F, color: C.text, outline: 'none',
  }

  const errStyle = (key: string): React.CSSProperties => errors[key]
    ? { ...inputStyle, borderColor: RED }
    : inputStyle

  return (
    <div style={{ width: '100%', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 20px' }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          background: C.surf, border: `1px solid ${C.bdr}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        }}>
          <X size={16} color={C.t2} />
        </button>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>New Payment Request</h2>
          <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>Fill in the details and share the payment link</p>
        </div>
      </div>

      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18, padding: '20px' }}>

        <Field labelColor={C.t2} label="Title / Description *" error={errors.title}>
          <input
            value={title} onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: '' })) }}
            placeholder="e.g. Freelance design work, Rent payment, Dinner split"
            style={errStyle('title')}
          />
        </Field>

        <Field labelColor={C.t2} label="Recipient / Customer *" error={errors.recipient}>
          <div style={{ position: 'relative' }}>
            <User size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              value={recipient} onChange={e => { setRecipient(e.target.value); setErrors(p => ({ ...p, recipient: '' })) }}
              placeholder="Name or email of who should pay"
              style={{ ...errStyle('recipient'), paddingLeft: 34 }}
            />
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginBottom: 16 }}>
          <Field labelColor={C.t2} label="Amount *" error={errors.amount}>
            <div style={{ position: 'relative' }}>
              <DollarSign size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="number" min="0" step="0.01"
                value={amount} onChange={e => { setAmount(e.target.value); setErrors(p => ({ ...p, amount: '' })) }}
                placeholder="0.00"
                style={{ ...errStyle('amount'), paddingLeft: 34 }}
              />
            </div>
          </Field>
          <Field labelColor={C.t2} label="Currency">
            <select
              value={currency} onChange={e => setCurrency(e.target.value as 'USDC' | 'EURC')}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="USDC">USDC</option>
              <option value="EURC">EURC</option>
            </select>
          </Field>
        </div>

        <Field labelColor={C.t2} label="Due Date (optional)" error={errors.dueDate}>
          <div style={{ position: 'relative' }}>
            <CalendarDays size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="date"
              value={dueDate} onChange={e => { setDueDate(e.target.value); setErrors(p => ({ ...p, dueDate: '' })) }}
              min={new Date().toISOString().slice(0, 10)}
              style={{ ...errStyle('dueDate'), paddingLeft: 34, colorScheme: C.isDark ? 'dark' : 'light' }}
            />
          </div>
        </Field>

        <Field labelColor={C.t2} label="Note (optional)">
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Any additional payment instructions or notes"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </Field>

        <Field labelColor={C.t2} label="Your Reference (optional)">
          <input
            value={reference} onChange={e => setReference(e.target.value)}
            placeholder="e.g. Invoice #1234, Project code"
            style={inputStyle}
          />
        </Field>

        {!ownAddress && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
            marginBottom: 14,
          }}>
            <AlertCircle size={14} color={GOLD} />
            <span style={{ fontSize: 12, color: GOLD, fontWeight: 500 }}>
              Connect a wallet first — your address is used to receive the payment
            </span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: BLUE, border: 'none', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            fontFamily: F, opacity: submitting ? 0.7 : 1,
            boxShadow: '0 4px 16px rgba(0,102,255,0.3)',
          }}
        >
          {submitting ? 'Creating…' : 'Create Payment Request'}
        </button>
      </div>
    </div>
  )
}

// ── Detail view ───────────────────────────────────────────────────────────────
function DetailView({
  req: initialReq,
  onBack,
}: {
  req: PaymentRequest
  onBack: () => void
}) {
  const C = useNanTheme()
  const { updatePaymentRequest, removePaymentRequest, paymentRequests, setActiveView } = useAppStore()
  const { address: wagmiAddr } = useAccount()
  const _detailWallet = (wagmiAddr ?? '').toLowerCase()
  // Always read from store so status updates are live
  const req = paymentRequests.find(r => r.id === initialReq.id) ?? initialReq

  const [copied, setCopied] = useState(false)
  const payLink = buildPayLink(req)

  const canCancel = req.status === 'pending' || req.status === 'viewed'
  const canDelete = req.status === 'cancelled' || req.status === 'expired'

  const copyLink = () => {
    void navigator.clipboard.writeText(payLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Payment link copied')
    // Mark as viewed once the link is copied (requester shared it)
    if (req.status === 'pending') updatePaymentRequest(req.id, { status: 'viewed' })
  }

  const shareLink = () => {
    if (navigator.share) {
      void navigator.share({
        title: `Payment Request: ${req.title}`,
        text: `${req.recipientName}, please pay ${req.amount} ${req.currency} — ${req.title}`,
        url: payLink,
      })
    } else {
      copyLink()
    }
    if (req.status === 'pending') updatePaymentRequest(req.id, { status: 'viewed' })
  }

  const handleCancel = () => {
    updatePaymentRequest(req.id, { status: 'cancelled' })
    void syncPrUpdate(_detailWallet, req.id, { status: 'cancelled' })
    toast.success('Request cancelled')
    onBack()
  }

  const handleDelete = () => {
    removePaymentRequest(req.id)
    void syncPrDelete(_detailWallet, req.id)
    toast.success('Request deleted')
    onBack()
  }

  // Row is defined at module level — pass theme colors as props
  const rowProps = { bdr: C.bdr, t3: C.t3, text: C.text }

  return (
    <div style={{ width: '100%', paddingBottom: 100 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 20px' }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          background: C.surf, border: `1px solid ${C.bdr}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent',
        }}>
          <X size={16} color={C.t2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.025em' }}>
            {req.title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: C.t3, fontFamily: MONO }}>{req.refNumber}</span>
            <StatusBadge status={req.status} />
          </div>
        </div>
      </div>

      {/* ── Amount hero ── */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 18,
        padding: '28px 20px', marginBottom: 12, textAlign: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 10 }}>
          Amount Requested
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, color: req.status === 'paid' ? GREEN : C.text, fontFamily: MONO, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 8 }}>
          {req.amount.toFixed(2)}
          <span style={{ fontSize: 20, fontWeight: 600, color: C.t3, marginLeft: 10 }}>{req.currency}</span>
        </div>
        {req.status === 'paid' && req.paidAt && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: GREEN, fontWeight: 600, background: 'rgba(0,200,83,0.10)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 20, padding: '4px 12px' }}>
            <CheckCircle2 size={12} /> Paid {new Date(req.paidAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
        {req.status === 'pending' && req.dueDate && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: GOLD, fontWeight: 600, background: 'rgba(240,165,0,0.10)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 20, padding: '4px 12px' }}>
            <Clock size={12} /> Due {new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* ── Primary actions ── */}
      {req.status !== 'paid' && req.status !== 'cancelled' && req.status !== 'expired' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <button onClick={copyLink} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '14px', borderRadius: 13,
            background: BLUE, border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
            boxShadow: '0 4px 14px rgba(0,102,255,0.28)', WebkitTapHighlightColor: 'transparent',
          }}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={shareLink} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '14px', borderRadius: 13,
            background: C.surf, border: `1px solid ${C.bdr}`, color: C.text,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F,
            WebkitTapHighlightColor: 'transparent',
          }}>
            <Share2 size={15} /> Share
          </button>
        </div>
      )}

      {/* ── Preview link ── */}
      {req.status !== 'paid' && req.status !== 'cancelled' && req.status !== 'expired' && (
        <a href={payLink} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '12px', borderRadius: 12, marginBottom: 12,
            background: C.surf, border: `1px solid ${C.bdr}`,
            color: BLUE, fontSize: 13, fontWeight: 700,
            textDecoration: 'none', fontFamily: F,
          }}
        >
          <Link2 size={13} /> Preview Payment Page
        </a>
      )}

      {/* ── Detail rows ── */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '4px 16px', marginBottom: 12 }}>
        <Row {...rowProps} label="Reference" value={req.refNumber} mono />
        {req.recipientName && <Row {...rowProps} label="Recipient" value={req.recipientName} />}
        <Row {...rowProps} label="Amount" value={`${req.amount.toFixed(2)} ${req.currency}`} mono />
        <Row {...rowProps} label="Status" value={STATUS_META[req.status].label} />
        <Row {...rowProps} label="Created" value={new Date(req.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
        {req.dueDate && <Row {...rowProps} label="Due date" value={new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })} />}
        {req.note && <Row {...rowProps} label="Note" value={req.note} />}
        {req.reference && <Row {...rowProps} label="Reference" value={req.reference} mono />}
        {req.paidAt && <Row {...rowProps} label="Paid on" value={new Date(req.paidAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />}
        {req.paidTxHash && <Row {...rowProps} label="Transaction" value={`${req.paidTxHash.slice(0,10)}…${req.paidTxHash.slice(-6)}`} mono />}
      </div>

      {/* ── Payment destination ── */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>
          Payment destination
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 12, fontFamily: MONO, color: C.t2, wordBreak: 'break-all', lineHeight: 1.5 }}>{req.creatorAddress ?? '—'}</span>
          <button
            onClick={() => { if (req.creatorAddress) { void navigator.clipboard.writeText(req.creatorAddress); toast.success('Address copied') } }}
            style={{ flexShrink: 0, background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}
          >
            <Copy size={13} color={C.t2} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Arc Testnet · USDC</div>
      </div>

      {/* ── If paid — view activity ── */}
      {req.status === 'paid' && (
        <button onClick={() => setActiveView('activity')} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '13px', borderRadius: 12, marginBottom: 12,
          background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)',
          color: GREEN, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
          WebkitTapHighlightColor: 'transparent',
        }}>
          <CheckCircle2 size={14} /> View in Activity
        </button>
      )}

      {/* ── Cancel / delete ── */}
      {canCancel && (
        <button onClick={handleCancel} style={{
          width: '100%', padding: '13px', borderRadius: 12,
          background: 'transparent', border: `1px solid ${C.bdr}`, color: C.t3,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
          WebkitTapHighlightColor: 'transparent',
        }}>
          Cancel Request
        </button>
      )}
      {canDelete && (
        <button onClick={handleDelete} style={{
          width: '100%', padding: '13px', borderRadius: 12, marginTop: 8,
          background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)',
          color: RED, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
          WebkitTapHighlightColor: 'transparent',
        }}>
          Delete Request
        </button>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function PaymentRequestsPage() {
  const [subView, setSubView] = useState<SubView>('list')
  const [selectedReq, setSelectedReq] = useState<PaymentRequest | null>(null)

  if (subView === 'create') {
    return (
      <CreateForm
        onBack={() => setSubView('list')}
        onCreated={req => { setSelectedReq(req); setSubView('detail') }}
      />
    )
  }

  if (subView === 'detail' && selectedReq) {
    return (
      <DetailView
        req={selectedReq}
        onBack={() => setSubView('list')}
      />
    )
  }

  return (
    <ListView
      onNew={() => setSubView('create')}
      onOpen={req => { setSelectedReq(req); setSubView('detail') }}
    />
  )
}
