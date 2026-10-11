/**
 * TradePage — unified Swap + Bridge card, Tower Exchange-style.
 *
 * Renders a centered, dark glass card with a "Swap | Bridge" pill tab
 * at the top. Both sub-pages render inside the same card so the chrome
 * stays fixed and only the content swaps.
 */
import { Suspense, lazy, useState } from 'react'
import { History, Settings2 } from 'lucide-react'
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '56px 0', color: 'var(--nan-text2)', fontSize: 14 }}>
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
      padding: '18px 20px 0',
      borderBottom: `1px solid ${c.bdr}`,
      paddingBottom: 14,
      marginBottom: 0,
    }}>
      {/* Tab pills */}
      <div style={{
        display: 'flex', gap: 2,
        background: c.surf2,
        borderRadius: 12,
        padding: 3,
        border: `1px solid ${c.bdr}`,
      }}>
        {(['swap', 'bridge'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 20px',
              borderRadius: 10,
              border: 'none',
              background: tab === t ? c.surf : 'transparent',
              color: tab === t ? c.text : c.t2,
              fontSize: 14,
              fontWeight: tab === t ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'var(--nan-font)',
              transition: 'all 0.15s',
              letterSpacing: '-0.01em',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {t === 'swap' ? 'Swap' : 'Bridge'}
          </button>
        ))}
      </div>

      {/* Action icons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setActiveView('activity')}
          title="History"
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <History size={15} strokeWidth={2} />
        </button>
        <button
          onClick={() => setActiveView('settings')}
          title="Settings"
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: `1px solid ${c.bdr}`,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: c.t2,
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}
        >
          <Settings2 size={15} strokeWidth={2} />
        </button>
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
      maxWidth: 480,
      margin: '0 auto',
      padding: '16px 0 100px',
      fontFamily: 'var(--nan-font)',
    }}>
      {/* Unified card */}
      <div style={{
        background: c.surf,
        border: `1px solid ${c.bdr2}`,
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: c.isDark
          ? '0 8px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset'
          : '0 4px 24px rgba(0,0,0,0.10)',
      }}>
        <TradeHeader tab={tab} setTab={setTab} c={c} />

        {/* Sub-page — strip the outer padding/header since it's inside the card now */}
        <div style={{ padding: '0' }}>
          <ErrorBoundary key={tab}>
            <Suspense fallback={<PageLoading />}>
              {tab === 'swap'
                ? <SwapInCard />
                : <BridgeInCard />}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}

/**
 * Thin wrappers that inject the card's padding and strip the
 * sub-page's own header (the sub-pages render their own title + slippage
 * button in a `padding: '20px 0 18px'` block — we replace that with
 * a tighter in-card variant by overriding the container padding via CSS).
 */
function SwapInCard() {
  return (
    <div style={{ paddingTop: 4 }}>
      <SwapPageInCard />
    </div>
  )
}

function BridgeInCard() {
  return (
    <div style={{ paddingTop: 4 }}>
      <BridgePageInCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline stripped variants
// Instead of forking the pages, we simply render them and rely on the card's
// clip via overflow:hidden — but we also need to remove the card's own
// page-level header row. We do this by rendering the original component
// inside a CSS-scoped wrapper that hides its first child (the header row).
// ---------------------------------------------------------------------------

function SwapPageInCard() {
  return (
    <div className="trade-page-inner trade-page-inner--swap">
      <SwapContent />
    </div>
  )
}

function BridgePageInCard() {
  return (
    <div className="trade-page-inner trade-page-inner--bridge">
      <BridgeContent />
    </div>
  )
}
