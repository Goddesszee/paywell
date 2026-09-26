import React, { useState } from 'react'
import { Home, Wallet, ShoppingBag, Activity, Menu, X, ArrowLeftRight, ArrowUpDown, Zap, Settings, ChevronRight, CreditCard, BarChart3 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'


const FONT = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.07)'
const TEXT_2 = '#5C5C6B'
const TEXT_3 = '#9898A6'

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'wallet',   label: 'Wallet',   Icon: Wallet },
  { id: 'shop',     label: 'Shop',     Icon: ShoppingBag },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

const DRAWER_ITEMS = [
  { id: 'onramp',   label: 'Buy USDC',  Icon: CreditCard,     desc: 'Card, Apple Pay, bank transfer' },
  { id: 'swap',     label: 'Swap',      Icon: ArrowUpDown,    desc: 'Exchange tokens via Circle' },
  { id: 'bridge',   label: 'Bridge',    Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
  { id: 'agent',    label: 'AI Agent',  Icon: Zap,            desc: 'Shop with your AI agent' },
  { id: 'settings', label: 'Settings',  Icon: Settings,       desc: 'Wallet & preferences' },
  { id: 'admin',    label: 'Admin',     Icon: BarChart3,      desc: 'Dashboard & Circle infra status' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeView, setActiveView } = useAppStore()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const navActive = (id: string) =>
    activeView === id ||
    (id === 'wallet' && ['send', 'receive', 'send_confirm', 'send_success'].includes(activeView))

  const go = (id: string) => {
    setActiveView(id)
    setDrawerOpen(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#FFF', fontFamily: FONT }}>

      {/* ── Top bar ── */}
      <header style={{
        height: 52, flexShrink: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{fontWeight:700,fontSize:18,letterSpacing:"-0.02em",color:"#0D0D0D",fontFamily:"Inter,sans-serif"}}>Paywell</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="net-pill">Arc Testnet</div>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Menu"
            style={{
              width: 36, height: 36, borderRadius: 9,
              background: drawerOpen ? BLACK : SURFACE,
              border: `1px solid ${drawerOpen ? BLACK : 'rgba(0,0,0,0.09)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {drawerOpen
              ? <X size={16} color="#FFF" />
              : <Menu size={16} color={TEXT_2} />}
          </button>
        </div>
      </header>

      {/* ── Side drawer overlay ── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 55,
            background: 'rgba(0,0,0,0.25)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Side drawer panel ── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 280, zIndex: 70,
        background: '#FFF',
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'max(52px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>More features</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {DRAWER_ITEMS.map(({ id, label, Icon, desc }) => {
            const isActive = activeView === id
            return (
              <button
                key={id}
                onClick={() => go(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 12px', borderRadius: 12, border: 'none',
                  background: isActive ? BLACK : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: FONT, marginBottom: 2,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isActive ? 'rgba(255,255,255,0.15)' : SURFACE,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} color={isActive ? '#FFF' : BLACK} />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? '#FFF' : BLACK, lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: 12, color: isActive ? 'rgba(255,255,255,0.6)' : TEXT_2, marginTop: 1 }}>{desc}</div>
                </div>
                <ChevronRight size={14} color={isActive ? 'rgba(255,255,255,0.5)' : TEXT_3} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{
        flex: 1,
        overflowY: 'auto', overflowX: 'hidden',
        padding: '12px 16px 88px',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        animation: 'pw-up 0.22s ease both',
      }}>
        {children}
      </main>

      {/* ── Bottom nav (4 items) ── */}
      <nav style={{
        flexShrink: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: `1px solid ${BORDER}`,
        paddingTop: 4,
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(4px, env(safe-area-inset-left))',
        paddingRight: 'max(4px, env(safe-area-inset-right))',
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto', gap: 2 }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-label={label}
                style={{
                  flex: 1, minHeight: 52,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  padding: '6px 4px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  transition: 'all 0.15s', borderRadius: 10,
                  fontFamily: FONT, fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                }}
              >
                {isActive && (
                  <span style={{
                    position: 'absolute', top: 5,
                    width: 4, height: 4, borderRadius: '50%', background: BLACK,
                  }} />
                )}
                <Icon size={20} color={isActive ? BLACK : TEXT_3} />
                <span style={{ color: isActive ? BLACK : TEXT_3, transition: 'color 0.15s', lineHeight: 1, letterSpacing: '0.02em' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

    </div>
  )
}
