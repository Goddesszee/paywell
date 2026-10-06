import React, { useState } from 'react'
import {
  ArrowUpRight, ArrowDownLeft, Bot,
  Filter, Search, CheckCircle2, Clock, XCircle,
  ExternalLink, ArrowLeftRight, ShoppingBag,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const SURF = 'var(--nan-surface)'
const BDR  = 'var(--nan-bdr)'
const BLUE = '#0066FF'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const GREEN = '#00C853'
const RED   = '#FF3B3B'
const GOLD  = '#F0A500'

// Explorer base URLs per chain
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

function explorerUrl(txHash: string, chain?: string): string {
  const key = (chain ?? 'arc').toLowerCase()
  const base = EXPLORER[key] ?? EXPLORER['arc testnet']
  return `${base}/tx/${txHash}`
}

type FilterId = 'all' | 'sent' | 'received' | 'agent' | 'purchase' | 'bridge'

function statusColor(status: string) {
  if (['confirmed', 'completed'].includes(status)) return GREEN
  if (['pending', 'payment_protected'].includes(status)) return GOLD
  if (['failed', 'cancelled'].includes(status)) return RED
  return T2
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status)
  const icon =
    ['confirmed', 'completed'].includes(status) ? <CheckCircle2 size={10} color={color} /> :
    ['pending', 'payment_protected'].includes(status) ? <Clock size={10} color={color} /> :
    <XCircle size={10} color={color} />
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color, fontWeight: 600 }}>
      {icon}{status}
    </span>
  )
}

function typeIcon(type: string, sign: string, agentInitiated?: boolean) {
  if (agentInitiated) return { icon: <Bot size={16} color={BLUE} />, bg: 'rgba(0,102,255,0.08)', border: 'rgba(0,102,255,0.15)' }
  if (type === 'bridge')   return { icon: <ArrowLeftRight size={16} color={BLUE} />, bg: 'rgba(0,102,255,0.08)', border: 'rgba(0,102,255,0.15)' }
  if (type === 'purchase' || type === 'agent_purchase') return { icon: <ShoppingBag size={16} color={GOLD} />, bg: 'rgba(240,165,0,0.08)', border: 'rgba(240,165,0,0.15)' }
  if (sign === '+') return { icon: <ArrowDownLeft size={16} color={GREEN} />, bg: 'rgba(0,200,83,0.08)', border: 'rgba(0,200,83,0.15)' }
  return { icon: <ArrowUpRight size={16} color={RED} />, bg: 'rgba(255,59,59,0.08)', border: 'rgba(255,59,59,0.15)' }
}

/** Format date label for a group header */
function dateLabel(date: Date): string {
  const now = new Date()
  const diff = (now.getTime() - date.getTime()) / 86400000
  if (diff < 1) return 'Today'
  if (diff < 2) return 'Yesterday'
  return date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: diff > 300 ? 'numeric' : undefined })
}

/** Format time string for a row */
function timeStr(date: Date): string {
  return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

export function ActivityPage() {
  // Main wallet activity ONLY — agent wallet activity lives in the Agent Wallet tab
  const { activity } = useAppStore()
  const [activeFilter, setActiveFilter] = useState<FilterId>('all')
  const [search, setSearch] = useState('')

  const FILTERS: { id: FilterId; label: string }[] = [
    { id: 'all',      label: 'All' },
    { id: 'sent',     label: 'Sent' },
    { id: 'received', label: 'Received' },
    { id: 'bridge',   label: 'Bridge' },
    { id: 'purchase', label: 'Purchases' },
    { id: 'agent',    label: 'Agent' },
  ]

  // Filter to main-wallet items only (exclude agent wallet spend — those are agent_purchase)
  // agent_purchase entries created by the agent wallet are excluded here by type
  const mainActivity = activity.filter(item => item.type !== 'agent_purchase' || item.agentInitiated)

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

  // Group by date, sorted newest first within each group
  const groups: Map<string, typeof filtered> = new Map()
  // Sort all filtered items newest first
  const sorted = [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  sorted.forEach(item => {
    const label = dateLabel(new Date(item.timestamp))
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  })

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: F, paddingBottom: 80 }}>

      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: TEXT, marginBottom: 4 }}>Activity</h1>
      <p style={{ fontSize: 12, color: T3, marginBottom: 16 }}>Your NAN wallet transactions. Agent Wallet activity is in the Agent Wallet tab.</p>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} color={T3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by description, address or tx hash…"
          style={{ width: '100%', padding: '10px 14px 10px 34px', background: SURF, border: `1px solid ${BDR}`, borderRadius: 10, fontSize: 13, fontFamily: F, color: TEXT, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            background: activeFilter === f.id ? BLUE : SURF,
            color: activeFilter === f.id ? '#fff' : T2,
            border: `1px solid ${activeFilter === f.id ? BLUE : BDR}`,
            transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: SURF, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Filter size={20} color={T3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 5 }}>No transactions</div>
          <div style={{ fontSize: 13, color: T3 }}>
            {search ? `No results for "${search}"` : 'Your NAN wallet activity will appear here'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {[...groups.entries()].map(([label, items]) => (
            <div key={label}>
              {/* Date group header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                <div style={{ flex: 1, height: 1, background: BDR }} />
                <span style={{ fontSize: 11, color: T3 }}>{items.length} tx{items.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ background: SURF, border: `1px solid ${BDR}`, borderRadius: 14, overflow: 'hidden' }}>
                {items.map((item, idx) => {
                  const { icon, bg, border } = typeIcon(item.type, item.sign, item.agentInitiated)
                  const isIn = item.sign === '+'
                  const ts = new Date(item.timestamp)
                  const txUrl = item.txHash ? explorerUrl(item.txHash, item.type === 'bridge' ? item.counterparty : undefined) : null

                  return (
                    <div key={item.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 16px',
                      borderBottom: idx < items.length - 1 ? `1px solid ${BDR}` : 'none',
                    }}>
                      {/* Icon */}
                      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {icon}
                      </div>

                      {/* Main content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description || item.type}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px 8px', marginTop: 3 }}>
                          {/* Date + time */}
                          <span style={{ fontSize: 11, color: T3 }}>
                            {ts.toLocaleDateString('en', { month: 'short', day: 'numeric' })} · {timeStr(ts)}
                          </span>
                          {/* Status */}
                          {item.status && <StatusBadge status={item.status} />}
                          {/* Counterparty */}
                          {item.counterparty && (
                            <span style={{ fontSize: 10, color: T3, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                              {item.counterparty.startsWith('0x') && item.counterparty.length > 16
                                ? `${item.counterparty.slice(0, 6)}…${item.counterparty.slice(-4)}`
                                : item.counterparty}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount + explorer link */}
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isIn ? GREEN : RED, fontFamily: MONO }}>
                          {item.sign}{item.amount} USDC
                        </div>
                        {txUrl ? (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 10, color: BLUE, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                          >
                            {item.txHash!.slice(0, 6)}…{item.txHash!.slice(-4)}
                            <ExternalLink size={9} color={BLUE} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 10, color: T3 }}>—</span>
                        )}
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
