import React, { useState, useRef } from 'react'
import { Home, Wallet, ShoppingBag, Activity, Menu, X, ArrowLeftRight, ArrowUpDown, Zap, Settings, ChevronRight, CreditCard, Droplet, Layers, Repeat } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'

const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()

const FONT = "'Inter', -apple-system, sans-serif"
const BLACK = '#0A0A0F'        // NAN dark background
const BLUE  = '#2563EB'        // NAN accent blue
const SURFACE = '#111118'      // NAN surface
const BORDER = 'rgba(37,99,235,0.18)'  // NAN blue-tinted border
const TEXT_2 = '#9AA0B0'
const TEXT_3 = '#64748B'

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'wallet',   label: 'Wallet',   Icon: Wallet },
  { id: 'shop',     label: 'Shop',     Icon: ShoppingBag },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

const DRAWER_ITEMS = [
  { id: 'onramp',   label: 'Buy USDC',  Icon: CreditCard,     desc: 'Card, Apple Pay, bank transfer' },
  { id: 'faucet',   label: 'Faucet',    Icon: Droplet,        desc: 'Free testnet USDC on Arc' },
  { id: 'swap',     label: 'Swap',      Icon: ArrowUpDown,    desc: 'Exchange tokens via Circle' },
  { id: 'bridge',   label: 'Bridge',    Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
  { id: 'gateway',   label: 'Gateway',   Icon: Layers,  desc: 'Unified USDC balance across chains' },
  { id: 'recurring', label: 'Recurring', Icon: Repeat,  desc: 'Scheduled agent payments' },
  { id: 'agent',     label: 'AI Agent',  Icon: Zap,     desc: 'Shop with your AI agent' },
  { id: 'settings', label: 'Settings',  Icon: Settings,       desc: 'Wallet & preferences' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeView, setActiveView } = useAppStore()
  const { address } = useAccount()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = !!address && (ADMIN_ADDRESS === '' || address.toLowerCase() === ADMIN_ADDRESS)
  const [adminToast, setAdminToast] = useState(false)

  // 5-tap secret admin access
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLogoTap = () => {
    if (!isAdmin) return
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    if (tapCount.current >= 5) {
      tapCount.current = 0
      setActiveView('admin')
      setDrawerOpen(false)
      setAdminToast(true)
      setTimeout(() => setAdminToast(false), 2000)
      return
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
  }

  const navActive = (id: string) =>
    activeView === id ||
    (id === 'wallet' && ['send', 'receive', 'send_confirm', 'send_success'].includes(activeView))

  const go = (id: string) => {
    setActiveView(id)
    setDrawerOpen(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: BLACK, fontFamily: FONT }}>

      {/* ── Admin unlock toast ── */}
      {adminToast && (
        <div style={{
          position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
          background: BLACK, color: '#ffffff', padding: '8px 20px',
          borderRadius: 20, fontSize: 13, fontWeight: 600,
          zIndex: 200, pointerEvents: 'none',
          animation: 'pw-up 0.2s ease both',
        }}>
          Admin unlocked
        </div>
      )}

      {/* ── Top bar ── */}
      <header style={{
        height: 52, flexShrink: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        background: 'rgba(10,10,15,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        {/* 5-tap secret admin trigger */}
        <div onClick={handleLogoTap} style={{ display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none', WebkitUserSelect: 'none' as const, cursor: 'default' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 12px rgba(37,99,235,0.5)' }}>
            <svg viewBox="0 0 324 480" width="12" height="17" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#F4F4F8', fontFamily: 'Inter,sans-serif' }}>NAN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="net-pill">Arc Testnet</div>
          <button
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Menu"
            style={{
              width: 36, height: 36, borderRadius: 9,
              background: drawerOpen ? BLUE : SURFACE,
              border: `1px solid ${drawerOpen ? BLUE : BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {drawerOpen
              ? <X size={16} color="#ffffff" />
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
        background: '#111118',
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'max(52px, env(safe-area-inset-top))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: TEXT_3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>More features</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px', WebkitOverflowScrolling: 'touch' }}>
          {DRAWER_ITEMS.map(({ id, label, Icon, desc }) => {
            const isActive = activeView === id
            return (
              <button
                key={id}
                onClick={() => go(id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 12px', borderRadius: 12, border: 'none',
                  background: isActive ? BLUE : 'transparent',
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
                  <Icon size={17} color={isActive ? '#ffffff' : TEXT_2} />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: isActive ? '#ffffff' : '#F4F4F8', lineHeight: 1.2 }}>{label}</div>
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
        background: 'rgba(10,10,15,0.97)',
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
                    width: 4, height: 4, borderRadius: '50%', background: BLUE,
                  }} />
                )}
                <Icon size={20} color={isActive ? BLUE : TEXT_3} />
                <span style={{ color: isActive ? BLUE : TEXT_3, transition: 'color 0.15s', lineHeight: 1, letterSpacing: '0.02em' }}>
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
