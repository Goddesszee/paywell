/**
 * PaymentRequestsPage — NAN Payment Requests management hub
 * Three sub-views: list → create form → detail
 */
import React, { useState, useMemo } from 'react'
import {
  Plus, Search, Filter, ChevronRight, Copy, Share2,
  X, Check, Clock, CheckCircle2, XCircle, Eye,
  Link2, FileText,
  AlertCircle, CalendarDays, DollarSign, User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, PaymentRequest, PaymentRequestStatus } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAccount } from 'wagmi'

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
    <div style={{ width: '100%', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>
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
          }}
        >
          <Plus size={15} /> New Request
        </button>
      </div>

      {/* Summary cards */}
      {paymentRequests.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '16px 0' }}>
          {[
            { label: 'Pending', value: totals.count + ' request' + (totals.count !== 1 ? 's' : ''), sub: `${totals.pending.toFixed(2)} USDC`, color: GOLD },
            { label: 'Paid',    value: paymentRequests.filter(r => r.status === 'paid').length + ' paid', sub: `${totals.paid.toFixed(2)} USDC`, color: GREEN },
            { label: 'Total',   value: paymentRequests.length + ' total', sub: `${totals.total.toFixed(2)} USDC`, color: BLUE },
          ].map(s => (
            <div key={s.label} style={{
              background: C.surf, border: `1px solid ${C.bdr}`,
              borderRadius: 12, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{s.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: s.color, fontFamily: MONO }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search requests…"
          style={{
            width: '100%', padding: '9px 12px 9px 34px', boxSizing: 'border-box',
            background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10,
            fontSize: 13, fontFamily: F, color: C.text, outline: 'none',
          }}
        />
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {statuses.map(s => (
          <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
            padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            background: statusFilter === s.id ? BLUE : C.surf,
            color: statusFilter === s.id ? '#fff' : C.t2,
            border: `1px solid ${statusFilter === s.id ? BLUE : C.bdr}`,
          }}>{s.label}</button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '52px 20px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: C.surf, border: `1px solid ${C.bdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            {search || statusFilter !== 'all' ? <Filter size={20} color={C.t3} /> : <FileText size={20} color={C.t3} />}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 5 }}>
            {search || statusFilter !== 'all' ? 'No matching requests' : 'No payment requests yet'}
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>
            {search || statusFilter !== 'all'
              ? 'Try different search terms or clear the filter'
              : 'Create your first request and share the payment link'}
          </div>
          {!search && statusFilter === 'all' && (
            <button onClick={onNew} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '11px 20px', borderRadius: 12,
              background: BLUE, border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
            }}>
              <Plus size={14} /> New Request
            </button>
          )}
        </div>
      )}

      {/* Request list */}
      {filtered.length > 0 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, overflow: 'hidden' }}>
          {filtered.map((req, idx) => (
            <div
              key={req.id}
              onClick={() => onOpen(req)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderBottom: idx < filtered.length - 1 ? `1px solid ${C.bdr}` : 'none',
                cursor: 'pointer',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: STATUS_META[req.status].bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={16} color={STATUS_META[req.status].color} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {req.title}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                  {req.refNumber} · {req.recipientName}
                  {req.dueDate && ` · Due ${new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                </div>
              </div>

              {/* Amount + status */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: req.status === 'paid' ? GREEN : C.text, fontFamily: MONO, marginBottom: 3 }}>
                  {req.amount.toFixed(2)} {req.currency}
                </div>
                <StatusBadge status={req.status} />
              </div>

              <ChevronRight size={14} color={C.t3} />
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
    <div style={{ width: '100%', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 34, height: 34, borderRadius: 10,
          background: C.surf, border: `1px solid ${C.bdr}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <X size={15} color={C.t2} />
        </button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>New Payment Request</h2>
          <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>Fill in the details and share the payment link</p>
        </div>
      </div>

      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '20px' }}>

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
    toast.success('Request cancelled')
    onBack()
  }

  const handleDelete = () => {
    removePaymentRequest(req.id)
    toast.success('Request deleted')
    onBack()
  }

  // Row is defined at module level — pass theme colors as props
  const rowProps = { bdr: C.bdr, t3: C.t3, text: C.text }

  return (
    <div style={{ width: '100%', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          width: 34, height: 34, borderRadius: 10,
          background: C.surf, border: `1px solid ${C.bdr}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <X size={15} color={C.t2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {req.title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: C.t3, fontFamily: MONO }}>{req.refNumber}</span>
            <StatusBadge status={req.status} />
          </div>
        </div>
      </div>

      {/* Amount hero */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14,
        padding: '20px', marginBottom: 14, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>
          Amount Requested
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: req.status === 'paid' ? GREEN : C.text, fontFamily: MONO, letterSpacing: '-0.03em', marginBottom: 4 }}>
          {req.amount.toFixed(2)}
          <span style={{ fontSize: 18, fontWeight: 600, color: C.t3, marginLeft: 8 }}>{req.currency}</span>
        </div>
        {req.status === 'paid' && req.paidAt && (
          <div style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>
            Paid on {new Date(req.paidAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Action buttons — primary actions */}
      {req.status !== 'paid' && req.status !== 'cancelled' && req.status !== 'expired' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <button onClick={copyLink} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '12px', borderRadius: 12,
            background: BLUE, border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
          }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={shareLink} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '12px', borderRadius: 12,
            background: C.surf, border: `1px solid ${C.bdr}`, color: C.text,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
          }}>
            <Share2 size={14} /> Share
          </button>
        </div>
      )}

      {/* Open payment page */}
      {req.status !== 'paid' && req.status !== 'cancelled' && req.status !== 'expired' && (
        <a
          href={payLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '11px', borderRadius: 12, marginBottom: 14,
            background: C.surf, border: `1px solid ${C.bdr}`,
            color: BLUE, fontSize: 13, fontWeight: 700,
            textDecoration: 'none', fontFamily: F,
          }}
        >
          <Link2 size={13} /> Preview Payment Page
        </a>
      )}

      {/* Detail rows */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '4px 16px', marginBottom: 14 }}>
        <Row {...rowProps} label="Reference number" value={req.refNumber} mono />
        {req.recipientName && <Row {...rowProps} label="Recipient" value={req.recipientName} />}
        <Row {...rowProps} label="Amount" value={`${req.amount.toFixed(2)} ${req.currency}`} mono />
        <Row {...rowProps} label="Status" value={STATUS_META[req.status].label} />
        <Row {...rowProps} label="Created" value={new Date(req.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
        {req.dueDate && <Row {...rowProps} label="Due date" value={new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })} />}
        {req.note && <Row {...rowProps} label="Note" value={req.note} />}
        {req.reference && <Row {...rowProps} label="Your reference" value={req.reference} mono />}
        {req.paidAt && <Row {...rowProps} label="Paid on" value={new Date(req.paidAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />}
        {req.paidTxHash && <Row {...rowProps} label="Transaction" value={`${req.paidTxHash.slice(0,10)}…${req.paidTxHash.slice(-6)}`} mono />}
      </div>

      {/* Payment instructions (to address) */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Payment destination
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 12, fontFamily: MONO, color: C.t2, wordBreak: 'break-all' }}>{req.creatorAddress ?? '—'}</span>
          <button
            onClick={() => { if (req.creatorAddress) { void navigator.clipboard.writeText(req.creatorAddress); toast.success('Address copied') } }}
            style={{ flexShrink: 0, background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <Copy size={12} color={C.t2} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>Arc Testnet · USDC</div>
      </div>

      {/* If paid — link to activity */}
      {req.status === 'paid' && (
        <button
          onClick={() => setActiveView('activity')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '13px', borderRadius: 12, marginBottom: 14,
            background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)',
            color: GREEN, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
          }}
        >
          <CheckCircle2 size={14} /> View in Activity
        </button>
      )}

      {/* Cancel / delete */}
      {canCancel && (
        <button onClick={handleCancel} style={{
          width: '100%', padding: '12px', borderRadius: 12,
          background: 'transparent', border: `1px solid ${C.bdr}`, color: C.t3,
          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
        }}>
          Cancel Request
        </button>
      )}
      {canDelete && (
        <button onClick={handleDelete} style={{
          width: '100%', padding: '12px', borderRadius: 12, marginTop: 8,
          background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)',
          color: RED, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F,
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
