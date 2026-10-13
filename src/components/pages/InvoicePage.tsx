/**
 * InvoicePage — unified Invoices & Requests hub.
 *
 * Quick Request mode  — amount + recipient + note. 10 seconds to create.
 * Full Invoice mode   — business info, line items, tax, Net terms, PDF.
 *
 * Both save as Invoice records (mode: 'quick' | 'full').
 * Payment Requests page is retired; this page replaces it entirely.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import {
  FileText, Plus, Download, Share2, Printer, Copy,
  Trash2, ChevronRight, X, Check, AlertCircle,
  ArrowRight, CheckCircle2, Clock, ExternalLink,
  ChevronDown, Eye, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type Invoice, type InvoiceLineItem, type InvoiceStatus } from '../../store/appStore'
import { downloadInvoicePdf, shareInvoice, printInvoice, invoicePaymentLink } from '../../lib/invoice-pdf'
import { useAccount } from 'wagmi'
import { TokenLogo } from '../ui/TokenLogo'

// ── Design tokens ────────────────────────────────────────────────────────────
const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface, #151B2D)'
const SURF2 = 'var(--nan-surface2, #1C2340)'
const BDR   = 'var(--nan-bdr, rgba(255,255,255,0.10))'
const BLUE  = '#0866F5'
const TEXT  = 'var(--nan-text, #FFFFFF)'
const T2    = 'var(--nan-text2, rgba(255,255,255,0.65))'
const T3    = 'var(--nan-text3, rgba(255,255,255,0.40))'
const GREEN = '#22C55E'
const RED   = '#EF4444'
const AMBER = '#F59E0B'

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }
function today() { return new Date().toISOString().slice(0, 10) }
function inDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}
function fmtAmt(n: number, cur = 'USDC') {
  return `${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}
function lineTotal(item: InvoiceLineItem) {
  const gross = item.quantity * item.unitPrice
  const disc  = gross * ((item.discount ?? 0) / 100)
  const after = gross - disc
  return after + after * ((item.tax ?? 0) / 100)
}
function computeTotals(items: InvoiceLineItem[]) {
  const subtotal      = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const discountTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.discount ?? 0) / 100), 0)
  const taxBase       = subtotal - discountTotal
  const taxTotal      = items.reduce((s, i) => {
    const base = i.quantity * i.unitPrice * (1 - (i.discount ?? 0) / 100)
    return s + base * ((i.tax ?? 0) / 100)
  }, 0)
  return { subtotal, discountTotal, taxTotal, total: taxBase + taxTotal }
}

const STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Draft',    color: T3,    bg: SURF2 },
  sent:           { label: 'Sent',     color: BLUE,  bg: 'rgba(8,102,245,0.10)' },
  viewed:         { label: 'Viewed',   color: BLUE,  bg: 'rgba(8,102,245,0.10)' },
  partially_paid: { label: 'Partial',  color: AMBER, bg: 'rgba(245,158,11,0.10)' },
  paid:           { label: 'Paid',     color: GREEN, bg: 'rgba(34,197,94,0.10)' },
  overdue:        { label: 'Overdue',  color: RED,   bg: 'rgba(239,68,68,0.10)' },
  cancelled:      { label: 'Cancelled',color: T3,    bg: SURF2 },
}

// ── Shared sub-components ────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
      {children}
      {error && <div style={{ fontSize: 11, color: RED, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={10} />{error}</div>}
    </div>
  )
}

function StatusBadge({ status, isQuick }: { status: InvoiceStatus; isQuick?: boolean }) {
  const m = STATUS_META[status] ?? STATUS_META.draft
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: m.color, background: m.bg, border: `1px solid ${m.color}22`, whiteSpace: 'nowrap' }}>
      {isQuick && <Zap size={9} />}{m.label}
    </span>
  )
}

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 13px',
  border: `1px solid ${BDR}`, borderRadius: 10,
  fontFamily: F, fontSize: 14, outline: 'none',
  color: TEXT, background: SURF2,
}
const btnPrimary: React.CSSProperties = {
  flex: 1, height: 44, background: BLUE, color: '#fff',
  border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 600,
  cursor: 'pointer', fontFamily: F, display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: 6,
}
const btnGhost: React.CSSProperties = {
  flex: 1, height: 44, background: 'transparent', color: T2,
  border: `1px solid ${BDR}`, borderRadius: 11, fontSize: 14,
  fontWeight: 600, cursor: 'pointer', fontFamily: F,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
}

function emptyItem(): InvoiceLineItem {
  return { id: uid(), name: '', quantity: 1, unitPrice: 0 }
}

const CURRENCIES = ['USDC', 'EURC']

function CurrencyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: `1px solid ${BDR}`, borderRadius: 10, fontFamily: F, fontSize: 14, outline: 'none', color: TEXT, background: SURF2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        <TokenLogo symbol={value} size={20} />
        <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{value}</span>
        <ChevronDown size={14} color={T2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: SURF2, border: `1px solid ${BDR}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {CURRENCIES.map(c => (
            <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
              style={{ width: '100%', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, background: c === value ? 'rgba(8,102,245,0.12)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: F, borderBottom: c !== CURRENCIES[CURRENCIES.length - 1] ? `1px solid ${BDR}` : 'none' }}>
              <TokenLogo symbol={c} size={22} />
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT, flex: 1, textAlign: 'left' }}>{c}</span>
              {c === value && <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${BLUE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 9, height: 9, borderRadius: '50%', background: BLUE }} /></div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Form state ────────────────────────────────────────────────────────────────
interface DraftForm {
  businessName: string; businessEmail: string; businessAddress: string
  customerName: string; customerEmail: string; customerAddress: string
  issueDate: string; dueDate: string; currency: string
  notes: string; paymentInstructions: string; payToAddress: string
  payToNanHandle: string
  items: InvoiceLineItem[]
  // quick mode fields
  quickAmount: string; quickNote: string; quickRecipient: string
}

function emptyForm(defaultAddress = ''): DraftForm {
  return {
    businessName: '', businessEmail: '', businessAddress: '',
    customerName: '', customerEmail: '', customerAddress: '',
    issueDate: today(), dueDate: inDays(30),
    currency: 'USDC', notes: '', paymentInstructions: '',
    payToAddress: defaultAddress,
    payToNanHandle: '',
    items: [emptyItem()],
    quickAmount: '', quickNote: '', quickRecipient: '',
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export function InvoicePage() {
  const { address: wagmiAddress } = useAccount()
  const { auth, profile, invoices, addInvoice, updateInvoice, removeInvoice, addContact } = useAppStore()
  const walletAddress = wagmiAddress ?? auth?.circleWalletAddress ?? auth?.walletAddress ?? ''

  type View = 'list' | 'new' | 'detail' | 'edit'
  type NewMode = 'choose' | 'quick' | 'full'

  const [view,        setView]        = useState<View>('list')
  const [newMode,     setNewMode]     = useState<NewMode>('choose')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [form,        setForm]        = useState<DraftForm>(() => emptyForm(walletAddress))
  const [errors,      setErrors]      = useState<Partial<Record<keyof DraftForm | 'items', string>>>({})
  const [delConfirm,  setDelConfirm]  = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const selected = useMemo(() => invoices.find(i => i.id === selectedId) ?? null, [invoices, selectedId])
  const totals   = useMemo(() => computeTotals(form.items), [form.items])
  const filtered = useMemo(() => {
    const list = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (filterStatus === 'all') return list
    return list.filter(i => i.status === filterStatus)
  }, [invoices, filterStatus])

  const stats = useMemo(() => ({
    total:   invoices.length,
    unpaid:  invoices.filter(i => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status)).length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    revenue: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
  }), [invoices])

  // ── Validation ────────────────────────────────────────────────────────────
  const validateFull = (): boolean => {
    const e: typeof errors = {}
    if (!form.businessName.trim()) e.businessName = 'Required'
    if (!form.customerName.trim()) e.customerName = 'Required'
    if (!form.dueDate)             e.dueDate       = 'Required'
    const hasItems = form.items.some(i => i.name.trim() && i.unitPrice > 0)
    if (!hasItems) e.items = 'Add at least one item with a name and price'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateQuick = (): boolean => {
    const e: typeof errors = {}
    if (!form.quickRecipient.trim()) e.quickRecipient = 'Required'
    const n = parseFloat(form.quickAmount)
    if (!form.quickAmount || isNaN(n) || n <= 0) e.quickAmount = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Create quick request ──────────────────────────────────────────────────
  const handleCreateQuick = () => {
    if (!validateQuick()) return
    const amount = parseFloat(form.quickAmount)
    const inv = addInvoice({
      businessName: profile?.displayName?.trim() || auth?.email || form.quickRecipient.trim(),
      businessEmail: auth?.email ?? '',
      customerName: form.quickRecipient.trim(),
      issueDate: today(), dueDate: inDays(30),
      currency: form.currency,
      notes: form.quickNote.trim() || undefined,
      payToAddress: walletAddress || undefined,
      payToNanHandle: form.payToNanHandle.trim().replace(/^@/, '') || undefined,
      items: [{ id: uid(), name: form.quickNote.trim() || 'Payment', quantity: 1, unitPrice: amount }],
      subtotal: amount, discountTotal: 0, taxTotal: 0, total: amount,
      payments: [], amountPaid: 0, amountDue: amount,
      status: 'sent',
      mode: 'quick' as const,
    })
    // Auto-save recipient as a contact (use name-derived id as pseudo-address for dedup)
    if (form.quickRecipient.trim()) {
      const seed = form.quickRecipient.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      const pseudoAddr = `0x${seed.padEnd(40, '0').slice(0, 40)}`
      addContact({ address: pseudoAddr, name: form.quickRecipient.trim(), note: form.quickNote.trim() || undefined })
    }
    toast.success('Payment request created')
    setSelectedId(inv.id)
    setView('detail')
  }

  // ── Create full invoice ───────────────────────────────────────────────────
  const handleCreate = (status: InvoiceStatus = 'draft') => {
    if (!validateFull()) return
    const t = computeTotals(form.items)
    const inv = addInvoice({
      businessName: form.businessName.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessAddress: form.businessAddress.trim() || undefined,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      issueDate: form.issueDate, dueDate: form.dueDate,
      currency: form.currency,
      notes: form.notes.trim() || undefined,
      paymentInstructions: form.paymentInstructions.trim() || undefined,
      payToAddress: form.payToAddress.trim() || undefined,
      payToNanHandle: form.payToNanHandle.trim().replace(/^@/, '') || undefined,
      items: form.items.filter(i => i.name.trim()),
      ...t, payments: [], amountPaid: 0, amountDue: t.total,
      status, mode: 'full' as const,
    })
    // Auto-add customer as a contact when they have a wallet address
    const custAddr = form.customerAddress.trim()
    if (custAddr && /^0x[0-9a-fA-F]{40}$/.test(custAddr) && form.customerName.trim()) {
      addContact({ address: custAddr, name: form.customerName.trim(), note: form.customerEmail.trim() || undefined })
    }
    toast.success(status === 'draft' ? 'Invoice saved as draft' : 'Invoice created')
    setSelectedId(inv.id)
    setView('detail')
  }

  // ── Update invoice ────────────────────────────────────────────────────────
  const handleUpdate = () => {
    if (!selectedId || !validateFull()) return
    const t = computeTotals(form.items)
    updateInvoice(selectedId, {
      businessName: form.businessName.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessAddress: form.businessAddress.trim() || undefined,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      issueDate: form.issueDate, dueDate: form.dueDate,
      currency: form.currency,
      notes: form.notes.trim() || undefined,
      paymentInstructions: form.paymentInstructions.trim() || undefined,
      payToAddress: form.payToAddress.trim() || undefined,
      payToNanHandle: form.payToNanHandle.trim().replace(/^@/, '') || undefined,
      items: form.items.filter(i => i.name.trim()),
      ...t, amountDue: Math.max(0, t.total - (selected?.amountPaid ?? 0)),
      updatedAt: new Date().toISOString(),
    })
    toast.success('Invoice updated')
    setView('detail')
  }

  const openEdit = (inv: Invoice) => {
    setForm({
      businessName: inv.businessName, businessEmail: inv.businessEmail ?? '',
      businessAddress: inv.businessAddress ?? '',
      customerName: inv.customerName, customerEmail: inv.customerEmail ?? '',
      customerAddress: inv.customerAddress ?? '',
      issueDate: inv.issueDate, dueDate: inv.dueDate, currency: inv.currency,
      notes: inv.notes ?? '', paymentInstructions: inv.paymentInstructions ?? '',
      payToAddress: inv.payToAddress ?? '',
      payToNanHandle: (inv as Invoice & { payToNanHandle?: string }).payToNanHandle ?? '',
      items: inv.items.length > 0 ? inv.items : [emptyItem()],
      quickAmount: '', quickNote: '', quickRecipient: '',
    })
    setErrors({})
    setSelectedId(inv.id)
    setView('edit')
  }

  const copyLink = (inv: Invoice) => {
    const link = invoicePaymentLink(inv)
    navigator.clipboard.writeText(link).then(() => toast.success('Pay link copied')).catch(() => toast.error('Copy failed'))
  }

  const updateItem = (id: string, patch: Partial<InvoiceLineItem>) =>
    setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, ...patch } : it) }))
  const addItem    = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (id: string) => setForm(f => ({ ...f, items: f.items.filter(it => it.id !== id) }))

  const openNew = () => {
    setForm(emptyForm(walletAddress))
    setErrors({})
    setNewMode('choose')
    setView('new')
  }

  const renderHeader = (title: string, onBack?: () => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 18px', borderBottom: `1px solid ${BDR}`, marginBottom: 18 }}>
      {onBack ? (
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 9, background: SURF2, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowRight size={14} color={T2} style={{ transform: 'rotate(180deg)' }} />
        </button>
      ) : (
        <div style={{ width: 38, height: 38, borderRadius: 11, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="#fff" />
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>{title}</div>
        {view === 'list' && <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Invoices and payment requests in one place</div>}
      </div>
      {view === 'list' && (
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', height: 36, background: BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, flexShrink: 0 }}>
          <Plus size={15} /> New
        </button>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: LIST
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'list') return (
    <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
      {renderHeader('Invoices & Requests')}

      {invoices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          {[
            { label: 'Total',   value: stats.total },
            { label: 'Unpaid',  value: stats.unpaid,  highlight: stats.unpaid > 0 ? AMBER : undefined },
            { label: 'Overdue', value: stats.overdue, highlight: stats.overdue > 0 ? RED : undefined },
            { label: 'Earned',  value: `$${stats.revenue.toFixed(0)}` },
          ].map(s => (
            <div key={s.label} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '10px 10px 8px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.highlight ?? TEXT, letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T3, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {invoices.length > 0 && (
        <button onClick={() => setShowFilters(f => !f)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, marginBottom: 10, padding: 0 }}>
          Filter by status <ChevronDown size={13} style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['all', 'draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${filterStatus === s ? BLUE : BDR}`, background: filterStatus === s ? 'rgba(8,102,245,0.10)' : SURF2, color: filterStatus === s ? BLUE : T2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              {s === 'all' ? 'All' : STATUS_META[s]?.label ?? s}
            </button>
          ))}
        </div>
      )}

      {invoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: SURF, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} color={T3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>No invoices or requests yet</div>
          <div style={{ fontSize: 13, color: T2, maxWidth: 260, lineHeight: 1.5 }}>Create a quick payment request or a full invoice. Share a pay link — anyone can pay by card or crypto.</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={openNew} style={{ ...btnPrimary, flex: 'none', padding: '0 20px', width: 'auto' }}>
              <Zap size={14} /> Quick request
            </button>
            <button onClick={openNew} style={{ ...btnGhost, flex: 'none', padding: '0 20px', width: 'auto' }}>
              <FileText size={14} /> Full invoice
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(inv => {
          const isQuick = (inv as Invoice & { mode?: string }).mode === 'quick'
          return (
            <div key={inv.id} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden' }}>
              <button onClick={() => { setSelectedId(inv.id); setView('detail') }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 14px 12px', textAlign: 'left', fontFamily: F }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{inv.number}</span>
                      <StatusBadge status={inv.status} isQuick={isQuick} />
                      {isQuick && <span style={{ fontSize: 10, fontWeight: 600, color: T3 }}>Request</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{inv.customerName}</div>
                    <div style={{ fontSize: 11, color: T3 }}>Due {fmtDate(inv.dueDate)}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: inv.status === 'paid' ? GREEN : TEXT, letterSpacing: '-0.02em' }}>{fmtAmt(inv.total, inv.currency)}</div>
                    {inv.amountDue > 0 && inv.amountDue < inv.total && (
                      <div style={{ fontSize: 11, color: AMBER, marginTop: 2 }}>{fmtAmt(inv.amountDue, inv.currency)} due</div>
                    )}
                    <ChevronRight size={14} color={T3} style={{ marginTop: 4 }} />
                  </div>
                </div>
              </button>
              <div style={{ display: 'flex', borderTop: `1px solid ${BDR}` }}>
                {[
                  { icon: <Copy size={13} />, label: 'Copy link', action: () => copyLink(inv) },
                  { icon: <Download size={13} />, label: 'Download', action: () => downloadInvoicePdf(inv) },
                  { icon: <Share2 size={13} />, label: 'Share', action: () => shareInvoice(inv) },
                ].map((btn, i) => (
                  <button key={btn.label} onClick={btn.action} style={{ flex: 1, height: 36, background: 'none', border: 'none', borderLeft: i > 0 ? `1px solid ${BDR}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F }}>
                    {btn.icon} {btn.label}
                  </button>
                ))}
                {delConfirm === inv.id ? (
                  <div style={{ display: 'flex', borderLeft: `1px solid ${BDR}` }}>
                    <button onClick={() => setDelConfirm(null)} style={{ flex: 1, height: 36, background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F, padding: '0 10px' }}>Cancel</button>
                    <button onClick={() => { removeInvoice(inv.id); setDelConfirm(null); toast.success('Deleted') }} style={{ height: 36, background: RED, border: 'none', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: F, padding: '0 10px' }}>Delete</button>
                  </div>
                ) : (
                  <button onClick={() => setDelConfirm(inv.id)} style={{ width: 36, height: 36, background: 'none', border: 'none', borderLeft: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T3 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && invoices.length > 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: T3, fontSize: 13 }}>No items match this filter.</div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'detail' && selected) {
    const payLink = invoicePaymentLink(selected)
    const isQuick = (selected as Invoice & { mode?: string }).mode === 'quick'
    return (
      <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
        {renderHeader(isQuick ? `Request ${selected.number}` : selected.number, () => setView('list'))}

        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '20px 20px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: T3, marginBottom: 4 }}>{isQuick ? 'Requesting from' : 'Bill to'}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{selected.customerName}</div>
              {selected.customerEmail && <div style={{ fontSize: 12, color: T2 }}>{selected.customerEmail}</div>}
            </div>
            <StatusBadge status={selected.status} isQuick={isQuick} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: TEXT, letterSpacing: '-0.04em', lineHeight: 1 }}>{fmtAmt(selected.total, selected.currency)}</div>
          {selected.amountDue > 0 && selected.amountDue < selected.total && (
            <div style={{ fontSize: 13, color: AMBER, marginTop: 4 }}>{fmtAmt(selected.amountDue, selected.currency)} remaining</div>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <div><div style={{ fontSize: 10, color: T3 }}>Issued</div><div style={{ fontSize: 12, fontWeight: 600, color: T2, marginTop: 2 }}>{fmtDate(selected.issueDate)}</div></div>
            <div><div style={{ fontSize: 10, color: T3 }}>Due</div><div style={{ fontSize: 12, fontWeight: 600, color: selected.status === 'overdue' ? RED : T2, marginTop: 2 }}>{fmtDate(selected.dueDate)}</div></div>
          </div>
        </div>

        <div style={{ background: 'rgba(8,102,245,0.06)', border: `1px solid rgba(8,102,245,0.15)`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: BLUE, marginBottom: 6 }}>PAYMENT LINK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: T2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payLink}</div>
            <button onClick={() => copyLink(selected)} style={{ flexShrink: 0, height: 30, padding: '0 12px', background: BLUE, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Copy size={11} /> Copy
            </button>
          </div>
          {((selected as Invoice & { payToNanHandle?: string }).payToNanHandle || selected.payToAddress) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(selected as Invoice & { payToNanHandle?: string }).payToNanHandle && (
                <span style={{ fontSize: 11, color: BLUE, fontWeight: 700 }}>
                  @{(selected as Invoice & { payToNanHandle?: string }).payToNanHandle}
                </span>
              )}
              {selected.payToAddress && (
                <span style={{ fontSize: 11, color: T3, fontFamily: 'monospace' }}>
                  {selected.payToAddress.slice(0, 10)}…{selected.payToAddress.slice(-6)}
                </span>
              )}
            </div>
          )}
        </div>

        {selected.notes && (
          <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note</div>
            <div style={{ fontSize: 13, color: T2, lineHeight: 1.5 }}>{selected.notes}</div>
          </div>
        )}

        {!isQuick && selected.items.length > 0 && (
          <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BDR}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Line Items</div>
            </div>
            {selected.items.map((item, i) => (
              <div key={item.id} style={{ padding: '12px 14px', borderBottom: i < selected.items.length - 1 ? `1px solid ${BDR}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{item.quantity} × {fmtAmt(item.unitPrice, selected.currency)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{fmtAmt(lineTotal(item), selected.currency)}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '12px 14px', background: SURF2 }}>
              {(selected.discountTotal > 0 || selected.taxTotal > 0) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 12, color: T2 }}>Subtotal</span><span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{fmtAmt(selected.subtotal, selected.currency)}</span></div>
                  {selected.discountTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 12, color: AMBER }}>Discount</span><span style={{ fontSize: 12, fontWeight: 600, color: AMBER }}>−{fmtAmt(selected.discountTotal, selected.currency)}</span></div>}
                  {selected.taxTotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ fontSize: 12, color: T2 }}>Tax</span><span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{fmtAmt(selected.taxTotal, selected.currency)}</span></div>}
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${BDR}` }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{fmtAmt(selected.total, selected.currency)}</span>
              </div>
            </div>
          </div>
        )}

        {selected.payments.length > 0 && (
          <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BDR}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Payments Received</div>
            </div>
            {selected.payments.map(p => (
              <div key={p.id} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BDR}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>{fmtAmt(p.amount, selected.currency)}</div>
                  <div style={{ fontSize: 11, color: T3 }}>{fmtDate(p.date)}{p.note ? ` · ${p.note}` : ''}</div>
                </div>
                {p.txHash && <a href={`https://explorer.arc.io/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Tx <ExternalLink size={10} /></a>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {selected.status === 'draft' && (
            <button onClick={() => updateInvoice(selected.id, { status: 'sent', updatedAt: new Date().toISOString() })} style={{ ...btnPrimary, gridColumn: '1 / -1' }}>
              <Eye size={15} /> Mark as Sent
            </button>
          )}
          {['sent', 'viewed', 'overdue'].includes(selected.status) && (
            <button onClick={() => updateInvoice(selected.id, { status: 'paid', amountPaid: selected.total, amountDue: 0, updatedAt: new Date().toISOString() })} style={btnPrimary}>
              <CheckCircle2 size={15} /> Mark Paid
            </button>
          )}
          {selected.status !== 'cancelled' && selected.status !== 'paid' && (
            <button onClick={() => updateInvoice(selected.id, { status: 'cancelled', updatedAt: new Date().toISOString() })} style={btnGhost}>
              <X size={15} /> Cancel
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {[
            { icon: <Download size={14} />, label: 'Download', action: () => downloadInvoicePdf(selected) },
            { icon: <Share2 size={14} />, label: 'Share', action: () => shareInvoice(selected) },
            { icon: <Printer size={14} />, label: 'Print', action: () => printInvoice(selected) },
            { icon: <FileText size={14} />, label: 'Edit', action: () => openEdit(selected) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} style={{ height: 44, background: SURF, border: `1px solid ${BDR}`, borderRadius: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F }}>
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: NEW — mode chooser + quick form + full form
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'new') {

    // ── Mode chooser ──────────────────────────────────────────────────────────
    if (newMode === 'choose') return (
      <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
        {renderHeader('New', () => setView('list'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: T2, marginBottom: 4 }}>What do you want to create?</div>

          {/* Quick request card */}
          <button onClick={() => setNewMode('quick')} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: F, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(8,102,245,0.12)', border: '1px solid rgba(8,102,245,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap size={22} color={BLUE} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 3 }}>Quick Request</div>
                <div style={{ fontSize: 12, color: T2, lineHeight: 1.5 }}>Just an amount and a note. Ready in 10 seconds. Perfect for splitting bills, freelance work, or a quick ask.</div>
              </div>
              <ChevronRight size={16} color={T3} />
            </div>
          </button>

          {/* Full invoice card */}
          <button onClick={() => setNewMode('full')} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: 18, textAlign: 'left', cursor: 'pointer', fontFamily: F, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(8,102,245,0.10)', border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={22} color={T2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 3 }}>Full Invoice</div>
                <div style={{ fontSize: 12, color: T2, lineHeight: 1.5 }}>Business name, line items, tax, Net terms, PDF download. For formal billing to clients and companies.</div>
              </div>
              <ChevronRight size={16} color={T3} />
            </div>
          </button>
        </div>
      </div>
    )

    // ── Quick form ────────────────────────────────────────────────────────────
    if (newMode === 'quick') return (
      <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
        {renderHeader('Quick Request', () => setNewMode('choose'))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Who should pay? *" error={errors.quickRecipient}>
              <input value={form.quickRecipient} onChange={e => setForm(f => ({ ...f, quickRecipient: e.target.value }))}
                placeholder="Name or email" style={{ ...inputBase, borderColor: errors.quickRecipient ? 'rgba(239,68,68,0.5)' : BDR }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Amount *" error={errors.quickAmount}>
                <input type="number" min="0" step="0.01" value={form.quickAmount}
                  onChange={e => setForm(f => ({ ...f, quickAmount: e.target.value }))}
                  placeholder="0.00" style={{ ...inputBase, borderColor: errors.quickAmount ? 'rgba(239,68,68,0.5)' : BDR }} />
              </Field>
              <Field label="Currency">
                <CurrencyPicker value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
              </Field>
            </div>
            <Field label="Note (optional)">
              <input value={form.quickNote} onChange={e => setForm(f => ({ ...f, quickNote: e.target.value }))}
                placeholder="What's this for?" style={inputBase} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Your NAN handle (optional)">
                <input value={form.payToNanHandle} onChange={e => setForm(f => ({ ...f, payToNanHandle: e.target.value }))}
                  placeholder="@yourname" style={inputBase} />
              </Field>
              <Field label="Your wallet address (optional)">
                <input value={form.payToAddress} onChange={e => setForm(f => ({ ...f, payToAddress: e.target.value }))}
                  placeholder="0x…" style={{ ...inputBase, fontFamily: 'monospace', fontSize: 12 }} />
              </Field>
            </div>
            <div style={{ fontSize: 11, color: T3, lineHeight: 1.5 }}>
              Payers can pay via your NAN handle OR wallet address. At least one is recommended so crypto payments work.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setNewMode('choose')} style={btnGhost}>Cancel</button>
            <button onClick={handleCreateQuick} style={btnPrimary}>
              <Zap size={15} /> Create & share
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: NEW (full) / EDIT — shared full invoice form
  // ═══════════════════════════════════════════════════════════════════════════
  const isEdit = view === 'edit'
  return (
    <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
      {renderHeader(isEdit ? 'Edit Invoice' : 'New Invoice', () => isEdit ? setView('detail') : setNewMode('choose'))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Business</div>
          <Field label="Business name *" error={errors.businessName}>
            <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Your name or company" style={{ ...inputBase, borderColor: errors.businessName ? 'rgba(239,68,68,0.5)' : BDR }} />
          </Field>
          <Field label="Email">
            <input value={form.businessEmail} onChange={e => setForm(f => ({ ...f, businessEmail: e.target.value }))} placeholder="you@email.com" style={inputBase} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="NAN handle (optional)">
              <input value={form.payToNanHandle} onChange={e => setForm(f => ({ ...f, payToNanHandle: e.target.value }))} placeholder="@yourname" style={inputBase} />
            </Field>
            <Field label="Wallet address (optional)">
              <input value={form.payToAddress} onChange={e => setForm(f => ({ ...f, payToAddress: e.target.value }))} placeholder="0x…" style={{ ...inputBase, fontFamily: 'monospace', fontSize: 12 }} />
            </Field>
          </div>
          <div style={{ fontSize: 11, color: T3 }}>Payers can use either your NAN handle or wallet address.</div>
        </div>

        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bill To</div>
          <Field label="Client name *" error={errors.customerName}>
            <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Client name or company" style={{ ...inputBase, borderColor: errors.customerName ? 'rgba(239,68,68,0.5)' : BDR }} />
          </Field>
          <Field label="Client email">
            <input value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} placeholder="client@email.com" style={inputBase} />
          </Field>
        </div>

        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Issue date">
              <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} style={inputBase} />
            </Field>
            <Field label="Due date *" error={errors.dueDate}>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={{ ...inputBase, borderColor: errors.dueDate ? 'rgba(239,68,68,0.5)' : BDR }} />
            </Field>
          </div>
          <Field label="Currency">
            <CurrencyPicker value={form.currency} onChange={v => setForm(f => ({ ...f, currency: v }))} />
          </Field>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => setForm(f => ({ ...f, dueDate: inDays(d) }))} style={{ height: 26, padding: '0 10px', background: SURF2, border: `1px solid ${BDR}`, borderRadius: 7, fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F, whiteSpace: 'nowrap' }}>
                Net {d}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Line Items</div>
            <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>
              <Plus size={13} /> Add item
            </button>
          </div>
          {errors.items && <div style={{ padding: '8px 16px', fontSize: 12, color: RED, display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={12} />{errors.items}</div>}
          {form.items.map((item, idx) => (
            <div key={item.id} style={{ padding: 14, borderBottom: idx < form.items.length - 1 ? `1px solid ${BDR}` : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <input value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} placeholder="Item name" style={{ ...inputBase, flex: 2 }} />
                {form.items.length > 1 && (
                  <button onClick={() => removeItem(item.id)} style={{ width: 34, height: 38, flexShrink: 0, background: SURF2, border: `1px solid ${BDR}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={13} color={T2} />
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                <Field label="Qty"><input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, { quantity: Math.max(1, parseFloat(e.target.value) || 1) })} style={inputBase} /></Field>
                <Field label={`Unit price (${form.currency})`}><input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} placeholder="0.00" style={inputBase} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Discount %"><input type="number" min="0" max="100" value={item.discount ?? ''} onChange={e => updateItem(item.id, { discount: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputBase} /></Field>
                <Field label="Tax %"><input type="number" min="0" max="100" value={item.tax ?? ''} onChange={e => updateItem(item.id, { tax: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputBase} /></Field>
              </div>
              {item.name && item.unitPrice > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: T2, textAlign: 'right' }}>
                  Line total: <strong style={{ color: TEXT }}>{fmtAmt(lineTotal(item), form.currency)}</strong>
                </div>
              )}
            </div>
          ))}
          <div style={{ padding: '12px 16px', background: SURF2, borderTop: `1px solid ${BDR}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: BLUE }}>{fmtAmt(totals.total, form.currency)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes & Instructions</div>
          <Field label="Notes (optional)">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Thank you for your business!" rows={3} style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          <Field label="Payment instructions">
            <textarea value={form.paymentInstructions} onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))} placeholder="Pay via the link below, or send USDC directly to the address above." rows={2} style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => isEdit ? setView('detail') : setNewMode('choose')} style={btnGhost}>Cancel</button>
          {!isEdit && (
            <button onClick={() => handleCreate('draft')} style={{ ...btnGhost, flex: 1 }}>
              <Clock size={15} /> Save draft
            </button>
          )}
          <button onClick={() => isEdit ? handleUpdate() : handleCreate('sent')} style={btnPrimary}>
            <Check size={15} /> {isEdit ? 'Save changes' : 'Create & send'}
          </button>
        </div>
      </div>
    </div>
  )
}
