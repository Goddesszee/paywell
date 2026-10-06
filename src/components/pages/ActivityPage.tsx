import React, { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, Bot, Filter, Search, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const SURF = 'var(--nan-surface)'
const BDR  = 'var(--nan-bdr)'
const BLUE = '#0066FF'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const GREEN= '#00C853'
const RED  = '#FF3B3B'
const GOLD = '#F0A500'

type Filter = 'all' | 'sent' | 'received' | 'agent' | 'purchase'

function statusColor(status: string) {
  if (['confirmed','completed'].includes(status)) return GREEN
  if (['pending','payment_protected'].includes(status)) return GOLD
  if (['failed','cancelled'].includes(status)) return RED
  return T2
}

function StatusIcon({ status }: { status: string }) {
  if (['confirmed','completed'].includes(status)) return <CheckCircle2 size={11} color={GREEN} />
  if (['pending','payment_protected'].includes(status)) return <Clock size={11} color={GOLD} />
  return <XCircle size={11} color={RED} />
}

export function ActivityPage() {
  const { activity } = useAppStore()
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'sent', label: 'Sent' },
    { id: 'received', label: 'Received' },
    { id: 'agent', label: 'Agent' },
    { id: 'purchase', label: 'Purchases' },
  ]

  const filtered = activity.filter(item => {
    if (activeFilter === 'sent') return item.type === 'sent'
    if (activeFilter === 'received') return item.type === 'received'
    if (activeFilter === 'agent') return item.agentInitiated
    if (activeFilter === 'purchase') return item.type === 'purchase'
    return true
  }).filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.description?.toLowerCase().includes(q) || item.counterparty?.toLowerCase().includes(q)
  })

  // Group by date
  const groups: Map<string, typeof filtered> = new Map()
  filtered.forEach(item => {
    const d = new Date(item.timestamp)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 86400000
    let label: string
    if (diff < 1) label = 'Today'
    else if (diff < 2) label = 'Yesterday'
    else label = d.toLocaleDateString('en', { month: 'long', day: 'numeric' })
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(item)
  })

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily:F, paddingBottom:80 }}>

      <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.025em', color:TEXT, marginBottom:16 }}>Activity</h1>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:14 }}>
        <Search size={14} color={T3} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions…"
          style={{ width:'100%', padding:'10px 14px 10px 34px', background:SURF, border:`1px solid ${BDR}`, borderRadius:10, fontSize:14, fontFamily:F, color:TEXT, outline:'none', boxSizing:'border-box' }} />
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:18, overflowX:'auto', paddingBottom:2, scrollbarWidth:'none' }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
            padding:'6px 13px', borderRadius:20, cursor:'pointer', fontFamily:F,
            fontSize:12, fontWeight:600, whiteSpace:'nowrap', flexShrink:0,
            background: activeFilter===f.id ? BLUE : SURF,
            color: activeFilter===f.id ? '#fff' : T2,
            border: `1px solid ${activeFilter===f.id ? BLUE : BDR}`,
            transition:'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      {/* Activity list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px' }}>
          <div style={{ width:52,height:52,borderRadius:14,background:SURF,border:`1px solid ${BDR}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px' }}>
            <Filter size={20} color={T3} />
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:TEXT, marginBottom:5 }}>No transactions</div>
          <div style={{ fontSize:13, color:T3 }}>
            {search ? `No results for "${search}"` : 'Your activity will appear here'}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {[...groups.entries()].map(([label, items]) => (
            <div key={label}>
              <div style={{ fontSize:11, fontWeight:600, color:T3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{label}</div>
              <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, overflow:'hidden' }}>
                {items.map((item, idx) => {
                  const isIn = item.sign === '+'
                  const isBot = item.agentInitiated
                  return (
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderBottom: idx<items.length-1?`1px solid ${BDR}`:'none' }}>
                      <div style={{
                        width:38, height:38, borderRadius:10, flexShrink:0,
                        background: isBot ? 'rgba(0,102,255,0.08)' : isIn ? 'rgba(0,200,83,0.08)' : 'rgba(255,59,59,0.08)',
                        border:`1px solid ${isBot?'rgba(0,102,255,0.15)':isIn?'rgba(0,200,83,0.15)':'rgba(255,59,59,0.15)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                        {isBot ? <Bot size={16} color={BLUE} /> : isIn ? <ArrowDownLeft size={16} color={GREEN} /> : <ArrowUpRight size={16} color={RED} />}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:TEXT, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description || item.type}</div>
                        <div style={{ fontSize:11, color:T3, marginTop:2, display:'flex', alignItems:'center', gap:5 }}>
                          {item.counterparty && <span style={{ fontFamily:MONO }}>{item.counterparty}</span>}
                          {item.counterparty && <span style={{ color:'rgba(255,255,255,0.10)' }}>·</span>}
                          <span>{new Date(item.timestamp).toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' })}</span>
                          {item.status && <><span style={{ color:'rgba(255,255,255,0.10)' }}>·</span><div style={{ display:'flex',alignItems:'center',gap:3 }}><StatusIcon status={item.status} /><span style={{ color:statusColor(item.status) }}>{item.status}</span></div></>}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color: isIn ? GREEN : RED, fontFamily:MONO }}>
                          {item.sign}{item.amount} USDC
                        </div>
                        {item.txHash && (
                          <div style={{ fontSize:10, color:T3, fontFamily:MONO, marginTop:2 }}>{item.txHash.slice(0,8)}…</div>
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
