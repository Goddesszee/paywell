import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { PaywellLogo } from '../ui/Logo'
import { BarChart3, Users, ShoppingBag, Zap, ArrowUpRight, ArrowDownLeft, RefreshCw, Shield, Globe, Cpu, CheckCircle, XCircle, Activity } from 'lucide-react'

const SANS = "'Inter', -apple-system, sans-serif"
const S = '#F7F7F8'
const B = 'rgba(0,0,0,0.08)'

type Metric = { label: string; value: string; sub: string; icon: React.ReactNode; trend?: string }

function MetricCard({ label, value, sub, icon, trend }: Metric) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: trend.startsWith('+') ? '#16A34A' : '#DC2626', background: trend.startsWith('+') ? '#F0FDF4' : '#FEF2F2', padding: '2px 7px', borderRadius: 20 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6B6B6B' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

type InfraItem = { name: string; status: 'live' | 'ready' | 'pending'; desc: string; icon: React.ReactNode }

function InfraCard({ name, status, desc, icon }: InfraItem) {
  const color = status === 'live' ? '#16A34A' : status === 'ready' ? '#2563EB' : '#D97706'
  const label = status === 'live' ? 'Live' : status === 'ready' ? 'Ready' : 'Needs key'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#fff', border: `1px solid ${B}`, borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12, color: '#6B6B6B' }}>{desc}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}18`, padding: '3px 9px', borderRadius: 20, flexShrink: 0 }}>
        {label}
      </span>
    </div>
  )
}

export function AdminDashboard() {
  const { activity } = useAppStore()
  const [tab, setTab] = useState<'overview' | 'activity' | 'circle' | 'users'>('overview')
  const [now] = useState(new Date())

  // Computed stats from real activity store
  const totalVol = activity.reduce((s, a) => s + (a.amount || 0), 0)
  const sends = activity.filter(a => a.type === 'sent').length
  const receives = activity.filter(a => a.type === 'received').length
  const shops = activity.filter(a => a.type === 'purchase').length

  // Env var check (Vite exposes VITE_ vars)
  const hasGroq = Boolean(import.meta.env.VITE_GROQ_API_KEY)
  const hasX402 = Boolean(import.meta.env.VITE_X402_SELLER_ADDRESS)
  const hasOnramp = Boolean(import.meta.env.VITE_STABLECOIN_KIT_KEY)

  const CIRCLE_INFRA: InfraItem[] = [
    { name: 'Arc Testnet RPC', status: 'live', desc: 'USDC as native gas · sub-second finality', icon: <Globe size={16} /> },
    { name: 'USDC ERC-20 Contract', status: 'live', desc: '0x3600...0000 · balances + transfers', icon: <CheckCircle size={16} color="#16A34A" /> },
    { name: 'CCTP V2 Bridge', status: 'live', desc: 'Arc ↔ Base ↔ Arbitrum ↔ Ethereum', icon: <ArrowUpRight size={16} /> },
    { name: 'Circle AppKit Swap', status: 'live', desc: 'USDC ↔ tokens via Circle swap routes', icon: <RefreshCw size={16} /> },
    { name: 'x402 Micropayments', status: hasX402 ? 'live' : 'ready', desc: 'Per-call USDC payments for AI agent API', icon: <Zap size={16} /> },
    { name: 'Circle Onramp Kit', status: hasOnramp ? 'live' : 'pending', desc: 'Fiat → USDC · needs Kit Key', icon: <ArrowDownLeft size={16} /> },
    { name: 'Groq AI (Agent Chat)', status: hasGroq ? 'live' : 'pending', desc: 'Real AI responses · needs GROQ_API_KEY', icon: <Cpu size={16} /> },
    { name: 'Permit2', status: 'live', desc: '0x0000...D473 · gasless USDC approvals', icon: <Shield size={16} /> },
  ]

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'circle', label: 'Circle Infra' },
    { id: 'users', label: 'Users' },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: S, fontFamily: SANS, color: '#0D0D0D' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${B}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PaywellLogo size="sm" />
          <div style={{ width: 1, height: 20, background: B }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6B6B6B' }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#A0A0A0' }}>{now.toLocaleTimeString()}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#F0FDF4', padding: '2px 8px', borderRadius: 20 }}>● Live</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${B}`, display: 'flex', overflowX: 'auto', padding: '0 20px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none',
            border: 'none', fontFamily: SANS, whiteSpace: 'nowrap',
            color: tab === t.id ? '#0D0D0D' : '#A0A0A0',
            borderBottom: `2px solid ${tab === t.id ? '#0D0D0D' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '20px', maxWidth: 900, margin: '0 auto' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Platform Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
              <MetricCard label="Total Volume" value={`$${totalVol.toFixed(2)}`} sub="USDC on Arc Testnet" icon={<BarChart3 size={16} />} trend={activity.length > 0 ? '+active' : '—'} />
              <MetricCard label="Transactions" value={String(activity.length)} sub="All time" icon={<Activity size={16} />} />
              <MetricCard label="Sends" value={String(sends)} sub="Outgoing transfers" icon={<ArrowUpRight size={16} />} />
              <MetricCard label="Purchases" value={String(shops)} sub="Shop checkouts" icon={<ShoppingBag size={16} />} />
            </div>

            {/* Circle infra summary */}
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Circle Infrastructure</div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
              {[
                { label: 'Arc Testnet', live: true },
                { label: 'USDC Contract', live: true },
                { label: 'CCTP Bridge', live: true },
                { label: 'AppKit Swap', live: true },
                { label: 'x402 Micropayments', live: hasX402 },
                { label: 'Onramp Kit', live: hasOnramp },
              ].map(({ label, live }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${B}` }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {live ? <CheckCircle size={14} color="#16A34A" /> : <XCircle size={14} color="#D97706" />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: live ? '#16A34A' : '#D97706' }}>{live ? 'Live' : 'Needs key'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Recent Activity</div>
            {activity.length === 0 ? (
              <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No activity yet — transactions appear here in real time
              </div>
            ) : (
              <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
                {activity.slice(0, 5).map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < 4 ? `1px solid ${B}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{a.type}</div>
                      <div style={{ fontSize: 11, color: '#A0A0A0' }}>{a.description || a.counterparty || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: a.type === 'received' ? '#16A34A' : '#0D0D0D' }}>
                        {a.type === 'received' ? '+' : '-'}{a.amount?.toFixed(2) ?? '—'} USDC
                      </div>
                      <div style={{ fontSize: 11, color: '#A0A0A0' }}>
                        {a.status === 'confirmed' ? '✓ Confirmed' : a.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {tab === 'activity' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>All Transactions</div>
            {activity.length === 0 ? (
              <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No transactions yet. Connect a wallet and make a transfer to see activity here.
              </div>
            ) : (
              <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '10px 16px', borderBottom: `1px solid ${B}`, background: S }}>
                  {['Type', 'Amount', 'Status', 'Hash'].map(h => (
                    <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {activity.map((a, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < activity.length - 1 ? `1px solid ${B}` : 'none', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{a.type}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{a.amount?.toFixed(2) ?? '—'} USDC</div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: a.status === 'confirmed' ? '#16A34A' : '#D97706', background: a.status === 'confirmed' ? '#F0FDF4' : '#FFFBEB', padding: '2px 7px', borderRadius: 20 }}>
                        {a.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#A0A0A0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.txHash ? a.txHash.slice(0, 12) + '...' : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CIRCLE INFRA ── */}
        {tab === 'circle' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Circle Infrastructure</div>
            <div style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>All Circle SDKs and contracts integrated into Paywell</div>
            {CIRCLE_INFRA.map(item => <InfraCard key={item.name} {...item} />)}

            {/* Env var checklist */}
            <div style={{ marginTop: 24, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Environment Variables</div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
              {[
                { key: 'GROQ_API_KEY', desc: 'Real AI agent chat', set: hasGroq },
                { key: 'VITE_X402_SELLER_ADDRESS', desc: 'x402 micropayment receiver', set: hasX402 },
                { key: 'CIRCLE_STABLECOIN_KIT_API_KEY', desc: 'Buy USDC onramp widget', set: hasOnramp },
                { key: 'SMTP_HOST + SMTP_USER + SMTP_PASS', desc: 'Real email OTP delivery', set: false },
              ].map(({ key, desc, set }, i) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < 3 ? `1px solid ${B}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#0D0D0D' }}>{key}</div>
                    <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12 }}>
                    {set ? <CheckCircle size={14} color="#16A34A" /> : <XCircle size={14} color="#D97706" />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: set ? '#16A34A' : '#D97706' }}>{set ? 'Set' : 'Not set'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Users</div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center' }}>
              <Users size={32} style={{ margin: '0 auto 16px', color: '#D0D0D0' }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>User tracking coming soon</div>
              <div style={{ fontSize: 13, color: '#A0A0A0', maxWidth: 280, margin: '0 auto', lineHeight: 1.6 }}>
                Connect a database (Supabase) to track registered users, wallet addresses, and usage patterns.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
