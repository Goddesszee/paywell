import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useShopStore } from '../../store/shopStore'
import type { DeliveryMethod, ConditionLabel } from '../../store/shopStore'
import { FEE_WALLET, MARKETPLACE_FEE_BPS, SWAP_FEE_BPS, BRIDGE_FEE_BPS, bpsToPercent } from '../../lib/fees'

import { BarChart3, Users, ShoppingBag, Zap, ArrowUpRight, ArrowDownLeft, RefreshCw, Shield, Globe, Cpu, CheckCircle, XCircle, Activity, ArrowLeft, TrendingUp } from 'lucide-react'

const SANS = "'Inter', -apple-system, sans-serif"
const S = '#1a1a1a'
const B = 'rgba(0,0,0,0.08)'

type Metric = { label: string; value: string; sub: string; icon: React.ReactNode; trend?: string }

function MetricCard({ label, value, sub, icon, trend }: Metric) {
  return (
    <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {trend && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#5C5C6B', background: '#1a1a1a', padding: '2px 7px', borderRadius: 20 }}>
            {trend}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#a0a0a0' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

type InfraItem = { name: string; status: 'live' | 'ready' | 'pending'; desc: string; icon: React.ReactNode }

function InfraCard({ name, status, desc, icon }: InfraItem) {
  const label = status === 'live' ? 'Live' : status === 'ready' ? 'Ready' : 'Needs key'
  const badgeColor = status === 'live' ? '#ffffff' : '#9898A6'
  const badgeBg = status === 'live' ? '#1a1a1a' : '#1a1a1a'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 12, color: '#a0a0a0' }}>{desc}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: badgeColor, background: badgeBg, padding: '3px 9px', borderRadius: 20, flexShrink: 0 }}>
        {label}
      </span>
    </div>
  )
}

export function AdminDashboard() {
  const { activity, pendingListings, approveListing, rejectListing, setActiveView, feeRevenue, fetchPendingListings } = useAppStore()
  const { addShopProduct, setShopProducts, fetchShopProducts } = useShopStore()
  const [tab, setTab] = useState<'overview' | 'listings' | 'activity' | 'revenue' | 'circle' | 'users'>('overview')
  const [now] = useState(new Date())

  // Pull the shared, server-side listing queue and catalog — without this,
  // Admin would only ever see submissions made from this same browser.
  useEffect(() => {
    fetchPendingListings()
    fetchShopProducts()
  }, [fetchPendingListings, fetchShopProducts])

  // Computed stats from real activity store
  const totalVol = activity.reduce((s, a) => s + (a.amount || 0), 0)
  const sends = activity.filter(a => a.type === 'sent').length
  const shops = activity.filter(a => a.type === 'purchase').length

  // Approve a listing: publish it server-side (shared across every visitor),
  // then resync both stores from the server response.
  const handleApprove = async (id: string) => {
    const listing = pendingListings.find(l => l.id === id)
    if (!listing) return

    const shopProduct = {
      name: listing.name,
      description: listing.description || '',
      price: listing.price,
      merchant: listing.kycFullName || 'Seller',
      merchantId: listing.merchantWallet,
      merchantWallet: listing.merchantWallet,
      merchantVerified: true,
      merchantRating: 0,
      merchantCompletedTx: 0,
      merchantLocation: undefined,
      merchantResponseRate: undefined,
      merchantJoined: new Date().toISOString(),
      category: listing.category,
      condition: 'good' as ConditionLabel,
      images: listing.imageBase64
        ? [listing.imageBase64]
        : listing.imageUrl
        ? [listing.imageUrl]
        : [],
      rating: 0,
      reviewCount: 0,
      inStock: true,
      quantity: 1,
      tags: [listing.category],
      location: undefined,
      deliveryOptions: ['standard'] as DeliveryMethod[],
      deliveryDays: undefined,
      isVerifiedListing: true,
      agentSearchable: true,
      agentKeywords: [listing.name, listing.category],
    }

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id, shopProduct }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { pending: any[]; approved: any[] }
      setShopProducts(data.approved)
      approveListing(id) // local optimistic marker; server is already the source of truth
    } catch (err) {
      console.error('Failed to approve listing on server, applying locally only', err)
      approveListing(id)
      addShopProduct(shopProduct)
    }
  }

  // Env var check (Vite exposes VITE_ vars)
  const hasGroq = Boolean(import.meta.env.VITE_GROQ_API_KEY)
  const hasX402 = Boolean(import.meta.env.VITE_X402_SELLER_ADDRESS)
  const hasOnramp = Boolean(import.meta.env.VITE_STABLECOIN_KIT_KEY)

  const CIRCLE_INFRA: InfraItem[] = [
    { name: 'Arc Testnet RPC', status: 'live', desc: 'USDC as native gas · sub-second finality', icon: <Globe size={16} /> },
    { name: 'USDC ERC-20 Contract', status: 'live', desc: '0x3600...0000 · balances + transfers', icon: <CheckCircle size={16} color="#ffffff" /> },
    { name: 'CCTP V2 Bridge', status: 'live', desc: 'Arc ↔ Base ↔ Arbitrum ↔ Ethereum', icon: <ArrowUpRight size={16} /> },
    { name: 'Circle AppKit Swap', status: 'live', desc: 'USDC ↔ tokens via Circle swap routes', icon: <RefreshCw size={16} /> },
    { name: 'x402 Micropayments', status: hasX402 ? 'live' : 'ready', desc: 'Per-call USDC payments for AI agent API', icon: <Zap size={16} /> },
    { name: 'Circle Onramp Kit', status: hasOnramp ? 'live' : 'pending', desc: 'Fiat → USDC · needs Kit Key', icon: <ArrowDownLeft size={16} /> },
    { name: 'Groq AI (Agent Chat)', status: hasGroq ? 'live' : 'pending', desc: 'Real AI responses · needs GROQ_API_KEY', icon: <Cpu size={16} /> },
    { name: 'Permit2', status: 'live', desc: '0x0000...D473 · gasless USDC approvals', icon: <Shield size={16} /> },
  ]

  // Revenue computed stats
  const totalFeeRevenue = feeRevenue.reduce((s, f) => s + f.feeAmount, 0)
  const marketplaceFeeTotal = feeRevenue.filter(f => f.source === 'marketplace').reduce((s, f) => s + f.feeAmount, 0)
  const swapFeeTotal = feeRevenue.filter(f => f.source === 'swap').reduce((s, f) => s + f.feeAmount, 0)
  const bridgeFeeTotal = feeRevenue.filter(f => f.source === 'bridge').reduce((s, f) => s + f.feeAmount, 0)

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'listings', label: `Listings${pendingListings.filter(l=>l.status==='pending').length > 0 ? ` (${pendingListings.filter(l=>l.status==='pending').length})` : ''}` },
    { id: 'activity', label: 'Activity' },
    { id: 'revenue', label: `Revenue${feeRevenue.length > 0 ? ` (${feeRevenue.length})` : ''}` },
    { id: 'circle', label: 'Circle Infra' },
    { id: 'users', label: 'Users' },
  ] as const

  return (
    <div style={{ minHeight: '100vh', background: S, fontFamily: SANS, color: '#ffffff' }}>
      {/* Header */}
      <div style={{ background: '#0d0d0d', borderBottom: `1px solid ${B}`, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setActiveView('home')}
            aria-label="Back to app"
            style={{ background: S, border: `1px solid ${B}`, borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <ArrowLeft size={16} color="#ffffff" />
          </button>
          <span style={{fontWeight:700,fontSize:18,letterSpacing:"-0.02em",color:"#F4F4F8",fontFamily:"Inter,sans-serif"}}>NAN</span>
          <div style={{ width: 1, height: 20, background: B }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#a0a0a0' }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#A0A0A0' }}>{now.toLocaleTimeString()}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#ffffff', background: '#1a1a1a', padding: '2px 8px', borderRadius: 20 }}>● Live</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#0d0d0d', borderBottom: `1px solid ${B}`, display: 'flex', overflowX: 'auto', padding: '0 20px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'none',
            border: 'none', fontFamily: SANS, whiteSpace: 'nowrap',
            color: tab === t.id ? '#ffffff' : '#A0A0A0',
            borderBottom: `2px solid ${tab === t.id ? '#ffffff' : 'transparent'}`,
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
            <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
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
                    {live ? <CheckCircle size={14} color="#ffffff" /> : <XCircle size={14} color="#9898A6" />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: live ? '#ffffff' : '#9898A6' }}>{live ? 'Live' : 'Needs key'}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent activity */}
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Recent Activity</div>
            {activity.length === 0 ? (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No activity yet — transactions appear here in real time
              </div>
            ) : (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
                {activity.slice(0, 5).map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < 4 ? `1px solid ${B}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{a.type}</div>
                      <div style={{ fontSize: 11, color: '#A0A0A0' }}>{a.description || a.counterparty || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>
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

        {/* ── LISTINGS ── */}
        {tab === 'listings' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Product Listings</div>
            <div style={{ fontSize: 13, color: '#a0a0a0', marginBottom: 20 }}>Review and approve merchant product submissions</div>
            {pendingListings.length === 0 ? (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No listings submitted yet. Merchants can list products from the Shop page.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingListings.map(l => (
                  <div key={l.id} style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {(l.imageBase64 || l.imageUrl) && (
                        <img src={l.imageBase64 || l.imageUrl} alt={l.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{l.name}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, padding: '2px 8px', borderRadius: 20,
                            color: '#ffffff',
                            background: '#1a1a1a',
                          }}>{l.status}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#5C5C6B', marginBottom: 4 }}>{l.description || 'No description'}</div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{l.price} USDC</span>
                          <span style={{ fontSize: 12, color: '#9898A6' }}>{l.category}</span>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#9898A6' }}>{l.merchantWallet.slice(0,8)}...{l.merchantWallet.slice(-4)}</span>
                        </div>
                        {/* KYC info */}
                        {l.kycFullName && (
                          <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>KYC Details</div>
                            <div style={{ fontSize: 12, color: '#ffffff' }}>{l.kycFullName}</div>
                            <div style={{ fontSize: 11, color: '#5C5C6B' }}>{l.kycIdType} · {l.kycIdNumber}</div>
                          </div>
                        )}
                        {l.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleApprove(l.id)} style={{ height: 32, padding: '0 16px', borderRadius: 8, background: '#ffffff', color: '#ffffff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: SANS }}>
                              ✓ Approve
                            </button>
                            <button onClick={() => rejectListing(l.id)} style={{ height: 32, padding: '0 16px', borderRadius: 8, background: '#1a1a1a', color: '#ffffff', fontSize: 12, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)', cursor: 'pointer', fontFamily: SANS }}>
                              ✕ Reject
                            </button>
                          </div>
                        )}
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
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No transactions yet. Connect a wallet and make a transfer to see activity here.
              </div>
            ) : (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
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
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#5C5C6B', background: '#1a1a1a', padding: '2px 7px', borderRadius: 20 }}>
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
            <div style={{ fontSize: 13, color: '#a0a0a0', marginBottom: 20 }}>All Circle SDKs and contracts integrated into NAN</div>
            {CIRCLE_INFRA.map(item => <InfraCard key={item.name} {...item} />)}

            {/* Env var checklist */}
            <div style={{ marginTop: 24, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Environment Variables</div>
            <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
              {[
                { key: 'GROQ_API_KEY', desc: 'Real AI agent chat', set: hasGroq },
                { key: 'VITE_X402_SELLER_ADDRESS', desc: 'x402 micropayment receiver', set: hasX402 },
                { key: 'CIRCLE_API_KEY', desc: 'Buy USDC onramp widget', set: hasOnramp },
                { key: 'SMTP_HOST + SMTP_USER + SMTP_PASS', desc: 'Real email OTP delivery', set: false },
              ].map(({ key, desc, set }, i) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < 3 ? `1px solid ${B}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#ffffff' }}>{key}</div>
                    <div style={{ fontSize: 11, color: '#A0A0A0', marginTop: 2 }}>{desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 12 }}>
                    {set ? <CheckCircle size={14} color="#ffffff" /> : <XCircle size={14} color="#9898A6" />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: set ? '#ffffff' : '#9898A6' }}>{set ? 'Set' : 'Not set'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── REVENUE ── */}
        {tab === 'revenue' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Revenue</div>
            <div style={{ fontSize: 13, color: '#a0a0a0', marginBottom: 20 }}>Platform fees collected across all services</div>

            {/* Fee wallet */}
            <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Fee wallet</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#ffffff', wordBreak: 'break-all' }}>{FEE_WALLET}</div>
              <div style={{ fontSize: 11, color: '#9898A6', marginTop: 4 }}>All platform fees are sent to this address on Arc Testnet</div>
            </div>

            {/* Fee schedule */}
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Fee schedule</div>
            <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
              {[
                { label: 'Marketplace sale', rate: bpsToPercent(MARKETPLACE_FEE_BPS), total: marketplaceFeeTotal, icon: <ShoppingBag size={14} /> },
                { label: 'Swap', rate: bpsToPercent(SWAP_FEE_BPS), total: swapFeeTotal, icon: <RefreshCw size={14} /> },
                { label: 'Bridge', rate: bpsToPercent(BRIDGE_FEE_BPS) + ' (min $0.10)', total: bridgeFeeTotal, icon: <ArrowUpRight size={14} /> },
                { label: 'Send / Receive', rate: 'Free', total: null, icon: <ArrowDownLeft size={14} /> },
              ].map(({ label, rate, total, icon }, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < 3 ? `1px solid ${B}` : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: S, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#9898A6' }}>{rate}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{total !== null ? `${total.toFixed(4)} USDC` : '—'}</div>
                    <div style={{ fontSize: 11, color: '#9898A6' }}>collected</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total banner */}
            <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={18} color="#ffffff" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Total revenue</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
                {totalFeeRevenue.toFixed(4)} USDC
              </span>
            </div>

            {/* Fee event log */}
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Fee log</div>
            {feeRevenue.length === 0 ? (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center', color: '#A0A0A0', fontSize: 13 }}>
                No fees collected yet. They appear here after marketplace sales, swaps, and bridges.
              </div>
            ) : (
              <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden' }}>
                {feeRevenue.slice(0, 50).map((f, i) => (
                  <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 90px', gap: 8, padding: '11px 16px', borderBottom: i < feeRevenue.length - 1 ? `1px solid ${B}` : 'none', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: '#1a1a1a', color: '#ffffff', padding: '2px 7px', borderRadius: 20, textAlign: 'center', textTransform: 'capitalize' }}>
                      {f.source}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.description}</div>
                      <div style={{ fontSize: 11, color: '#9898A6' }}>
                        {new Date(f.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>+{f.feeAmount.toFixed(4)}</div>
                      <div style={{ fontSize: 11, color: '#9898A6' }}>USDC</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Users</div>
            <div style={{ background: '#0d0d0d', border: `1px solid ${B}`, borderRadius: 14, padding: '48px 20px', textAlign: 'center' }}>
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
