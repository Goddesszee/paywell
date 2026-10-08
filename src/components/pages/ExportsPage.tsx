import React, { useState, useMemo } from 'react'
import {
  Download, FileText, FileJson, Calendar, Filter,
  ArrowUpRight,
  ArrowDownLeft, Bot, ArrowLeftRight, ShoppingBag,
  Share2, ChevronDown, BarChart3, Repeat, Wallet,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import type { ActivityItem, AgentSpendEntry, RecurringTask } from '../../store/appStore'

const F     = "'Inter', -apple-system, sans-serif"
const MONO  = "'JetBrains Mono', Menlo, monospace"
const BLUE  = '#0066FF'
const GREEN = '#00C853'
const RED   = '#FF3B3B'
const GOLD  = '#F0A500'

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | '3month' | '6month' | 'year' | 'all' | 'custom'
type Source = 'all' | 'main' | 'agent' | 'recurring'
type Format = 'csv' | 'json'

interface DateRange { from: Date; to: Date }

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodRange(period: Period, custom: { from: string; to: string }): DateRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case 'today':  return { from: today,                                  to: now }
    case 'week':   return { from: new Date(today.getTime() - 6*86400000), to: now }
    case 'month':  return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: now }
    case '3month': return { from: new Date(today.getFullYear(), today.getMonth() - 2, 1), to: now }
    case '6month': return { from: new Date(today.getFullYear(), today.getMonth() - 5, 1), to: now }
    case 'year':   return { from: new Date(today.getFullYear(), 0, 1), to: now }
    case 'custom': return {
      from: custom.from ? new Date(custom.from) : new Date(0),
      to:   custom.to   ? new Date(new Date(custom.to).getTime() + 86400000 - 1) : now,
    }
    default:       return { from: new Date(0), to: now }
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function escCsv(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? v.toString() : ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

// ── Unified record type for export ────────────────────────────────────────────

interface ExportRow {
  id: string
  date: string
  type: string
  source: string   // 'Main Wallet' | 'Agent Wallet' | 'Recurring'
  description: string
  amount: string
  sign: '+' | '-'
  net: string      // signed amount string e.g. "-10.00"
  status: string
  counterparty: string
  txHash: string
  chain: string
}

function activityToRow(item: ActivityItem, source = 'Main Wallet'): ExportRow {
  const ts = new Date(item.timestamp)
  const net = `${item.sign}${item.amount.toFixed(2)}`
  return {
    id:          item.id,
    date:        fmtDateTime(ts),
    type:        item.agentInitiated ? 'agent_payment' : item.type,
    source,
    description: item.description ?? item.type,
    amount:      item.amount.toFixed(2),
    sign:        item.sign,
    net,
    status:      item.status,
    counterparty: item.counterparty ?? '',
    txHash:      item.txHash ?? '',
    chain:       item.chain ?? 'Arc Testnet',
  }
}

function agentSpendToRow(e: AgentSpendEntry): ExportRow {
  const ts = new Date(e.timestamp)
  return {
    id:          e.id,
    date:        fmtDateTime(ts),
    type:        'agent_spend',
    source:      'Agent Wallet',
    description: e.service_name,
    amount:      e.amount_usdc.toFixed(2),
    sign:        '-',
    net:         `-${e.amount_usdc.toFixed(2)}`,
    status:      e.paid ? 'confirmed' : 'pending',
    counterparty: e.service_id,
    txHash:      e.txId ?? '',
    chain:       'Arc Testnet',
  }
}

function recurringToRow(t: RecurringTask): ExportRow {
  const ts = t.lastRun ? new Date(t.lastRun) : new Date(t.createdAt)
  return {
    id:          t.id,
    date:        fmtDateTime(ts),
    type:        'recurring',
    source:      'Recurring',
    description: t.name,
    amount:      t.amount,
    sign:        '-',
    net:         `-${t.amount}`,
    status:      t.active ? 'active' : 'paused',
    counterparty: t.recipient,
    txHash:      t.lastTxHash ?? '',
    chain:       'Arc Testnet',
  }
}

function rowsToCsv(rows: ExportRow[]): string {
  const COLS: (keyof ExportRow)[] = ['date','source','type','description','sign','amount','net','status','counterparty','txHash','chain','id']
  const header = COLS.join(',')
  const body = rows.map(r => COLS.map(c => escCsv(r[c])).join(',')).join('\n')
  return `${header}\n${body}`
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ── Summary stats ─────────────────────────────────────────────────────────────

function Summary({ rows, C }: { rows: ExportRow[]; C: ReturnType<typeof useNanTheme> }) {
  const totalOut  = rows.filter(r => r.sign === '-').reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalIn   = rows.filter(r => r.sign === '+').reduce((s, r) => s + parseFloat(r.amount), 0)
  const net       = totalIn - totalOut
  const bySource  = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.source] = (acc[r.source] ?? 0) + parseFloat(r.amount)
    return acc
  }, {})

  const stats = [
    { label: 'Total inflow',  value: `+${totalIn.toFixed(2)} USDC`,  color: GREEN },
    { label: 'Total outflow', value: `-${totalOut.toFixed(2)} USDC`, color: RED   },
    { label: 'Net',           value: `${net >= 0 ? '+' : ''}${net.toFixed(2)} USDC`, color: net >= 0 ? GREEN : RED },
    { label: 'Transactions',  value: String(rows.length),            color: C.text },
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: MONO, letterSpacing: '-0.03em' }}>{s.value}</div>
          </div>
        ))}
      </div>
      {Object.keys(bySource).length > 1 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>By source</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(bySource).map(([src, amt]) => (
              <div key={src} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.t2 }}>{src}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: MONO }}>{amt.toFixed(2)} USDC</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row preview ───────────────────────────────────────────────────────────────

function RowIcon({ row }: { row: ExportRow }) {
  if (row.source === 'Agent Wallet' || row.type === 'agent_payment' || row.type === 'agent_spend')
    return <Bot size={14} color={BLUE} />
  if (row.type === 'bridge')   return <ArrowLeftRight size={14} color={BLUE} />
  if (row.type === 'purchase' || row.type === 'agent_purchase') return <ShoppingBag size={14} color={GOLD} />
  if (row.type === 'recurring') return <Repeat size={14} color='#8B5CF6' />
  if (row.source === 'Recurring') return <Repeat size={14} color='#8B5CF6' />
  if (row.sign === '+') return <ArrowDownLeft size={14} color={GREEN} />
  return <ArrowUpRight size={14} color={RED} />
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExportsPage() {
  const C = useNanTheme()
  const { activity, agentSpendLog, recurringTasks, agentWallet } = useAppStore()

  const [period,    setPeriod]    = useState<Period>('month')
  const [source,    setSource]    = useState<Source>('all')
  const [format,    setFormat]    = useState<Format>('csv')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const range = periodRange(period, { from: customFrom, to: customTo })

  // Build unified row list filtered by period + source
  const allRows = useMemo<ExportRow[]>(() => {
    const rows: ExportRow[] = []

    if (source === 'all' || source === 'main') {
      activity.forEach(item => {
        const ts = new Date(item.timestamp)
        if (ts >= range.from && ts <= range.to) rows.push(activityToRow(item))
      })
    }

    if (source === 'all' || source === 'agent') {
      agentSpendLog.forEach(e => {
        const ts = new Date(e.timestamp)
        if (ts >= range.from && ts <= range.to) rows.push(agentSpendToRow(e))
      })
    }

    if (source === 'all' || source === 'recurring') {
      recurringTasks.forEach(t => {
        if (t.runCount > 0) {
          const ts = t.lastRun ? new Date(t.lastRun) : new Date(t.createdAt)
          if (ts >= range.from && ts <= range.to) rows.push(recurringToRow(t))
        }
      })
    }

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [activity, agentSpendLog, recurringTasks, range.from, range.to, source])

  const periodLabel = {
    today: 'Today', week: 'Last 7 days', month: 'This month',
    '3month': 'Last 3 months', '6month': 'Last 6 months',
    year: 'This year', all: 'All time', custom: 'Custom range',
  }[period]

  const filename = `nan-export-${period === 'custom'
    ? `${customFrom}_${customTo}`
    : period}-${source}.${format}`

  function doDownload() {
    setDownloading(true)
    setTimeout(() => {
      try {
        if (format === 'csv') {
          downloadBlob(rowsToCsv(allRows), filename, 'text/csv;charset=utf-8;')
        } else {
          downloadBlob(
            JSON.stringify({ exported: new Date().toISOString(), period: periodLabel, source, rows: allRows }, null, 2),
            filename,
            'application/json',
          )
        }
      } finally {
        setDownloading(false)
      }
    }, 50)
  }

  async function doShare() {
    const content = format === 'csv' ? rowsToCsv(allRows) : JSON.stringify({ rows: allRows }, null, 2)
    const mime    = format === 'csv' ? 'text/csv' : 'application/json'
    if (navigator.share && navigator.canShare) {
      const file = new File([content], filename, { type: mime })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'NAN Accounting Export' })
        return
      }
    }
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(content)
    alert('Copied to clipboard — paste into a spreadsheet or text file.')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'today',  label: 'Today' },
    { id: 'week',   label: '7 days' },
    { id: 'month',  label: 'This month' },
    { id: '3month', label: '3 months' },
    { id: '6month', label: '6 months' },
    { id: 'year',   label: 'This year' },
    { id: 'all',    label: 'All time' },
    { id: 'custom', label: 'Custom' },
  ]

  const SOURCES: { id: Source; label: string; Icon: React.ElementType }[] = [
    { id: 'all',       label: 'All sources',   Icon: BarChart3 },
    { id: 'main',      label: 'Main wallet',   Icon: ArrowUpRight },
    { id: 'agent',     label: 'Agent wallet',  Icon: Bot },
    { id: 'recurring', label: 'Recurring',     Icon: Repeat },
  ]

  const chipBase: React.CSSProperties = {
    padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'all 0.15s', border: '1px solid',
  }

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: F, paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 18px', borderBottom: `1px solid ${C.bdr}`, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileText size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Accounting Export</div>
          <div style={{ fontSize: 12, color: C.t2, marginTop: 1 }}>Download records from all areas of your NAN account</div>
        </div>
      </div>

      {/* ── Period picker ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          <Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Period
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              ...chipBase,
              background: period === p.id ? BLUE : C.surf,
              color: period === p.id ? '#fff' : C.t2,
              borderColor: period === p.id ? BLUE : C.bdr,
            }}>{p.label}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 4, fontWeight: 600 }}>FROM</div>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '8px 12px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: F, outline: 'none' }} />
            </div>
            <div style={{ color: C.t3, marginTop: 18, fontSize: 14 }}>→</div>
            <div>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 4, fontWeight: 600 }}>TO</div>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '8px 12px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: F, outline: 'none' }} />
            </div>
          </div>
        )}
        {period !== 'custom' && (
          <div style={{ fontSize: 11, color: C.t3, marginTop: 6 }}>
            {fmtDate(range.from)} — {fmtDate(range.to)}
          </div>
        )}
      </div>

      {/* ── Source picker ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          <Filter size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />Data source
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setSource(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: source === s.id ? BLUE : C.surf,
              color: source === s.id ? '#fff' : C.t2,
              border: `1px solid ${source === s.id ? BLUE : C.bdr}`,
            }}>
              <s.Icon size={12} />
              {s.label}
            </button>
          ))}
        </div>
        {/* Agent wallet balance note */}
        {(source === 'all' || source === 'agent') && agentWallet.provisioned && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 12px', background: 'rgba(0,102,255,0.06)', borderRadius: 10, border: `1px solid rgba(0,102,255,0.12)` }}>
            <Wallet size={12} color={BLUE} />
            <span style={{ fontSize: 12, color: C.t2 }}>
              Agent Wallet: <strong style={{ color: C.text }}>{agentWallet.balance_usdc} USDC</strong>
              {agentWallet.address && <span style={{ fontFamily: MONO, marginLeft: 6, color: C.t3 }}>{agentWallet.address.slice(0,8)}…{agentWallet.address.slice(-4)}</span>}
            </span>
          </div>
        )}
      </div>

      {/* ── Format picker ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Format</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['csv', 'CSV (spreadsheet)', FileText], ['json', 'JSON (data)', FileJson]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setFormat(id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: F,
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: format === id ? C.surf2 : C.surf,
              color: format === id ? C.text : C.t2,
              border: `1px solid ${format === id ? BLUE : C.bdr}`,
            }}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      {allRows.length > 0 ? (
        <Summary rows={allRows} C={C} />
      ) : (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '28px 16px', textAlign: 'center', marginBottom: 20 }}>
          <BarChart3 size={28} color={C.t3} style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No records for this period</div>
          <div style={{ fontSize: 12, color: C.t3 }}>Try a wider date range or a different source.</div>
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button
          onClick={doDownload}
          disabled={allRows.length === 0 || downloading}
          style={{
            flex: 1, height: 48, borderRadius: 13,
            background: allRows.length === 0 ? C.surf : BLUE,
            color: allRows.length === 0 ? C.t3 : '#fff',
            border: `1px solid ${allRows.length === 0 ? C.bdr : BLUE}`,
            cursor: allRows.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: F, fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
        >
          <Download size={16} />
          {downloading ? 'Preparing…' : `Download ${format.toUpperCase()}`}
          {allRows.length > 0 && <span style={{ fontSize: 11, opacity: 0.8 }}>({allRows.length} rows)</span>}
        </button>

        <button
          onClick={() => { void doShare() }}
          disabled={allRows.length === 0}
          style={{
            width: 48, height: 48, borderRadius: 13, flexShrink: 0,
            background: C.surf, border: `1px solid ${C.bdr}`,
            cursor: allRows.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.t2, transition: 'all 0.15s',
          }}
        >
          <Share2 size={16} />
        </button>
      </div>

      {/* ── Preview toggle ──────────────────────────────────────────────────── */}
      {allRows.length > 0 && (
        <>
          <button
            onClick={() => setShowPreview(v => !v)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 12,
              background: 'transparent', border: `1px solid ${C.bdr}`,
              cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: 600,
              color: C.t2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: showPreview ? 0 : 0,
            }}
          >
            <span>Preview ({allRows.length} records)</span>
            <ChevronDown size={14} style={{ transform: showPreview ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showPreview && (
            <div style={{ border: `1px solid ${C.bdr}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', marginBottom: 0 }}>
              {allRows.slice(0, 50).map((row, idx) => (
                <div key={row.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px',
                  borderBottom: idx < Math.min(allRows.length, 50) - 1 ? `1px solid ${C.bdr}` : 'none',
                  background: idx % 2 === 0 ? C.surf : 'transparent',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(0,102,255,0.08)', border: `1px solid rgba(0,102,255,0.12)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <RowIcon row={row} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description}
                    </div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>
                      {row.date} · {row.source} · <span style={{ textTransform: 'capitalize' }}>{row.status}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: row.sign === '+' ? GREEN : RED }}>
                      {row.net} USDC
                    </div>
                    {row.txHash && (
                      <div style={{ fontSize: 10, color: C.t3, fontFamily: MONO }}>
                        {row.txHash.slice(0, 8)}…
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {allRows.length > 50 && (
                <div style={{ padding: '12px 16px', fontSize: 12, color: C.t3, textAlign: 'center', borderTop: `1px solid ${C.bdr}` }}>
                  +{allRows.length - 50} more rows in the downloaded file
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Info note */}
      <div style={{ marginTop: 24, padding: '12px 14px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>What's included</div>
        <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[
            'Main wallet: all sends, receives, bridges, swaps, purchases',
            'Agent wallet: all AI-initiated spend transactions',
            'Recurring: completed scheduled USDC payments',
            'Each row includes date, amount, status, txHash, and chain',
          ].map(t => (
            <li key={t} style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
