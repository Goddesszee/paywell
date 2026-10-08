import React, { useState } from 'react'
import {
  ArrowUpRight, ArrowDownLeft, Bot,
  Filter, Search, CheckCircle2, Clock, XCircle,
  ExternalLink, ArrowLeftRight, ShoppingBag, RefreshCw,
  Download, Share2, X as XIcon, FileText,
} from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { forceActivityRefresh } from '../../hooks/usePaymentWatcher'
import { useAccount } from 'wagmi'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const BLUE  = '#0066FF'
const GREEN = '#00C853'
const RED   = '#FF3B3B'
const GOLD  = '#F0A500'

function explorerUrl(txHash: string, chain?: string): string {
  const key  = (chain ?? 'arc').toLowerCase()
  const base = EXPLORER[key] ?? EXPLORER['arc testnet']
  return `${base}/tx/${txHash}`
}

type FilterId = 'all' | 'sent' | 'received' | 'agent' | 'purchase' | 'bridge'

function statusColor(status: string) {
  if (['confirmed', 'completed'].includes(status)) return GREEN
  if (['pending', 'payment_protected'].includes(status)) return GOLD
  return RED
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status)
  const icon =
    ['confirmed', 'completed'].includes(status)
      ? <CheckCircle2 size={10} color={color} />
      : ['pending', 'payment_protected'].includes(status)
        ? <Clock size={10} color={color} />
        : <XCircle size={10} color={color} />
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color, fontWeight: 600 }}>
      {icon} {status}
    </span>
  )
}

function typeIcon(type: string, sign: string, agentInitiated?: boolean) {
  if (agentInitiated)                                         return { icon: <Bot size={16} color={BLUE} />,            bg: 'rgba(0,102,255,0.1)',  border: 'rgba(0,102,255,0.2)'  }
  if (type === 'bridge')                                      return { icon: <ArrowLeftRight size={16} color={BLUE} />, bg: 'rgba(0,102,255,0.1)',  border: 'rgba(0,102,255,0.2)'  }
  if (type === 'purchase' || type === 'agent_purchase')       return { icon: <ShoppingBag size={16} color={GOLD} />,    bg: 'rgba(240,165,0,0.1)',  border: 'rgba(240,165,0,0.2)'  }
  if (sign === '+')                                           return { icon: <ArrowDownLeft size={16} color={GREEN} />, bg: 'rgba(0,200,83,0.1)',   border: 'rgba(0,200,83,0.2)'   }
  return                                                             { icon: <ArrowUpRight size={16} color={RED} />,    bg: 'rgba(255,59,59,0.1)',  border: 'rgba(255,59,59,0.2)'  }
}

function dateLabel(date: Date): string {
  const now  = new Date()
  const diff = (now.getTime() - date.getTime()) / 86400000
  if (diff < 1) return 'Today'
  if (diff < 2) return 'Yesterday'
  return date.toLocaleDateString('en', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: diff > 300 ? 'numeric' : undefined,
  })
}

function timeStr(date: Date): string {
  return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

// ── Receipt modal ──────────────────────────────────────────────────────────────
const EXPLORER: Record<string, string> = {
  'arc':          'https://explorer.testnet.arc.io',
  'arc testnet':  'https://explorer.testnet.arc.io',
  'arc mainnet':  'https://explorer.arc.io',
  'eth':          'https://sepolia.etherscan.io',
  'base':         'https://sepolia.basescan.org',
  'base sepolia': 'https://sepolia.basescan.org',
  'arbitrum':     'https://sepolia.arbiscan.io',
  'polygon':      'https://amoy.polygonscan.com',
  'avalanche':    'https://testnet.snowtrace.io',
  'op':           'https://sepolia-optimistic.etherscan.io',
  'unichain':     'https://sepolia.uniscan.xyz',
}

function ReceiptModal({ item, onClose }: { item: ActivityItem; onClose: () => void }) {
  const C   = useNanTheme()
  const isIn = item.sign === '+'
  const txUrl = item.txHash
    ? `${EXPLORER[(item.chain ?? 'arc testnet').toLowerCase()] ?? EXPLORER['arc testnet']}/tx/${item.txHash}`
    : null

  function buildReceiptText(): string {
    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '       NAN PAYMENT RECEIPT      ',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Date:        ${new Date(item.timestamp).toLocaleString('en')}`,
      `Type:        ${item.type}`,
      `Description: ${item.description}`,
      `Amount:      ${item.sign}${item.amount} USDC`,
      `Status:      ${item.status}`,
    ]
    if (item.counterparty) lines.push(`Counterparty: ${item.counterparty}`)
    if (item.chain)        lines.push(`Network:     ${item.chain}`)
    if (item.txHash)       lines.push(`Tx Hash:     ${item.txHash}`)
    if (txUrl)             lines.push(`Explorer:    ${txUrl}`)
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.push('Powered by NAN · nanarc.xyz')
    return lines.join('\n')
  }

  function handleDownload() {
    const txt = buildReceiptText()
    const blob = new Blob([txt], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    const ts   = new Date(item.timestamp).toISOString().slice(0, 10)
    a.href = url; a.download = `nan-receipt-${ts}-${item.id.slice(-6)}.txt`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async function handleShare() {
    const text = buildReceiptText()
    if (navigator.share) {
      try { await navigator.share({ title: 'NAN Receipt', text }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      alert('Receipt copied to clipboard')
    }
  }

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Date',        value: new Date(item.timestamp).toLocaleString('en') },
    { label: 'Type',        value: item.type },
    { label: 'Description', value: item.description },
    { label: 'Amount',      value: `${item.sign}${item.amount} USDC`, mono: true },
    { label: 'Status',      value: item.status },
    ...(item.counterparty ? [{ label: 'Counterparty', value: item.counterparty, mono: true }] : []),
    ...(item.chain ? [{ label: 'Network', value: item.chain }] : []),
    ...(item.txHash ? [{ label: 'Tx Hash', value: item.txHash, mono: true }] : []),
  ]

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 210,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        borderRadius: '20px 20px 0 0',
        border: `1px solid ${C.bdr}`,
        boxShadow: '0 -16px 64px rgba(0,0,0,0.4)',
        maxHeight: '90dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.bdr, margin: '12px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: isIn ? 'rgba(0,200,83,0.12)' : 'rgba(255,59,59,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={16} color={isIn ? '#00C853' : '#FF3B3B'} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Payment Receipt</div>
              <div style={{ fontSize: 11, color: C.t3 }}>NAN · {new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <XIcon size={14} color={C.t2} />
          </button>
        </div>

        {/* Amount hero */}
        <div style={{ textAlign: 'center', padding: '8px 20px 16px', borderBottom: `1px solid ${C.bdr}`, flexShrink: 0 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: isIn ? '#00C853' : '#FF3B3B', fontFamily: "'JetBrains Mono', Menlo, monospace", letterSpacing: '-0.03em' }}>
            {item.sign}{item.amount} USDC
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>{item.description}</div>
        </div>

        {/* Details */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', scrollbarWidth: 'none' }}>
          {rows.map(({ label, value, mono }, i) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.bdr}` : 'none', gap: 12 }}>
              <span style={{ fontSize: 12, color: C.t3, flexShrink: 0, paddingTop: 1 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', wordBreak: 'break-all', fontFamily: mono ? "'JetBrains Mono', Menlo, monospace" : 'inherit' }}>{value}</span>
            </div>
          ))}

          {/* Explorer link */}
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 12,
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(0,102,255,0.07)', border: '1px solid rgba(0,102,255,0.18)',
              color: '#0066FF', fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}>
              <ExternalLink size={13} /> View on Explorer
            </a>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 20px 20px', display: 'flex', gap: 10, flexShrink: 0, borderTop: `1px solid ${C.bdr}` }}>
          <button onClick={handleDownload} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '13px', borderRadius: 12,
            background: '#0066FF', border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            boxShadow: '0 4px 16px rgba(0,102,255,0.3)',
          }}>
            <Download size={15} /> Download
          </button>
          <button onClick={() => { void handleShare() }} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '13px', borderRadius: 12,
            background: C.surf2, border: `1px solid ${C.bdr}`, color: C.text,
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}>
            <Share2 size={15} /> Share
          </button>
        </div>
      </div>
    </>
  )
}

export function ActivityPage() {
  const C = useNanTheme()
  const { activity, auth } = useAppStore()
  const { address: wagmiAddress } = useAccount()
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [receiptItem, setReceiptItem] = useState<ActivityItem | null>(null)

  // Trigger an immediate re-poll from the global watcher (no local async state)
  function handleRefresh() {
    setRefreshing(true)
    forceActivityRefresh()
    // Brief visual spinner — actual data arrives via store subscription
    setTimeout(() => setRefreshing(false), 2000)
  }

  // All items come from the store, kept up to date by usePaymentWatcher in AppShell
  const merged = [...activity]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const FILTERS: { id: FilterId; label: string }[] = [
    { id: 'all',      label: 'All' },
    { id: 'sent',     label: 'Sent' },
    { id: 'received', label: 'Received' },
    { id: 'bridge',   label: 'Bridge' },
    { id: 'purchase', label: 'Purchases' },
    { id: 'agent',    label: 'Agent' },
  ]

  // Main wallet only — agent_purchase entries without agentInitiated flag belong to agent wallet
  const mainActivity = merged.filter(item => item.type !== 'agent_purchase' || item.agentInitiated)

  const filtered = mainActivity.filter(item => {
    if (activeFilter === 'sent')     return item.type === 'sent'
    if (activeFilter === 'received') return item.type === 'received'
    if (activeFilter === 'bridge')   return item.type === 'bridge'
    if (activeFilter === 'purchase') return item.type === 'purchase'
    if (activeFilter === 'agent')    return item.agentInitiated === true
    return true
  }).filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.description?.toLowerCase().includes(q) ||
      item.counterparty?.toLowerCase().includes(q) ||
      item.txHash?.toLowerCase().includes(q)
    )
  })

  // Group by date, newest first
  const groups: Map<string, typeof filtered> = new Map()
  const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  sorted.forEach(item => {
    const label = dateLabel(new Date(item.timestamp))
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  })

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: F, paddingBottom: 80 }}>

      {/* Receipt modal */}
      {receiptItem && <ReceiptModal item={receiptItem} onClose={() => setReceiptItem(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: C.text, margin: 0 }}>Activity</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 10,
            background: C.surf, border: `1px solid ${C.bdr}`,
            color: C.t2, fontSize: 12, fontWeight: 600,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontFamily: F, opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} style={{ animation: refreshing ? 'nan-spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: C.t3, marginBottom: 16 }}>
        Your NAN wallet transactions. Agent Wallet activity is in the Agent Wallet tab.
      </p>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by description, address or tx hash…"
          style={{
            width: '100%', padding: '10px 14px 10px 34px',
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 10, fontSize: 13, fontFamily: F,
            color: C.text, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            background: activeFilter === f.id ? BLUE : C.surf,
            color: activeFilter === f.id ? '#fff' : C.t2,
            border: `1px solid ${activeFilter === f.id ? BLUE : C.bdr}`,
            transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: C.surf, border: `1px solid ${C.bdr}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            {refreshing
              ? <RefreshCw size={20} color={C.blue} style={{ animation: 'nan-spin 0.8s linear infinite' }} />
              : <Filter size={20} color={C.t3} />
            }
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 5 }}>
            {refreshing ? 'Syncing…' : 'No transactions'}
          </div>
          <div style={{ fontSize: 13, color: C.t3 }}>
            {!address
              ? 'Connect a wallet to see your transaction history'
              : search
                ? `No results for "${search}"`
                : 'Your NAN wallet activity will appear here. Auto-refreshes every 30 seconds.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {[...groups.entries()].map(([label, items]) => (
            <div key={label}>

              {/* Date group header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: C.bdr }} />
                <span style={{ fontSize: 11, color: C.t3 }}>{items.length} tx{items.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, overflow: 'hidden' }}>
                {items.map((item, idx) => {
                  const { icon, bg, border } = typeIcon(item.type, item.sign, item.agentInitiated)
                  const isIn  = item.sign === '+'
                  const ts    = new Date(item.timestamp)
                  // Use bridge counterparty as chain hint for the explorer URL
                  const txUrl = item.txHash
                    ? explorerUrl(item.txHash, item.type === 'bridge' ? item.counterparty : undefined)
                    : null

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 16px',
                        borderBottom: idx < items.length - 1 ? `1px solid ${C.bdr}` : 'none',
                      }}
                    >
                      {/* Type icon */}
                      <div style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: bg, border: `1px solid ${border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {icon}
                      </div>

                      {/* Description + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: C.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.description || item.type}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px 8px', marginTop: 3 }}>
                          {/* Date + time */}
                          <span style={{ fontSize: 11, color: C.t3 }}>
                            {ts.toLocaleDateString('en', { month: 'short', day: 'numeric' })} · {timeStr(ts)}
                          </span>
                          {/* Status */}
                          {item.status && <StatusBadge status={item.status} />}
                          {/* Counterparty */}
                          {item.counterparty && (
                            <span style={{ fontSize: 10, color: C.t3, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                              {item.counterparty.startsWith('0x') && item.counterparty.length > 16
                                ? `${item.counterparty.slice(0, 6)}…${item.counterparty.slice(-4)}`
                                : item.counterparty}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount + receipt + explorer */}
                      <div style={{
                        textAlign: 'right', flexShrink: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isIn ? GREEN : RED, fontFamily: MONO }}>
                          {item.sign}{item.amount} USDC
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {/* Receipt button */}
                          <button
                            onClick={() => setReceiptItem(item)}
                            title="View receipt"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              padding: '3px 7px', borderRadius: 6,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: C.t3, fontSize: 11, fontWeight: 600,
                              cursor: 'pointer', fontFamily: F,
                            }}
                          >
                            <FileText size={10} color={C.t3} /> Receipt
                          </button>

                          {/* Explorer link */}
                          {txUrl && (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 11, color: BLUE, fontFamily: MONO,
                                display: 'flex', alignItems: 'center', gap: 3,
                                textDecoration: 'none', fontWeight: 600,
                                background: 'rgba(0,102,255,0.08)',
                                padding: '3px 7px', borderRadius: 6,
                              }}
                            >
                              {item.txHash!.slice(0, 6)}…
                              <ExternalLink size={10} color={BLUE} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  )
}
