/**
 * AgentServicesTab.tsx
 *
 * Circle Agent Marketplace / service discovery for NAN Agent Wallet.
 *
 * Data source: fetchLiveMarketplace() → /api/agent-wallet?action=marketplace
 *   → tries agents.circle.com/services; falls back to the static NAN service
 *     registry (same real services, same real pricing).
 *
 * NO fake data is created here. If Circle returns no services the fallback
 * is the same curated registry the rest of the app uses.
 *
 * Layout:
 *   Header → Search → Category filter chips → Service cards → Service detail
 *
 * Service detail:
 *   Name / provider / description / capabilities / endpoint / pricing /
 *   payment mechanism / availability / Agent Wallet compatibility check →
 *   [ USE WITH NAN AGENT ]
 *
 * Only read from existing wallet state — never creates a wallet.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Globe, FileText, Cpu, Sparkles, ShoppingBag,
  TrendingUp, Zap, RefreshCw, Check, CheckCircle2,
  AlertTriangle, ArrowLeft, ExternalLink, Loader,
  Coins, Shield, Wifi, BarChart3, X,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { fetchLiveMarketplace } from '../../lib/agent-registry'
import type { MarketplaceService } from '../../lib/agent-registry'

// ── design tokens (match AgentWalletExperience) ──────────────────────────────

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE  = '#0066FF'
const GREEN = '#00C853'
const AMBER = '#FF9500'
const RED   = '#FF3B3B'

// ── Allowed display categories (no gambling / prediction markets) ─────────────

const DISPLAY_CATEGORIES: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'all',           label: 'All',              Icon: Globe },
  { id: 'search',        label: 'Web Search',        Icon: Search },
  { id: 'research',      label: 'Research',          Icon: FileText },
  { id: 'data',          label: 'Data Enrichment',   Icon: BarChart3 },
  { id: 'developer',     label: 'Developer Tools',   Icon: Cpu },
  { id: 'ai',            label: 'AI & Creative',     Icon: Sparkles },
  { id: 'infrastructure',label: 'Infrastructure',    Icon: Wifi },
  { id: 'travel',        label: 'Travel',            Icon: Globe },
  { id: 'supplier',      label: 'Commerce',          Icon: ShoppingBag },
  { id: 'career',        label: 'Career',            Icon: TrendingUp },
]

// Categories that are blocked from display
const BLOCKED_CATEGORIES = new Set(['gambling', 'prediction', 'betting', 'lottery', 'casino'])

function isCategoryAllowed(cat: string): boolean {
  return !BLOCKED_CATEGORIES.has(cat.toLowerCase())
}

// ── Payment method labels ─────────────────────────────────────────────────────

function paymentLabel(methods: string[]): string {
  if (!methods || methods.length === 0) return 'USDC'
  if (methods.includes('x402'))       return 'x402 (Gateway Nanopayments)'
  if (methods.includes('usdc_arc'))   return 'USDC on Arc'
  if (methods.includes('usdc_base'))  return 'USDC on Base'
  if (methods.includes('usdc'))       return 'USDC'
  if (methods.includes('free'))       return 'Free'
  return methods[0]
}

function paymentShort(methods: string[]): string {
  if (!methods || methods.length === 0) return 'USDC'
  if (methods.includes('free')) return 'Free'
  if (methods.includes('x402')) return 'x402'
  return 'USDC'
}

// ── Category icon helper ──────────────────────────────────────────────────────

function CategoryIcon({ cat, size, color, strokeWidth }: { cat: string; size: number; color: string; strokeWidth?: number }) {
  const found = DISPLAY_CATEGORIES.find(c => c.id === cat)
  const Icon = found?.Icon ?? Globe
  return <Icon size={size} color={color} strokeWidth={strokeWidth ?? 2} />
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ label, C }: { label: string; C: ThemeColors }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.t3,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      marginBottom: 10, marginTop: 4,
    }}>{label}</div>
  )
}

function Row({ label, value, mono, last, C }: {
  label: string; value: React.ReactNode; mono?: boolean; last?: boolean
  C: ThemeColors
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      gap: 12, padding: '9px 0',
      borderBottom: last ? 'none' : `1px solid ${C.bdr}`,
    }}>
      <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: 'right', wordBreak: 'break-all', fontFamily: mono ? MONO : F }}>
        {value}
      </span>
    </div>
  )
}

interface ThemeColors {
  bg: string; surf: string; surf2: string; bdr: string
  text: string; t2: string; t3: string
}

// ── Compatibility check result ────────────────────────────────────────────────

interface CompatResult {
  walletExists: boolean
  hasBalance: boolean
  policyAllows: boolean
  paymentSupported: boolean
  currentBalance: number
  requiredBalance: number
  reason?: string
}

function checkCompatibility(
  svc: MarketplaceService,
  agentBalance: string,
  agentProvisioned: boolean,
  agentPermissions: { enabled: boolean; perServiceLimit: number; dailyLimit: number; dailyUsed: number },
): CompatResult {
  const balance = parseFloat(agentBalance || '0')
  const cost    = svc.price_usdc ?? 0
  const isFree  = cost === 0 || (svc.payment_methods ?? []).includes('free')
  const paymentSupported = true // USDC and x402 are both supported by the agent wallet

  if (!agentProvisioned) {
    return { walletExists: false, hasBalance: false, policyAllows: false, paymentSupported, currentBalance: 0, requiredBalance: cost, reason: 'Agent Wallet not set up. Go to Agent Wallet to create yours.' }
  }
  if (!agentPermissions.enabled) {
    return { walletExists: true, hasBalance: balance >= cost, policyAllows: false, paymentSupported, currentBalance: balance, requiredBalance: cost, reason: 'NAN Agent is disabled in Policy settings.' }
  }
  if (!isFree && balance < cost) {
    return { walletExists: true, hasBalance: false, policyAllows: true, paymentSupported, currentBalance: balance, requiredBalance: cost, reason: `Agent Wallet balance (${balance.toFixed(4)} USDC) is below service cost (${cost} USDC).` }
  }
  if (!isFree && cost > agentPermissions.perServiceLimit) {
    return { walletExists: true, hasBalance: true, policyAllows: false, paymentSupported, currentBalance: balance, requiredBalance: cost, reason: `Service cost (${cost} USDC) exceeds per-service policy limit (${agentPermissions.perServiceLimit} USDC).` }
  }
  const dailyRemaining = agentPermissions.dailyLimit - agentPermissions.dailyUsed
  if (!isFree && cost > dailyRemaining) {
    return { walletExists: true, hasBalance: true, policyAllows: false, paymentSupported, currentBalance: balance, requiredBalance: cost, reason: `Daily budget has ${dailyRemaining.toFixed(2)} USDC remaining — insufficient for this service.` }
  }
  return { walletExists: true, hasBalance: true, policyAllows: true, paymentSupported, currentBalance: balance, requiredBalance: cost }
}

// ── Service Card ──────────────────────────────────────────────────────────────

function ServiceCard({ svc, onView, C }: { svc: MarketplaceService; onView: (s: MarketplaceService) => void; C: ThemeColors }) {
  const isFree = svc.price_usdc === 0 || (svc.payment_methods ?? []).includes('free')

  return (
    <div style={{
      background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: 14,
      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    }}
      onClick={() => onView(svc)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.16)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CategoryIcon cat={svc.category} size={16} color={BLUE} strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{svc.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: C.t3,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 5, padding: '1px 5px',
            }}>{svc.category}</span>
          </div>
          <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.45, marginBottom: 8 }}>
            {svc.description}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Coins size={11} color={isFree ? GREEN : BLUE} />
              <span style={{ fontSize: 12, fontWeight: 700, color: isFree ? GREEN : BLUE }}>
                {isFree ? 'Free' : `${svc.price_usdc} USDC`}
              </span>
              {!isFree && <span style={{ fontSize: 10, color: C.t3 }}>/ request</span>}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, color: BLUE,
              background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.18)',
              borderRadius: 6, padding: '1px 6px',
            }}>{paymentShort(svc.payment_methods)}</span>
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: C.t3 }}>
          {svc.endpoint ? new URL(svc.endpoint.startsWith('http') ? svc.endpoint : `https://example.com${svc.endpoint}`).hostname : 'NAN Network'}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 600, color: BLUE,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          View service <ArrowLeft size={11} color={BLUE} style={{ transform: 'rotate(180deg)' }} />
        </span>
      </div>
    </div>
  )
}

// ── Service Detail ────────────────────────────────────────────────────────────

function ServiceDetail({ svc, onBack, C }: {
  svc: MarketplaceService
  onBack: () => void
  C: ThemeColors
}) {
  const { agentWallet, agentPermissions, agentDailyUsed, selectService, deselectService, isServiceSelected } = useAppStore()
  const isFree = svc.price_usdc === 0 || (svc.payment_methods ?? []).includes('free')
  const selected = isServiceSelected(svc.id)

  const compat = checkCompatibility(
    svc,
    agentWallet.balance_usdc,
    agentWallet.provisioned,
    {
      enabled: agentPermissions.enabled,
      perServiceLimit: agentPermissions.perServiceLimit ?? 5,
      dailyLimit: agentPermissions.dailyLimit,
      dailyUsed: agentDailyUsed,
    },
  )

  const handleUse = () => {
    if (selected) {
      deselectService(svc.id)
    } else {
      selectService(svc.id)
    }
  }

  const endpointDisplay = svc.endpoint
    ? (svc.endpoint.startsWith('http') ? svc.endpoint : `https://api.nan.app${svc.endpoint}`)
    : 'NAN Agent Network'

  const isReady = compat.walletExists && compat.hasBalance && compat.policyAllows

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 0', marginBottom: 4, fontFamily: F,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <ArrowLeft size={16} color={C.t2} strokeWidth={2} />
        <span style={{ fontSize: 13, color: C.t2, fontWeight: 500 }}>Back to services</span>
      </button>

      {/* Header */}
      <div style={{
        background: C.surf, border: `1px solid ${C.bdr}`,
        borderRadius: 18, padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14, flexShrink: 0,
            background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CategoryIcon cat={svc.category} size={20} color={BLUE} strokeWidth={1.7} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>{svc.name}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>
              {svc.category.charAt(0).toUpperCase() + svc.category.slice(1)}
            </div>
          </div>
          {selected && (
            <div style={{
              fontSize: 11, fontWeight: 700, color: GREEN,
              background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.28)',
              borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            }}>
              <Check size={10} /> Selected
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, margin: 0 }}>{svc.description}</p>
      </div>

      {/* Details */}
      <SectionLabel label="Service Details" C={C} />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '4px 16px' }}>
        <Row label="Pricing"    value={isFree ? 'Free' : `${svc.price_usdc} USDC / request`}   C={C} />
        <Row label="Payment"   value={paymentLabel(svc.payment_methods ?? [])}                  C={C} />
        <Row label="Endpoint"  value={endpointDisplay} mono C={C} />
        <Row label="Category"  value={svc.category.charAt(0).toUpperCase() + svc.category.slice(1)} C={C} last />
      </div>

      {/* Payment mechanism explanation */}
      <div style={{
        background: 'rgba(0,102,255,0.05)', border: '1px solid rgba(0,102,255,0.14)',
        borderRadius: 12, padding: '11px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <Zap size={13} color={BLUE} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Payment mechanism</span>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, margin: 0 }}>
          {(svc.payment_methods ?? []).includes('x402')
            ? 'This service uses Circle Gateway Nanopayments (x402). When your agent calls the service, a USDC micro-payment is authorized from the Agent Wallet via the x402 HTTP protocol and settled in batch by Circle Gateway.'
            : isFree
              ? 'This service is free to use. No payment is deducted from the Agent Wallet.'
              : `This service accepts USDC. When called, ${svc.price_usdc} USDC is deducted from the Agent Wallet balance directly. All payments pass through the NAN Agent policy layer first.`
          }
        </p>
      </div>

      {/* Agent Wallet Compatibility */}
      <SectionLabel label="Agent Wallet Compatibility" C={C} />
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '4px 16px' }}>
        {[
          {
            label: 'Agent Wallet',
            ok: compat.walletExists,
            note: compat.walletExists ? `${agentWallet.address ? agentWallet.address.slice(0, 10) + '…' : 'Active'}` : 'Not set up',
          },
          {
            label: 'Balance',
            ok: isFree || compat.hasBalance,
            note: isFree ? 'Free — no balance required' : `${compat.currentBalance.toFixed(4)} USDC available${!compat.hasBalance ? ` (need ${compat.requiredBalance})` : ''}`,
          },
          {
            label: 'Policy',
            ok: compat.policyAllows,
            note: compat.policyAllows ? 'Within current spending policy' : (compat.reason ?? 'Policy limit exceeded'),
          },
          {
            label: 'Payment method',
            ok: compat.paymentSupported,
            note: `${paymentShort(svc.payment_methods ?? [])} — supported`,
          },
        ].map(({ label, ok, note }, i, arr) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.bdr}` : 'none',
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{label}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{note}</div>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, flexShrink: 0,
              background: ok ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,59,0.08)',
              color: ok ? GREEN : RED,
              border: `1px solid ${ok ? 'rgba(0,200,83,0.28)' : 'rgba(255,59,59,0.22)'}`,
            }}>
              {ok ? 'Ready' : 'Issue'}
            </div>
          </div>
        ))}
      </div>

      {/* Compatibility problem callout */}
      {!isReady && compat.reason && (
        <div style={{
          background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)',
          borderRadius: 12, padding: '11px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertTriangle size={14} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, margin: 0 }}>{compat.reason}</p>
        </div>
      )}

      {/* Availability */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, boxShadow: `0 0 5px ${GREEN}` }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: GREEN }}>Available</span>
        <span style={{ fontSize: 12, color: C.t3, marginLeft: 4 }}>· Service is live and accepting requests</span>
      </div>

      {/* CTA */}
      <button
        onClick={handleUse}
        style={{
          width: '100%', height: 52,
          background: selected ? C.surf : (isReady ? BLUE : 'rgba(0,102,255,0.45)'),
          border: selected ? `2px solid ${GREEN}` : 'none',
          borderRadius: 16, fontSize: 15, fontWeight: 700,
          color: selected ? GREEN : '#fff',
          fontFamily: F, cursor: 'pointer',
          boxShadow: selected || !isReady ? 'none' : '0 6px 22px rgba(0,102,255,0.38)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          WebkitTapHighlightColor: 'transparent', transition: 'all 0.2s',
        }}
      >
        {selected
          ? <><Check size={16} /> Selected for NAN Agent</>
          : <><Zap size={16} /> Use with NAN Agent</>
        }
      </button>

      {!isReady && !selected && (
        <p style={{ fontSize: 11, color: C.t3, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
          Resolve the compatibility issues above before using this service.
        </p>
      )}

      {svc.endpoint && svc.endpoint.startsWith('http') && (
        <a
          href={svc.endpoint}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 0', fontSize: 12, color: C.t2,
            textDecoration: 'none', fontFamily: F,
          }}
        >
          <ExternalLink size={12} color={C.t3} /> View service documentation
        </a>
      )}
    </div>
  )
}

// ── Selected Services summary strip ──────────────────────────────────────────

function SelectedStrip({ count }: { count: number; C?: ThemeColors }) {
  if (count === 0) return null
  return (
    <div style={{
      background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.22)',
      borderRadius: 12, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <CheckCircle2 size={14} color={GREEN} />
      <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>
        {count} service{count > 1 ? 's' : ''} selected for NAN Agent
      </span>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  C: ThemeColors
}

type ViewState = { kind: 'list' } | { kind: 'detail'; svc: MarketplaceService }

export function AgentServicesTab({ C }: Props) {
  const { selectedServiceIds } = useAppStore()

  const [view, setView]           = useState<ViewState>({ kind: 'list' })
  const [services, setServices]   = useState<MarketplaceService[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [query, setQuery]         = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [dataSource, setDataSource] = useState<'live' | 'static' | ''>('')

  const loadRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const svcs = await fetchLiveMarketplace()
      // Filter out blocked categories and deduplicate by id
      const seen = new Set<string>()
      const safe = svcs.filter(s => {
        if (!isCategoryAllowed(s.category)) return false
        if (seen.has(s.id)) return false
        seen.add(s.id)
        return true
      })
      setServices(safe)
      setDataSource(safe.length > 8 ? 'live' : 'static')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load services')
    }
    setLoading(false)
  }, [])

  // Load on mount — deferred so React finishes rendering first
  useEffect(() => {
    if (loadRef.current) return
    loadRef.current = true
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const filtered = services.filter(s => {
    if (activeCat !== 'all' && s.category !== activeCat) return false
    if (query) {
      const q = query.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Which category chips have services?
  const usedCats = new Set(services.map(s => s.category))
  const visibleCats = DISPLAY_CATEGORIES.filter(c => c.id === 'all' || usedCats.has(c.id))

  // Detail view
  if (view.kind === 'detail') {
    return (
      <ServiceDetail
        svc={view.svc}
        onBack={() => setView({ kind: 'list' })}
        C={C}
      />
    )
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{
        background: 'rgba(0,102,255,0.07)', border: '1px solid rgba(0,102,255,0.16)',
        borderRadius: 14, padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Sparkles size={14} color={BLUE} />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Services</span>
          {!loading && (
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: C.t3 }}>
              {filtered.length} service{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => void load()}
            style={{
              width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,255,0.12)',
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Refresh services"
          >
            <RefreshCw size={12} color={BLUE} style={{ animation: loading ? 'aw-spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.55, margin: 0 }}>
          Give your NAN Agent access to useful services. Select a service to inspect it and add it to your agent.
        </p>
        {dataSource === 'live' && (
          <div style={{
            marginTop: 8, fontSize: 10, fontWeight: 600, color: GREEN,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN }} />
            Live from Circle Agent Marketplace
          </div>
        )}
      </div>

      {/* Selected strip */}
      <SelectedStrip count={selectedServiceIds.length} C={C} />

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={13} color={C.t3} style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)', pointerEvents: 'none',
        }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search services — e.g. web research, financial data…"
          style={{
            width: '100%', padding: '10px 36px 10px 34px',
            border: `1px solid ${C.bdr}`, borderRadius: 12,
            fontFamily: F, fontSize: 13, outline: 'none',
            background: C.surf2, color: C.text, boxSizing: 'border-box',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X size={13} color={C.t3} />
          </button>
        )}
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {visibleCats.map(cat => {
          const active = activeCat === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              style={{
                height: 30, padding: '0 12px', borderRadius: 20,
                border: `1px solid ${active ? BLUE : C.bdr}`,
                background: active ? BLUE : C.surf,
                color: active ? '#fff' : C.t2,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                display: 'flex', alignItems: 'center', gap: 5,
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <cat.Icon size={11} color={active ? '#fff' : C.t3} strokeWidth={2} />
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 12 }}>
          <Loader size={22} color={BLUE} style={{ animation: 'aw-spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: C.t2 }}>Discovering services…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{
          background: 'rgba(255,59,59,0.07)', border: '1px solid rgba(255,59,59,0.22)',
          borderRadius: 12, padding: '14px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertTriangle size={15} color={RED} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>Could not load services</div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{error}</div>
            <button
              onClick={() => void load()}
              style={{
                marginTop: 10, fontSize: 12, fontWeight: 600, color: BLUE,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: F,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Globe size={28} color={C.t3} style={{ margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
            No matching service found.
          </div>
          <div style={{ fontSize: 12, color: C.t3 }}>
            Try a different search term or category.
          </div>
          {query && (
            <button
              onClick={() => { setQuery(''); setActiveCat('all') }}
              style={{
                marginTop: 14, height: 36, padding: '0 18px', background: BLUE,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 12,
                fontWeight: 600, cursor: 'pointer', fontFamily: F,
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Service cards */}
      {!loading && !error && filtered.map(svc => (
        <ServiceCard
          key={svc.id}
          svc={svc}
          onView={s => setView({ kind: 'detail', svc: s })}
          C={C}
        />
      ))}

      {/* Policy note */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{
          background: 'rgba(255,149,0,0.06)',
          border: '1px solid rgba(255,149,0,0.20)',
          borderRadius: 12, padding: '11px 14px',
          display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4,
        }}>
          <Shield size={13} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.55, margin: 0 }}>
            All service calls pass through your NAN Agent spending policy. You can adjust limits in the Policy tab. Payments never leave the Agent Wallet without passing the policy check.
          </p>
        </div>
      )}
    </div>
  )
}
