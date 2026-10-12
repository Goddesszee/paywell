/**
 * InvoicePage — create, manage, view, share, and track USDC invoices.
 * Uses the Invoice type and store actions already in appStore.ts.
 * All PDF/HTML generation is handled by src/lib/invoice-pdf.ts.
 */
import { useState, useMemo } from 'react'
import {
  FileText, Plus, Download, Share2, Printer, Copy,
  Trash2, ChevronRight, X, Check, AlertCircle,
  ArrowRight, CheckCircle2, Clock, ExternalLink,
  ChevronDown, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type Invoice, type InvoiceLineItem, type InvoiceStatus } from '../../store/appStore'
import { downloadInvoicePdf, shareInvoice, printInvoice, invoicePaymentLink } from '../../lib/invoice-pdf'
import { useAccount } from 'wagmi'

// ── Design tokens ────────────────────────────────────────────────────────────
const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface)'
const SURF2 = 'var(--nan-surface2)'
const BDR   = 'var(--nan-bdr)'
const BLUE  = '#0866F5'
const TEXT  = 'var(--nan-text)'
const T2    = 'var(--nan-text2)'
const T3    = 'var(--nan-text3)'
const GREEN = '#22C55E'
const RED   = '#EF4444'
const AMBER = '#F59E0B'

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

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
  const total = taxBase + taxTotal
  return { subtotal, discountTotal, taxTotal, total }
}

const STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Draft',          color: T3,    bg: SURF2 },
  sent:           { label: 'Sent',           color: BLUE,  bg: 'rgba(8,102,245,0.10)' },
  viewed:         { label: 'Viewed',         color: BLUE,  bg: 'rgba(8,102,245,0.10)' },
  partially_paid: { label: 'Partial',        color: AMBER, bg: 'rgba(245,158,11,0.10)' },
  paid:           { label: 'Paid',           color: GREEN, bg: 'rgba(34,197,94,0.10)' },
  overdue:        { label: 'Overdue',        color: RED,   bg: 'rgba(239,68,68,0.10)' },
  cancelled:      { label: 'Cancelled',      color: T3,    bg: SURF2 },
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

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: m.color, background: m.bg, border: `1px solid ${m.color}22`, whiteSpace: 'nowrap' }}>
      {m.label}
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

// ── Empty line item factory ───────────────────────────────────────────────────
function emptyItem(): InvoiceLineItem {
  return { id: uid(), name: '', quantity: 1, unitPrice: 0 }
}

// ── Form state type ───────────────────────────────────────────────────────────
interface DraftForm {
  businessName: string
  businessEmail: string
  businessAddress: string
  customerName: string
  customerEmail: string
  customerAddress: string
  issueDate: string
  dueDate: string
  currency: string
  notes: string
  paymentInstructions: string
  payToAddress: string
  items: InvoiceLineItem[]
}

function today() { return new Date().toISOString().slice(0, 10) }
function inDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function emptyForm(defaultAddress = ''): DraftForm {
  return {
    businessName: '', businessEmail: '', businessAddress: '',
    customerName: '', customerEmail: '', customerAddress: '',
    issueDate: today(), dueDate: inDays(30),
    currency: 'USDC', notes: '', paymentInstructions: '',
    payToAddress: defaultAddress,
    items: [emptyItem()],
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export function InvoicePage() {
  const { address: wagmiAddress } = useAccount()
  const { auth, invoices, addInvoice, updateInvoice, removeInvoice, setActiveView } = useAppStore()
  const walletAddress = wagmiAddress ?? auth?.circleWalletAddress ?? auth?.walletAddress ?? ''

  type View = 'list' | 'new' | 'detail' | 'edit'
  const [view,        setView]        = useState<View>('list')
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [form,        setForm]        = useState<DraftForm>(() => emptyForm(walletAddress))
  const [errors,      setErrors]      = useState<Partial<Record<keyof DraftForm | 'items', string>>>({})
  const [delConfirm,  setDelConfirm]  = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const selected = useMemo(() => invoices.find(i => i.id === selectedId) ?? null, [invoices, selectedId])

  // ── Derived totals from form items ────────────────────────────────────────
  const totals = useMemo(() => computeTotals(form.items), [form.items])

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const list = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (filterStatus === 'all') return list
    return list.filter(i => i.status === filterStatus)
  }, [invoices, filterStatus])

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: typeof errors = {}
    if (!form.businessName.trim()) e.businessName = 'Required'
    if (!form.customerName.trim()) e.customerName = 'Required'
    if (!form.dueDate)             e.dueDate       = 'Required'
    const hasItems = form.items.some(i => i.name.trim() && i.unitPrice > 0)
    if (!hasItems) e.items = 'Add at least one item with a name and price'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Create invoice ────────────────────────────────────────────────────────
  const handleCreate = (status: InvoiceStatus = 'draft') => {
    if (!validate()) return
    const t = computeTotals(form.items)
    const inv = addInvoice({
      businessName: form.businessName.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessAddress: form.businessAddress.trim() || undefined,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      currency: form.currency,
      notes: form.notes.trim() || undefined,
      paymentInstructions: form.paymentInstructions.trim() || undefined,
      payToAddress: form.payToAddress.trim() || undefined,
      items: form.items.filter(i => i.name.trim()),
      ...t,
      payments: [],
      amountPaid: 0,
      amountDue: t.total,
      status,
    })
    toast.success(status === 'draft' ? 'Invoice saved as draft' : 'Invoice created')
    setSelectedId(inv.id)
    setView('detail')
  }

  // ── Update invoice ────────────────────────────────────────────────────────
  const handleUpdate = () => {
    if (!selectedId || !validate()) return
    const t = computeTotals(form.items)
    updateInvoice(selectedId, {
      businessName: form.businessName.trim(),
      businessEmail: form.businessEmail.trim() || undefined,
      businessAddress: form.businessAddress.trim() || undefined,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      currency: form.currency,
      notes: form.notes.trim() || undefined,
      paymentInstructions: form.paymentInstructions.trim() || undefined,
      payToAddress: form.payToAddress.trim() || undefined,
      items: form.items.filter(i => i.name.trim()),
      ...t,
      amountDue: Math.max(0, t.total - (selected?.amountPaid ?? 0)),
      updatedAt: new Date().toISOString(),
    })
    toast.success('Invoice updated')
    setView('detail')
  }

  // ── Open form for editing ─────────────────────────────────────────────────
  const openEdit = (inv: Invoice) => {
    setForm({
      businessName: inv.businessName,
      businessEmail: inv.businessEmail ?? '',
      businessAddress: inv.businessAddress ?? '',
      customerName: inv.customerName,
      customerEmail: inv.customerEmail ?? '',
      customerAddress: inv.customerAddress ?? '',
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: inv.currency,
      notes: inv.notes ?? '',
      paymentInstructions: inv.paymentInstructions ?? '',
      payToAddress: inv.payToAddress ?? '',
      items: inv.items.length > 0 ? inv.items : [emptyItem()],
    })
    setErrors({})
    setSelectedId(inv.id)
    setView('edit')
  }

  // ── Copy pay link ─────────────────────────────────────────────────────────
  const copyLink = (inv: Invoice) => {
    const link = invoicePaymentLink(inv)
    navigator.clipboard.writeText(link).then(() => toast.success('Pay link copied')).catch(() => toast.error('Copy failed'))
  }

  // ── Item helpers ──────────────────────────────────────────────────────────
  const updateItem = (id: string, patch: Partial<InvoiceLineItem>) => {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, ...patch } : it) }))
  }
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (id: string) => setForm(f => ({ ...f, items: f.items.filter(it => it.id !== id) }))

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    invoices.length,
    unpaid:   invoices.filter(i => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status)).length,
    overdue:  invoices.filter(i => i.status === 'overdue').length,
    revenue:  invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
  }), [invoices])

  // ── renderHeader helper (returns JSX, not a component) ────────────────────
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
        {view === 'list' && <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Create, send, and track USDC invoices</div>}
      </div>
      {view === 'list' && (
        <button onClick={() => { setForm(emptyForm(walletAddress)); setErrors({}); setView('new') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', height: 36, background: BLUE, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, flexShrink: 0 }}>
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
      {renderHeader('Invoices')}

      {/* Stats */}
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

      {/* Filter toggle */}
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

      {/* Empty state */}
      {invoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: SURF, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} color={T3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: T2, maxWidth: 240, lineHeight: 1.5 }}>Create your first USDC invoice. Share a pay link — anyone can pay by card or crypto.</div>
          <button onClick={() => { setForm(emptyForm(walletAddress)); setErrors({}); setView('new') }} style={{ ...btnPrimary, flex: 'none', padding: '0 24px', width: 'auto', marginTop: 4 }}>
            <Plus size={15} /> Create invoice
          </button>
        </div>
      )}

      {/* Invoice list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(inv => (
          <div key={inv.id} style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden' }}>
            <button onClick={() => { setSelectedId(inv.id); setView('detail') }} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 14px 12px', textAlign: 'left', fontFamily: F }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{inv.number}</span>
                    <StatusBadge status={inv.status} />
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

            {/* Quick actions */}
            <div style={{ display: 'flex', borderTop: `1px solid ${BDR}` }}>
              {[
                { icon: <Copy size={13} />, label: 'Copy link', action: () => copyLink(inv) },
                { icon: <Download size={13} />, label: 'Download', action: () => downloadInvoicePdf(inv) },
                { icon: <Share2 size={13} />, label: 'Share', action: () => shareInvoice(inv) },
              ].map((btn, i) => (
                <button key={btn.label} onClick={btn.action} style={{
                  flex: 1, height: 36, background: 'none', border: 'none', borderLeft: i > 0 ? `1px solid ${BDR}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F,
                }}>
                  {btn.icon} {btn.label}
                </button>
              ))}
              {delConfirm === inv.id ? (
                <div style={{ display: 'flex', borderLeft: `1px solid ${BDR}` }}>
                  <button onClick={() => setDelConfirm(null)} style={{ flex: 1, height: 36, background: 'none', border: 'none', fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F, padding: '0 10px' }}>Cancel</button>
                  <button onClick={() => { removeInvoice(inv.id); setDelConfirm(null); toast.success('Invoice deleted') }} style={{ height: 36, background: RED, border: 'none', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: F, padding: '0 10px', borderRadius: '0 0 0 0' }}>Delete</button>
                </div>
              ) : (
                <button onClick={() => setDelConfirm(inv.id)} style={{ width: 36, height: 36, background: 'none', border: 'none', borderLeft: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T3 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && invoices.length > 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: T3, fontSize: 13 }}>No invoices match this filter.</div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW: DETAIL
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === 'detail' && selected) {
    const payLink = invoicePaymentLink(selected)
    return (
      <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
        {renderHeader(selected.number, () => setView('list'))}

        {/* Status + amount hero */}
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 16, padding: '20px 20px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: T3, marginBottom: 4 }}>Bill to</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{selected.customerName}</div>
              {selected.customerEmail && <div style={{ fontSize: 12, color: T2 }}>{selected.customerEmail}</div>}
            </div>
            <StatusBadge status={selected.status} />
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

        {/* Pay link */}
        <div style={{ background: 'rgba(8,102,245,0.06)', border: `1px solid rgba(8,102,245,0.15)`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: BLUE, marginBottom: 6 }}>PAYMENT LINK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: T2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payLink}</div>
            <button onClick={() => copyLink(selected)} style={{ flexShrink: 0, height: 30, padding: '0 12px', background: BLUE, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Copy size={11} /> Copy
            </button>
          </div>
        </div>

        {/* Line items */}
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${BDR}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Line Items</div>
          </div>
          {selected.items.map((item, i) => (
            <div key={item.id} style={{ padding: '12px 14px', borderBottom: i < selected.items.length - 1 ? `1px solid ${BDR}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{item.name}</div>
                  {item.description && <div style={{ fontSize: 11, color: T3, marginTop: 2 }}>{item.description}</div>}
                  <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{item.quantity} × {fmtAmt(item.unitPrice, selected.currency)}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{fmtAmt(lineTotal(item), selected.currency)}</div>
              </div>
            </div>
          ))}
          {/* Totals */}
          <div style={{ padding: '12px 14px', background: SURF2 }}>
            {(selected.discountTotal > 0 || selected.taxTotal > 0) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: T2 }}>Subtotal</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{fmtAmt(selected.subtotal, selected.currency)}</span>
                </div>
                {selected.discountTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: AMBER }}>Discount</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: AMBER }}>−{fmtAmt(selected.discountTotal, selected.currency)}</span>
                  </div>
                )}
                {selected.taxTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: T2 }}>Tax</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{fmtAmt(selected.taxTotal, selected.currency)}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: `1px solid ${BDR}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{fmtAmt(selected.total, selected.currency)}</span>
            </div>
          </div>
        </div>

        {/* Payment history */}
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
                {p.txHash && (
                  <a href={`https://explorer.arc.io/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: BLUE, textDecoration: 'none', fontWeight: 600 }}>
                    Tx <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Status actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {selected.status === 'draft' && (
            <button onClick={() => updateInvoice(selected.id, { status: 'sent', updatedAt: new Date().toISOString() })} style={{ ...btnPrimary, gridColumn: '1 / -1' }}>
              <Eye size={15} /> Mark as Sent
            </button>
          )}
          {['sent', 'viewed', 'overdue'].includes(selected.status) && (
            <button onClick={() => updateInvoice(selected.id, { status: 'paid', amountPaid: selected.total, amountDue: 0, updatedAt: new Date().toISOString() })} style={{ ...btnPrimary }}>
              <CheckCircle2 size={15} /> Mark Paid
            </button>
          )}
          {selected.status !== 'cancelled' && selected.status !== 'paid' && (
            <button onClick={() => updateInvoice(selected.id, { status: 'cancelled', updatedAt: new Date().toISOString() })} style={{ ...btnGhost }}>
              <X size={15} /> Cancel
            </button>
          )}
        </div>

        {/* Action bar */}
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
  // VIEW: NEW / EDIT — shared form
  // ═══════════════════════════════════════════════════════════════════════════
  const isEdit = view === 'edit'
  return (
    <div style={{ fontFamily: F, width: '100%', paddingBottom: 96 }}>
      {renderHeader(isEdit ? 'Edit Invoice' : 'New Invoice', () => isEdit ? setView('detail') : setView('list'))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Business info */}
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Business</div>
          <Field label="Business name *" error={errors.businessName}>
            <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Your name or company" style={{ ...inputBase, borderColor: errors.businessName ? 'rgba(239,68,68,0.5)' : BDR }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Email">
              <input value={form.businessEmail} onChange={e => setForm(f => ({ ...f, businessEmail: e.target.value }))} placeholder="you@email.com" style={inputBase} />
            </Field>
            <Field label="USDC wallet address">
              <input value={form.payToAddress} onChange={e => setForm(f => ({ ...f, payToAddress: e.target.value }))} placeholder="0x…" style={{ ...inputBase, fontFamily: 'monospace', fontSize: 12 }} />
            </Field>
          </div>
        </div>

        {/* Customer info */}
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bill To</div>
          <Field label="Client name *" error={errors.customerName}>
            <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Client name or company" style={{ ...inputBase, borderColor: errors.customerName ? 'rgba(239,68,68,0.5)' : BDR }} />
          </Field>
          <Field label="Client email">
            <input value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} placeholder="client@email.com" style={inputBase} />
          </Field>
        </div>

        {/* Dates + currency */}
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
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ ...inputBase, cursor: 'pointer' }}>
              <option value="USDC">USDC</option>
              <option value="EURC">EURC</option>
            </select>
          </Field>
          {/* Quick due date shortcuts */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => setForm(f => ({ ...f, dueDate: inDays(d) }))} style={{ flex: 1, height: 30, background: SURF2, border: `1px solid ${BDR}`, borderRadius: 8, fontSize: 11, fontWeight: 600, color: T2, cursor: 'pointer', fontFamily: F }}>
                Net {d}
              </button>
            ))}
          </div>
        </div>

        {/* Line items */}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 1fr', gap: 8 }}>
                <Field label="Qty">
                  <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.id, { quantity: Math.max(1, parseFloat(e.target.value) || 1) })} style={inputBase} />
                </Field>
                <Field label={`Unit price (${form.currency})`}>
                  <input type="number" min="0" step="0.01" value={item.unitPrice || ''} onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} placeholder="0.00" style={inputBase} />
                </Field>
                <Field label="Disc %">
                  <input type="number" min="0" max="100" value={item.discount ?? ''} onChange={e => updateItem(item.id, { discount: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputBase} />
                </Field>
                <Field label="Tax %">
                  <input type="number" min="0" max="100" value={item.tax ?? ''} onChange={e => updateItem(item.id, { tax: parseFloat(e.target.value) || 0 })} placeholder="0" style={inputBase} />
                </Field>
              </div>
              {item.name && item.unitPrice > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: T2, textAlign: 'right' }}>
                  Line total: <strong style={{ color: TEXT }}>{fmtAmt(lineTotal(item), form.currency)}</strong>
                </div>
              )}
            </div>
          ))}
          {/* Totals preview */}
          <div style={{ padding: '12px 16px', background: SURF2, borderTop: `1px solid ${BDR}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: BLUE }}>{fmtAmt(totals.total, form.currency)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes & Instructions</div>
          <Field label="Notes (optional)">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Thank you for your business!" rows={3} style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
          <Field label="Payment instructions">
            <textarea value={form.paymentInstructions} onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))} placeholder="Pay via the link below, or send USDC directly to the address above." rows={2} style={{ ...inputBase, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => isEdit ? setView('detail') : setView('list')} style={btnGhost}>Cancel</button>
          {!isEdit && (
            <button onClick={() => handleCreate('draft')} style={{ ...btnGhost, flex: 1 }}>
              <Clock size={15} /> Save draft
            </button>
          )}
          <button onClick={() => isEdit ? handleUpdate() : handleCreate('sent')} style={btnPrimary}>
            <Check size={15} /> {isEdit ? 'Save changes' : 'Create & send'}
          </button>
        </div>

        {/* Navigation shortcut */}
        <button onClick={() => setActiveView('payment-requests')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: T2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, padding: '4px 0' }}>
          Also see payment requests <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
