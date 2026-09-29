import React, { useState, useRef } from 'react'
import {
  Home, Wallet, Activity, Menu, X,
  ArrowLeftRight, ArrowUpDown, Zap, Settings, ChevronRight,
  CreditCard, Droplet, Layers, Repeat, Bot
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'

const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',      Icon: Home },
  { id: 'wallet',   label: 'Wallet',    Icon: Wallet },
  { id: 'activity', label: 'Activity',  Icon: Activity },
]

const DRAWER_SECTIONS = [
  {
    title: 'Finance',
    items: [
      { id: 'onramp',    label: 'Buy USDC',   Icon: CreditCard,     desc: 'Card, Apple Pay, bank' },
      { id: 'faucet',    label: 'Faucet',     Icon: Droplet,        desc: 'Free testnet USDC' },
      { id: 'swap',      label: 'Swap',       Icon: ArrowUpDown,    desc: 'Exchange tokens' },
      { id: 'bridge',    label: 'Bridge',     Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
      { id: 'gateway',   label: 'Gateway',    Icon: Layers,         desc: 'Unified cross-chain balance' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { id: 'agent',     label: 'AI Agent',   Icon: Bot,            desc: 'Autonomous payments' },
      { id: 'recurring', label: 'Recurring',  Icon: Repeat,         desc: 'Scheduled payments' },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'settings',  label: 'Settings',   Icon: Settings,       desc: 'Wallet & preferences' },
    ],
  },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { activeView, setActiveView } = useAppStore()
  const { address } = useAccount()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = !!address && (ADMIN_ADDRESS === '' || address.toLowerCase() === ADMIN_ADDRESS)
  const [adminToast, setAdminToast] = useState(false)

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

  const go = (id: string) => { setActiveView(id); setDrawerOpen(false) }

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: '#08090B', fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* Admin toast */}
      {adminToast && (
        <div style={{
          position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: '#0066FF', color: '#fff', padding: '7px 18px',
          borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 300, pointerEvents: 'none',
        }}>Admin unlocked</div>
      )}

      {/* ── Top bar ── */}
      <header style={{
        height: 54, flexShrink: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        background: 'rgba(8,9,11,0.95)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div
          onClick={handleLogoTap}
          style={{ display: 'flex', alignItems: 'center', gap: 9, userSelect: 'none', cursor: 'default' }}
        >
          {/* NAN wordmark with blue dot */}
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: '#0066FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.04em', color: '#FFFFFF' }}>nan</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Network pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.20)',
            fontSize: 11, fontWeight: 600, color: '#0066FF',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0066FF', display: 'inline-block' }} />
            Arc Testnet
          </div>
          {/* Menu button */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            aria-label="Menu"
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: drawerOpen ? '#0066FF' : '#13151A',
              border: `1px solid ${drawerOpen ? '#0066FF' : 'rgba(255,255,255,0.10)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {drawerOpen
              ? <X size={15} color="#fff" />
              : <Menu size={15} color="#8A8F9E" />}
          </button>
        </div>
      </header>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
        />
      )}

      {/* ── Side drawer ── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 272, zIndex: 70,
        background: '#0E1014',
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'max(54px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {DRAWER_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: '#50556A',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                padding: '12px 8px 6px',
              }}>{section.title}</div>
              {section.items.map(({ id, label, Icon, desc }) => {
                const isActive = activeView === id
                return (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                      padding: '10px 10px', borderRadius: 10, border: 'none',
                      background: isActive ? 'rgba(0,102,255,0.12)' : 'transparent',
                      cursor: 'pointer', transition: 'all 0.12s',
                      fontFamily: "'Inter', sans-serif", marginBottom: 1,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: isActive ? 'rgba(0,102,255,0.20)' : '#13151A',
                      border: `1px solid ${isActive ? 'rgba(0,102,255,0.30)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} color={isActive ? '#0066FF' : '#8A8F9E'} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? '#0066FF' : '#F2F3F5', lineHeight: 1.2 }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#50556A', marginTop: 1 }}>{desc}</div>
                    </div>
                    <ChevronRight size={13} color={isActive ? 'rgba(0,102,255,0.5)' : '#50556A'} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '16px 16px 96px',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav style={{
        flexShrink: 0, zIndex: 100,
        background: 'rgba(8,9,11,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: 6,
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(4px, env(safe-area-inset-left))',
        paddingRight: 'max(4px, env(safe-area-inset-right))',
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto' }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-label={label}
                style={{
                  flex: 1, minHeight: 50,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  padding: '4px 4px 6px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  transition: 'all 0.15s', borderRadius: 8,
                  fontFamily: "'Inter', sans-serif",
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon size={21} color={isActive ? '#0066FF' : '#50556A'} strokeWidth={isActive ? 2.2 : 1.8} />
                <span style={{
                  fontSize: 10, fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#0066FF' : '#50556A',
                  letterSpacing: '0.01em', lineHeight: 1,
                }}>
                  {label}
                </span>
                {isActive && (
                  <span style={{
                    position: 'absolute', bottom: 'max(10px,env(safe-area-inset-bottom))',
                    width: 3, height: 3, borderRadius: '50%', background: '#0066FF',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
