/**
 * TradePage — unified Swap + Bridge card (compact premium redesign).
 *
 * Key changes vs. previous version:
 * - Page heading collapsed into card header (single compact row)
 * - Card top padding trimmed, bottom breathing room kept
 * - RecentActivity rows tighter with a real empty state
 * - Tab icons replaced with cleaner ArrowUpDown / ArrowRightLeft
 */
import { Suspense, lazy, useState } from 'react'
import { History, Settings2, ArrowRightLeft, ArrowUpDown } from 'lucide-react'
import { useAccount } from 'wagmi'
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
      padding: '36px 0', color: 'var(--nan-text2)', fontSize: 13,
    }}>
      <span className="nan-spinner" style={{ marginRight: 8 }} />Loading…
    </div>
  )
}

/** Card header — tab switcher + subtitle + icon actions all on one compact row */
function TradeHeader({ tab, setTab, c, bridgeAvailable }: {
  tab: Tab
  setTab: (t: Tab) => void
  c: ReturnType<typeof useNanTheme>
  bridgeAvailable: boolean
}) {
  const setActiveView = useAppStore(s => s.setActiveView)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px 10px',
      borderBottom: `1px solid ${c.bdr}`,
    }}>
      {/* Left: title + tab pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Compact title text — changes with tab */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {tab === 'swap' ? 'Swap' : 'Bridge'}
          </div>
          <div style={{ fontSize: 10, color: c.t3, marginTop: 2, lineHeight: 1 }}>
            {tab === 'swap'
              ? 'Exchange tokens on Arc'
              : 'Move USDC across chains'}
          </div>
        </div>

        {/* Tab pills */}
        <div style={{
          display: 'flex', gap: 2,
          background: c.surf2,
          borderRadius: 9,
          padding: '2px 3px',
          border: `1px solid ${c.bdr}`,
          marginLeft: 4,
        }}>
          {(['swap', 'bridge'] as Tab[]).filter(t => t !== 'bridge' || bridgeAvailable).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '5px 12px',
                borderRadius: 7,
                border: 'none',
                background: tab === t ? c.surf : 'transparent',
                color: tab === t ? c.text : c.t2,
                fontSize: 12,
                fontWeight: tab === t ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'var(--nan-font)',
                transition: 'all 0.15s',
                letterSpacing: '-0.01em',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                WebkitTapHighlightColor: 'transparent',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {t === 'swap'
                ? <><ArrowUpDown size={11} strokeWidth={2.5} />Swap</>
                : <><ArrowRightLeft size={11} strokeWidth={2.5} />Bridge</>}
            </button>
          ))}
        </div>
      </div>

      {/* Right: icon actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button
          onClick={() => setActiveView('activity')}
          title="History"
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <History size={13} strokeWidth={2} />
        </button>
        <button
          onClick={() => setActiveView('settings')}
          title="Settings"
          style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <Settings2 size={13} strokeWidth={2} />
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

  const statusColor = (s: string) =>
    s === 'confirmed' ? c.green : s === 'failed' ? c.red : c.gold

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
          Recent
        </span>
        <button
          onClick={() => setActiveView('activity')}
          style={{ fontSize: 11, color: c.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--nan-font)', fontWeight: 600, padding: 0 }}
        >
          View all →
        </button>
      </div>

      {recent.length === 0 ? (
        <div style={{
          padding: '14px 0',
          textAlign: 'center' as const,
          fontSize: 12,
          color: c.t3,
        }}>
          No swap or bridge activity yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
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
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: a.type === 'swap' ? `rgba(8,102,245,0.10)` : `rgba(16,185,129,0.10)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {a.type === 'swap'
                    ? <ArrowUpDown size={11} color={c.blue} strokeWidth={2.5} />
                    : <ArrowRightLeft size={11} color={c.green} strokeWidth={2.5} />}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.text, lineHeight: 1.2 }}>
                    {a.description ?? (a.type === 'swap' ? 'Swap' : 'Bridge')}
                  </div>
                  <div style={{ fontSize: 10, color: c.t3, marginTop: 1 }}>
                    {a.timestamp instanceof Date
                      ? a.timestamp.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.text }}>
                  {a.sign === '-' ? '-' : '+'}{a.amount?.toFixed(2) ?? '—'}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600, marginTop: 1,
                  textTransform: 'capitalize' as const,
                  color: statusColor(a.status ?? ''),
                }}>
                  {a.status ?? 'pending'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TradePageProps {
  /** Optional initial tab — 'swap' (default) or 'bridge' */
  initialTab?: Tab
}

export function TradePage({ initialTab = 'swap' }: TradePageProps) {
  const c = useNanTheme()
  const { address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const isPasskeyUser = !wagmiAddress && !!auth?.isPasskeyUser
  const isCircleUser  = !wagmiAddress && !!auth?.circleWalletAddress && !isPasskeyUser
  // Email/passkey users can only swap — bridge requires a browser wallet
  const bridgeAvailable = !isCircleUser && !isPasskeyUser
  const [tab, setTab] = useState<Tab>(initialTab === 'bridge' && !bridgeAvailable ? 'swap' : initialTab)

  return (
    <div style={{
      maxWidth: 620,
      margin: '0 auto',
      padding: '8px 0 40px',
      fontFamily: 'var(--nan-font)',
    }}>
      {/* Unified card — header + content in one surface */}
      <div style={{
        background: c.surf,
        border: `1px solid ${c.bdr2}`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: c.isDark
          ? '0 8px 40px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.03) inset'
          : '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <TradeHeader tab={tab} setTab={setTab} c={c} bridgeAvailable={bridgeAvailable} />
        <ErrorBoundary key={tab}>
          <Suspense fallback={<PageLoading />}>
            {tab === 'swap' ? <SwapInCard /> : <BridgeInCard />}
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Recent activity — compact strip below card */}
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
