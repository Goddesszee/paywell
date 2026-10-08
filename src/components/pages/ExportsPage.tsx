import React, { useState, useMemo } from 'react'
import {
  Download, FileText, FileJson, Calendar, ChevronDown,
  ArrowUpRight, ArrowDownLeft, Bot, ArrowLeftRight,
  ShoppingBag, Repeat, Wallet, CheckCircle2, X, LayoutTemplate,
} from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

// ── helpers ────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | '3months' | 'year' | 'all' | 'custom'
type Source = 'all' | 'wallet' | 'agent' | 'bridge' | 'swap' | 'recurring' | 'gateway'

function periodLabel(p: Period) {
  return {
    today:    'Today',
    week:     'This week',
    month:    'This month',
    '3months':'Last 3 months',
    year:     'This year',
    all:      'All time',
    custom:   'Custom range',
  }[p]
}

function startOf(p: Period, customFrom?: string): Date {
  const now = new Date()
  if (p === 'today')   { const d = new Date(now); d.setHours(0,0,0,0); return d }
  if (p === 'week')    { const d = new Date(now); d.setDate(d.getDate() - 7); return d }
  if (p === 'month')   { return new Date(now.getFullYear(), now.getMonth(), 1) }
  if (p === '3months') { return new Date(now.getFullYear(), now.getMonth() - 3, 1) }
  if (p === 'year')    { return new Date(now.getFullYear(), 0, 1) }
  if (p === 'custom' && customFrom) return new Date(customFrom)
  return new Date(0) // all
}

function endOf(p: Period, customTo?: string): Date {
  if (p === 'custom' && customTo) {
    const d = new Date(customTo); d.setHours(23,59,59,999); return d
  }
  return new Date()
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function escCsv(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? v.toString() : ''
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

// ── Unified record type for export ────────────────────────────────────────────

interface ExportRecord {
  date: string
  source: string
  type: string
  description: string
  amount: string
  sign: '+' | '-' | ''
  status: string
  counterparty: string
  txHash: string
  chain: string
  agentInitiated: string
  serviceName: string
}

const CSV_HEADERS: (keyof ExportRecord)[] = [
  'date', 'source', 'type', 'description', 'amount', 'sign',
  'status', 'counterparty', 'txHash', 'chain', 'agentInitiated', 'serviceName',
]

// ── Summary card ───────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const C = useNanTheme()
  return (
    <div style={{
      background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? C.text, fontFamily: MONO, letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────────
function RecordRow({ rec, last }: { rec: ExportRecord; last: boolean }) {
  const C = useNanTheme()
  const isIn = rec.sign === '+'
  const color = isIn ? '#00C853' : rec.sign === '-' ? '#FF3B3B' : C.t2

  let RowIcon = ArrowUpRight
  if (rec.type === 'received') RowIcon = ArrowDownLeft
  else if (rec.type === 'bridge') RowIcon = ArrowLeftRight
  else if (rec.type === 'purchase' || rec.type === 'agent_purchase') RowIcon = ShoppingBag
  else if (rec.agentInitiated === 'yes') RowIcon = Bot
  else if (rec.source === 'Agent Wallet') RowIcon = Wallet
  else if (rec.source === 'Recurring') RowIcon = Repeat

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 16px',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: isIn ? 'rgba(0,200,83,0.08)' : rec.sign === '-' ? 'rgba(255,59,59,0.08)' : 'rgba(0,102,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <RowIcon size={15} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rec.description || rec.type}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>{rec.source}</span>
          {rec.counterparty && <span>· {rec.counterparty.length > 16 && rec.counterparty.startsWith('0x') ? `${rec.counterparty.slice(0,6)}…${rec.counterparty.slice(-4)}` : rec.counterparty}</span>}
          <span>· {new Date(rec.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: MONO }}>
          {rec.sign}{rec.amount} USDC
        </div>
        <div style={{ fontSize: 10, color: rec.status === 'confirmed' || rec.status === 'complete' ? '#00C853' : C.t3, marginTop: 2 }}>
          {rec.status}
        </div>
      </div>
    </div>
  )
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
function Dropdown<T extends string>({
  value, options, onChange, label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  const C = useNanTheme()
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 10,
          background: C.surf, border: `1px solid ${C.bdr}`,
          color: C.text, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: F,
        }}
      >
        {selected?.label ?? value}
        <ChevronDown size={14} color={C.t3} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
            background: C.isDark ? '#0D1017' : '#fff',
            border: `1px solid ${C.bdr}`, borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            {options.map((o, i) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: o.value === value ? 'rgba(0,102,255,0.08)' : 'transparent',
                  border: 'none',
                  borderBottom: i < options.length - 1 ? `1px solid ${C.bdr}` : 'none',
                  color: o.value === value ? '#0066FF' : C.text,
                  fontSize: 13, fontWeight: o.value === value ? 700 : 500,
                  cursor: 'pointer', fontFamily: F,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                {o.label}
                {o.value === value && <CheckCircle2 size={13} color="#0066FF" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ExportsPage() {
  const C = useNanTheme()
  const { activity, agentSpendLog, recurringTasks, agentWallet } = useAppStore()

  const [period,    setPeriod]    = useState<Period>('month')
  const [source,    setSource]    = useState<Source>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const [downloaded, setDownloaded] = useState<'csv' | 'json' | 'statement' | null>(null)

  const from = useMemo(() => startOf(period, customFrom), [period, customFrom])
  const to   = useMemo(() => endOf(period, customTo),     [period, customTo])

  // ── Build unified records ────────────────────────────────────────────────────
  const allRecords = useMemo((): ExportRecord[] => {
    const out: ExportRecord[] = []

    // 1. Main wallet activity
    for (const a of activity) {
      out.push({
        date:           new Date(a.timestamp).toISOString(),
        source:         a.agentInitiated ? 'Agent (Main Wallet)' : 'Main Wallet',
        type:           a.type,
        description:    a.description,
        amount:         String(a.amount),
        sign:           a.sign,
        status:         a.status,
        counterparty:   a.counterparty ?? '',
        txHash:         a.txHash ?? '',
        chain:          a.chain ?? 'Arc Testnet',
        agentInitiated: a.agentInitiated ? 'yes' : 'no',
        serviceName:    '',
      })
    }

    // 2. Agent wallet spend log
    for (const e of agentSpendLog) {
      out.push({
        date:           e.timestamp,
        source:         'Agent Wallet',
        type:           'agent_purchase',
        description:    e.service_name,
        amount:         String(e.amount_usdc),
        sign:           '-',
        status:         e.paid ? 'confirmed' : 'pending',
        counterparty:   e.service_id,
        txHash:         e.txId ?? '',
        chain:          'Arc Testnet',
        agentInitiated: 'yes',
        serviceName:    e.service_name,
      })
    }

    // 3. Recurring payment runs (completed runs with tx hashes)
    for (const t of recurringTasks) {
      if (t.lastTxHash && t.lastRun) {
        out.push({
          date:           new Date(t.lastRun).toISOString(),
          source:         'Recurring',
          type:           'sent',
          description:    t.name || `Recurring to ${t.recipient}`,
          amount:         t.amount,
          sign:           '-',
          status:         'confirmed',
          counterparty:   t.recipient,
          txHash:         t.lastTxHash,
          chain:          'Arc Testnet',
          agentInitiated: 'no',
          serviceName:    '',
        })
      }
    }

    // 4. Agent wallet top-level balance record (metadata only — no movement record)
    if (agentWallet.provisioned && agentWallet.address) {
      out.push({
        date:           agentWallet.lastRefreshed ?? new Date().toISOString(),
        source:         'Agent Wallet',
        type:           'balance_snapshot',
        description:    `Agent wallet balance snapshot (${agentWallet.address.slice(0,8)}…)`,
        amount:         agentWallet.balance_usdc,
        sign:           '',
        status:         agentWallet.walletState ?? 'LIVE',
        counterparty:   agentWallet.address,
        txHash:         '',
        chain:          agentWallet.blockchain ?? 'Arc Testnet',
        agentInitiated: 'yes',
        serviceName:    '',
      })
    }

    return out
  }, [activity, agentSpendLog, recurringTasks, agentWallet])

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRecords.filter(r => {
      const d = new Date(r.date)
      if (d < from || d > to) return false
      if (source === 'all') return true
      if (source === 'wallet')    return r.source === 'Main Wallet' || r.source === 'Agent (Main Wallet)'
      if (source === 'agent')     return r.source === 'Agent Wallet'
      if (source === 'bridge')    return r.type === 'bridge'
      if (source === 'swap')      return r.type === 'swap'
      if (source === 'recurring') return r.source === 'Recurring'
      if (source === 'gateway')   return r.type === 'gateway'
      return true
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [allRecords, from, to, source])

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalIn  = filtered.filter(r => r.sign === '+').reduce((s, r) => s + parseFloat(r.amount || '0'), 0)
  const totalOut = filtered.filter(r => r.sign === '-').reduce((s, r) => s + parseFloat(r.amount || '0'), 0)
  const net = totalIn - totalOut

  // ── Export ──────────────────────────────────────────────────────────────────
  function getFilename(ext: string) {
    const label = period === 'custom'
      ? `${customFrom}_to_${customTo}`
      : period
    return `nan-export-${label}-${source}.${ext}`
  }

  function downloadCsv() {
    const header = CSV_HEADERS.join(',')
    const rows   = filtered.map(r => CSV_HEADERS.map(k => escCsv(r[k])).join(','))
    const csv    = [header, ...rows].join('\n')
    const blob   = new Blob([csv], { type: 'text/csv' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href = url; a.download = getFilename('csv'); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setDownloaded('csv')
    setTimeout(() => setDownloaded(null), 2500)
  }

  function downloadJson() {
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), period, source, from: from.toISOString(), to: to.toISOString(), count: filtered.length, records: filtered }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = getFilename('json'); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setDownloaded('json')
    setTimeout(() => setDownloaded(null), 2500)
  }

  async function shareExport() {
    // Build the branded HTML statement and open it in a new tab so the user
    // can share, print, or save it — same approach as the receipt Share button.
    const html = buildStatementHtml()
    const blob = new Blob([html], { type: 'text/html' })
    if (
      navigator.share &&
      navigator.canShare?.({ files: [new File([blob], 'statement.html', { type: 'text/html' })] })
    ) {
      try {
        const label = period === 'custom' ? `${customFrom}_to_${customTo}` : period
        await navigator.share({
          title: 'NAN Statement',
          files: [new File([blob], `nan-statement-${label}-${source}.html`, { type: 'text/html' })],
        })
        return
      } catch { /* fall through to new-tab */ }
    }
    // Fallback: open the branded statement in a new tab
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  // ── HTML Statement builder ───────────────────────────────────────────────────
  function buildStatementHtml(): string {
    const periodStr = periodLabel(period)
    const sourceStr = SOURCE_OPTIONS.find(o => o.value === source)?.label ?? source
    const generatedAt = new Date().toLocaleString('en', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

    const signColor = (sign: string) => sign === '+' ? '#00A844' : sign === '-' ? '#E53535' : '#4A5068'

    const rowsHtml = filtered.map((r, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#F8F9FC'
      const short = (v: string) => v.startsWith('0x') && v.length > 18 ? `${v.slice(0,8)}…${v.slice(-6)}` : v
      const typeLabel = r.type.replace(/_/g, ' ')
      return `<tr style="background:${bg};">
        <td style="padding:10px 14px;font-size:12px;color:#4A5068;white-space:nowrap;vertical-align:top;">${new Date(r.date).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})}</td>
        <td style="padding:10px 14px;font-size:12px;color:#0A0C14;font-weight:500;word-break:break-word;vertical-align:top;">${r.description || typeLabel}</td>
        <td style="padding:10px 14px;font-size:11px;color:#8A8FA8;white-space:nowrap;vertical-align:top;">${r.source}</td>
        <td style="padding:10px 14px;font-size:11px;color:#4A5068;word-break:break-all;vertical-align:top;">${r.counterparty ? short(r.counterparty) : '—'}</td>
        <td style="padding:10px 14px;font-size:12px;font-weight:700;color:${signColor(r.sign)};text-align:right;font-family:'JetBrains Mono',Menlo,monospace;white-space:nowrap;vertical-align:top;">${r.sign}${r.amount} USDC</td>
        <td style="padding:10px 14px;font-size:11px;color:${r.status === 'confirmed' || r.status === 'complete' ? '#00A844' : '#8A8FA8'};text-align:center;white-space:nowrap;vertical-align:top;">${r.status}</td>
      </tr>`
    }).join('')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>NAN Statement · ${periodStr}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#F4F6FA;font-family:'Inter',-apple-system,sans-serif;padding:32px 16px;color:#0A0C14}
    @media print{body{background:#fff;padding:0}@page{margin:15mm}thead{display:table-header-group}}
  </style>
</head>
<body>
  <div style="background:#fff;border-radius:20px;box-shadow:0 4px 40px rgba(0,0,0,0.08);max-width:860px;margin:0 auto;overflow:hidden;border:1px solid #E8EAF0;">

    <!-- Header -->
    <div style="background:#0066FF;padding:32px 40px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="19" height="27">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style="font-weight:800;font-size:22px;color:#fff;letter-spacing:-0.01em;">NAN</span>
        </div>
        <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.025em;">Account Statement</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">${periodStr} · ${sourceStr}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Generated</div>
        <div style="font-size:13px;color:#fff;font-weight:600;">${generatedAt}</div>
      </div>
    </div>

    <!-- Summary cards -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-bottom:1px solid #E8EAF0;">
      <div style="padding:24px 28px;border-right:1px solid #E8EAF0;">
        <div style="font-size:11px;font-weight:700;color:#8A8FA8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Total In</div>
        <div style="font-size:26px;font-weight:800;color:#00A844;font-family:'JetBrains Mono',Menlo,monospace;letter-spacing:-0.03em;">+${totalIn.toFixed(2)}</div>
        <div style="font-size:11px;color:#8A8FA8;margin-top:3px;">USDC received</div>
      </div>
      <div style="padding:24px 28px;border-right:1px solid #E8EAF0;">
        <div style="font-size:11px;font-weight:700;color:#8A8FA8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Total Out</div>
        <div style="font-size:26px;font-weight:800;color:#E53535;font-family:'JetBrains Mono',Menlo,monospace;letter-spacing:-0.03em;">-${totalOut.toFixed(2)}</div>
        <div style="font-size:11px;color:#8A8FA8;margin-top:3px;">USDC sent</div>
      </div>
      <div style="padding:24px 28px;">
        <div style="font-size:11px;font-weight:700;color:#8A8FA8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Net Flow</div>
        <div style="font-size:26px;font-weight:800;color:${net >= 0 ? '#00A844' : '#E53535'};font-family:'JetBrains Mono',Menlo,monospace;letter-spacing:-0.03em;">${net >= 0 ? '+' : ''}${net.toFixed(2)}</div>
        <div style="font-size:11px;color:#8A8FA8;margin-top:3px;">${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <!-- Transactions table -->
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;table-layout:auto;">
        <thead>
          <tr style="background:#F8F9FC;border-bottom:2px solid #E8EAF0;">
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:left;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;">Date</th>
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:left;text-transform:uppercase;letter-spacing:0.07em;width:30%;">Description</th>
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:left;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;">Source</th>
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:left;text-transform:uppercase;letter-spacing:0.07em;">Counterparty</th>
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:right;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;">Amount</th>
            <th style="padding:11px 14px;font-size:11px;font-weight:700;color:#8A8FA8;text-align:center;text-transform:uppercase;letter-spacing:0.07em;white-space:nowrap;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="6" style="padding:32px;text-align:center;color:#8A8FA8;font-size:13px;">No transactions in this period</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#F4F6FA;border-top:1px solid #E8EAF0;padding:18px 40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:24px;height:24px;border-radius:50%;background:#0066FF;display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="10" height="14">
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>
        <span style="font-size:12px;font-weight:600;color:#4A5068;">Powered by NAN · The Intelligent Payment Layer</span>
      </div>
      <span style="font-size:11px;color:#8A8FA8;">This statement is for informational purposes only.</span>
    </div>
  </div>
</body>
</html>`
  }

  function downloadStatement() {
    const html = buildStatementHtml()
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const label = period === 'custom'
      ? `${customFrom}_to_${customTo}`
      : period
    a.href = url; a.download = `nan-statement-${label}-${source}.html`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setDownloaded('statement')
    setTimeout(() => setDownloaded(null), 2500)
  }

  const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: 'today',    label: 'Today' },
    { value: 'week',     label: 'This week' },
    { value: 'month',    label: 'This month' },
    { value: '3months',  label: 'Last 3 months' },
    { value: 'year',     label: 'This year' },
    { value: 'all',      label: 'All time' },
    { value: 'custom',   label: 'Custom range…' },
  ]

  const SOURCE_OPTIONS: { value: Source; label: string }[] = [
    { value: 'all',       label: 'All sources' },
    { value: 'wallet',    label: 'Main Wallet' },
    { value: 'agent',     label: 'Agent Wallet' },
    { value: 'bridge',    label: 'Bridge' },
    { value: 'swap',      label: 'Swap' },
    { value: 'recurring', label: 'Recurring Payments' },
    { value: 'gateway',   label: 'Gateway' },
  ]

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 100px', fontFamily: F }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.025em', margin: '0 0 4px' }}>
          Accounting & Exports
        </h1>
        <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>
          Download your full transaction history across all NAN features as CSV or JSON.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '16px 16px 18px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Dropdown<Period>  label="Period" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
          <Dropdown<Source>  label="Source" value={source} options={SOURCE_OPTIONS} onChange={setSource} />
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            {(['From', 'To'] as const).map((lbl, i) => (
              <div key={lbl}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{lbl}</div>
                <input
                  type="date"
                  value={i === 0 ? customFrom : customTo}
                  onChange={e => i === 0 ? setCustomFrom(e.target.value) : setCustomTo(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    background: C.surf2, border: `1px solid ${C.bdr}`,
                    color: C.text, fontSize: 13, fontFamily: F, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Total In"  value={`+${totalIn.toFixed(2)}`}  sub="USDC received" color="#00C853" />
        <SummaryCard label="Total Out" value={`-${totalOut.toFixed(2)}`} sub="USDC sent"     color="#FF3B3B" />
        <SummaryCard label="Net"       value={`${net >= 0 ? '+' : ''}${net.toFixed(2)}`} sub="Net flow" color={net >= 0 ? '#00C853' : '#FF3B3B'} />
      </div>

      {/* Download buttons */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 16, padding: '14px 16px',
        marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
            {periodLabel(period)} · {SOURCE_OPTIONS.find(o => o.value === source)?.label}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            onClick={downloadCsv}
            disabled={filtered.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10,
              background: downloaded === 'csv' ? '#00C853' : '#0066FF',
              border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filtered.length === 0 ? 0.5 : 1,
              fontFamily: F, transition: 'background 0.2s',
            }}
          >
            {downloaded === 'csv' ? <CheckCircle2 size={14} /> : <FileText size={14} />}
            {downloaded === 'csv' ? 'Downloaded!' : 'CSV'}
          </button>
          <button
            onClick={downloadJson}
            disabled={filtered.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10,
              background: downloaded === 'json' ? '#00C853' : C.surf2,
              border: `1px solid ${downloaded === 'json' ? '#00C853' : C.bdr}`,
              color: downloaded === 'json' ? '#fff' : C.text,
              fontSize: 13, fontWeight: 700, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filtered.length === 0 ? 0.5 : 1,
              fontFamily: F, transition: 'all 0.2s',
            }}
          >
            {downloaded === 'json' ? <CheckCircle2 size={14} /> : <FileJson size={14} />}
            {downloaded === 'json' ? 'Downloaded!' : 'JSON'}
          </button>
          <button
            onClick={downloadStatement}
            disabled={filtered.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10,
              background: downloaded === 'statement' ? '#00C853' : C.surf2,
              border: `1px solid ${downloaded === 'statement' ? '#00C853' : C.bdr}`,
              color: downloaded === 'statement' ? '#fff' : C.text,
              fontSize: 13, fontWeight: 700, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
              opacity: filtered.length === 0 ? 0.5 : 1,
              fontFamily: F, transition: 'all 0.2s',
            }}
          >
            {downloaded === 'statement' ? <CheckCircle2 size={14} /> : <LayoutTemplate size={14} />}
            {downloaded === 'statement' ? 'Downloaded!' : 'Statement'}
          </button>
          <button
            onClick={() => { void shareExport() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 14px', borderRadius: 10,
              background: C.surf2, border: `1px solid ${C.bdr}`,
              color: C.t2, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            <Download size={14} />
            Share
          </button>
        </div>
      </div>

      {/* Records list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Calendar size={22} color={C.t3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 5 }}>No records in this period</div>
          <div style={{ fontSize: 13, color: C.t3 }}>Try a different period or source filter.</div>
        </div>
      ) : (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto',
            padding: '10px 16px 8px',
            borderBottom: `1px solid ${C.bdr}`,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Transaction</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Amount</span>
          </div>
          {filtered.map((rec, i) => (
            <RecordRow key={`${rec.date}-${i}`} rec={rec} last={i === filtered.length - 1} />
          ))}
        </div>
      )}

      {/* Period info footer */}
      {filtered.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <X size={12} color={C.t3} />
          <span style={{ fontSize: 11, color: C.t3 }}>
            Showing {filtered.length} records from {fmtDate(from)} to {fmtDate(to)}.
            Exported files use UTC timestamps.
          </span>
        </div>
      )}
    </div>
  )
}
