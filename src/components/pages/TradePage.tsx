/**
 * TradePage — unified Swap + Bridge card.
 *
 * Renders a centred, dark glass card with a "Swap | Bridge" pill tab at the
 * top. Both sub-pages render inside the same card so the chrome stays fixed
 * and only the content changes. On desktop the card expands to 620 px for
 * a more comfortable layout.
 */
import { Suspense, lazy, useState } from 'react'
import { History, Settings2, ArrowRightLeft, ArrowUpDown } from 'lucide-react'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAppStore } from '../../store/appStore'
import { ErrorBoundary } from '../ErrorBoundary'

// Lazy-load the heavy sub-pages so the card mounts instantly.
const SwapContent = lazy(() =>
  import('./SwapPage').then(m => ({ default: m.SwapPage }))
)
const BridgeContent = lazy(() =>
  import('./BridgePage').then(m => ({ default: m.BridgePage }))
)

type Tab = 'swap' | 'bridge'

function PageLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 0', color: 'var(--nan-text2)', fontSize: 13,
    }}>
      <span className="nan-spinner" style={{ marginRight: 8 }} />Loading…
    </div>
  )
}

/** The header that lives INSIDE the card — tabs + icon buttons */
function TradeHeader({ tab, setTab, c }: {
  tab: Tab
  setTab: (t: Tab) => void
  c: ReturnType<typeof useNanTheme>
}) {
  const setActiveView = useAppStore(s => s.setActiveView)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px 12px',
      borderBottom: `1px solid ${c.bdr}`,
    }}>
      {/* Tab pills */}
      <div style={{
        display: 'flex', gap: 2,
        background: c.surf2,
        borderRadius: 10,
        padding: 3,
        border: `1px solid ${c.bdr}`,
      }}>
        {(['swap', 'bridge'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 18px',
              borderRadius: 8,
              border: 'none',
              background: tab === t ? c.surf : 'transparent',
              color: tab === t ? c.text : c.t2,
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'var(--nan-font)',
              transition: 'all 0.15s',
              letterSpacing: '-0.01em',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {t === 'swap'
              ? <><ArrowUpDown size={12} strokeWidth={2.5} />{' '}Swap</>
              : <><ArrowRightLeft size={12} strokeWidth={2.5} />{' '}Bridge</>}
          </button>
        ))}
      </div>

      {/* Action icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setActiveView('activity')}
          title="History"
          style={{
            width: 34, height: 34, borderRadius: 9,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <History size={14} strokeWidth={2} />
        </button>
        <button
          onClick={() => setActiveView('settings')}
          title="Settings"
          style={{
            width: 34, height: 34, borderRadius: 9,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <Settings2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

/** Compact recent-activity strip — last 4 swap/bridge entries */
function RecentActivity({ c }: { c: ReturnType<typeof useNanTheme> }) {
  const activity = useAppStore(s => s.activity)
  const setActiveView = useAppStore(s => s.setActiveView)

  const recent = activity
    .filter(a => a.type === 'swap' || a.type === 'bridge')
    .slice(0, 4)

  if (recent.length === 0) return null

  const statusColor = (s: string) =>
    s === 'confirmed' ? '#10B981' : s === 'failed' ? '#EF4444' : '#F59E0B'

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.t3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent</span>
        <button
          onClick={() => setActiveView('activity')}
          style={{ fontSize: 11, color: c.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--nan-font)', fontWeight: 600, padding: 0 }}
        >
          View all →
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {recent.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px',
            background: c.surf,
            border: `1px solid ${c.bdr}`,
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: a.type === 'swap' ? 'rgba(8,102,245,0.10)' : 'rgba(16,185,129,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {a.type === 'swap'
                  ? <ArrowUpDown size={12} color={c.blue} strokeWidth={2.5} />
                  : <ArrowRightLeft size={12} color="#10B981" strokeWidth={2.5} />}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.text, lineHeight: 1.2 }}>
                  {a.description ?? (a.type === 'swap' ? 'Swap' : 'Bridge')}
                </div>
                <div style={{ fontSize: 10, color: c.t3, marginTop: 1 }}>
                  {a.timestamp instanceof Date ? a.timestamp.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.text }}>
                {a.sign === '-' ? '-' : '+'}{a.amount?.toFixed(2) ?? '—'}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: statusColor(a.status ?? ''), marginTop: 1, textTransform: 'capitalize' }}>
                {a.status ?? 'pending'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface TradePageProps {
  /** Optional initial tab — 'swap' (default) or 'bridge' */
  initialTab?: Tab
}

export function TradePage({ initialTab = 'swap' }: TradePageProps) {
  const c = useNanTheme()
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div style={{
      maxWidth: 620,
      margin: '0 auto',
      padding: '12px 0 48px',
      fontFamily: 'var(--nan-font)',
    }}>
      {/* Page heading */}
      <div style={{ marginBottom: 14, paddingLeft: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
          {tab === 'swap' ? 'Swap' : 'Bridge'}
        </h1>
        <p style={{ fontSize: 11, color: c.t3, margin: '3px 0 0' }}>
          {tab === 'swap'
            ? 'Exchange your tokens across supported networks.'
            : 'Move USDC across chains with Circle CCTP.'}
        </p>
      </div>

      {/* Unified card */}
      <div style={{
        background: c.surf,
        border: `1px solid ${c.bdr2}`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: c.isDark
          ? '0 8px 40px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.03) inset'
          : '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <TradeHeader tab={tab} setTab={setTab} c={c} />
        <ErrorBoundary key={tab}>
          <Suspense fallback={<PageLoading />}>
            {tab === 'swap' ? <SwapInCard /> : <BridgeInCard />}
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Recent activity */}
      <RecentActivity c={c} />
    </div>
  )
}

function SwapInCard() {
  return <SwapContent inCard />
}

function BridgeInCard() {
  return <BridgeContent inCard />
}
