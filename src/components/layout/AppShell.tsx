import React, { useState, useRef, useEffect } from 'react'
import {
  Home, Activity, Menu, X, LayoutDashboard,
  ArrowLeftRight, ArrowUpDown, Settings, ChevronRight,
  Droplet, Layers, Repeat, Bot, Shield,
  MessageSquare, HelpCircle, Info, User, Search, Bookmark,
  Star, Lightbulb, Wallet,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'
import { useNanTheme } from '../../hooks/useNanTheme'
import { NotificationBell } from '../ui/NotificationBell'

const F = "'Inter',-apple-system,sans-serif"
const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()

// ── Nav items (mobile bottom bar) ────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'bridge',   label: 'Bridge',   Icon: ArrowLeftRight },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

// ── Sidebar sections (desktop + mobile drawer) ────────────────────────────────
const SIDEBAR_SECTIONS = [
  { title: 'Main', items: [
    { id: 'home',      label: 'Home',      Icon: Home,             desc: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard,  desc: 'Portfolio & performance' },
    { id: 'wallet',    label: 'Wallet',    Icon: Wallet,           desc: 'Balances & transfers' },
    { id: 'activity',  label: 'Activity',  Icon: Activity,         desc: 'Transaction history' },
  ]},
  { title: 'Finance', items: [
    { id: 'bridge',   label: 'Bridge',   Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
    { id: 'swap',     label: 'Swap',     Icon: ArrowUpDown,    desc: 'Exchange tokens' },
    { id: 'gateway',  label: 'Gateway',  Icon: Layers,         desc: 'Unified cross-chain balance' },
    { id: 'faucet',   label: 'Faucet',   Icon: Droplet,        desc: 'Free testnet USDC' },
  ]},
  { title: 'Automation', items: [
    { id: 'agent',     label: 'AI Agents',     Icon: Bot,     desc: 'Create and manage agents' },
    { id: 'agent',     label: 'Agent Spending', Icon: Shield,  desc: 'Budgets & permissions' },
    { id: 'recurring', label: 'Recurring',      Icon: Repeat,  desc: 'Scheduled payments' },
  ]},
  { title: 'Account', items: [
    { id: 'profile',   label: 'Profile',   Icon: User,     desc: 'Name, avatar & preferences' },
    { id: 'settings',  label: 'Settings',  Icon: Settings, desc: 'Wallet & app settings' },
    { id: 'search',    label: 'Search',    Icon: Search,   desc: 'Find anything in NAN' },
    { id: 'favorites', label: 'Saved',     Icon: Bookmark, desc: 'Your bookmarked items' },
  ]},
  { title: 'Help & Info', items: [
    { id: 'support',     label: 'Support',     Icon: MessageSquare, desc: 'Get help from our team' },
    { id: 'faq',         label: 'FAQ',         Icon: HelpCircle,    desc: 'Common questions answered' },
    { id: 'feedback',    label: 'Feedback',    Icon: Star,          desc: 'Rate your experience' },
    { id: 'suggestions', label: 'Suggestions', Icon: Lightbulb,     desc: 'Share an idea' },
    { id: 'about',       label: 'About NAN',   Icon: Info,          desc: 'Platform info & contact' },
  ]},
]

const BLUE = '#0066FF'

// ── NAN logo mark ─────────────────────────────────────────────────────────────
function NanMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 324 480" width={size * 0.75} height={size} fill="none">
      <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
      <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
    </svg>
  )
}

// ── Sidebar nav button ────────────────────────────────────────────────────────
function SideNavBtn({
  _id: _id, label, Icon, desc, isActive, onClick, C, showDesc,
}: {
  _id: string; label: string; Icon: React.ElementType; desc: string
  isActive: boolean; onClick: () => void; C: ReturnType<typeof useNanTheme>; showDesc?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 12px', borderRadius: 10,
        border: `1px solid ${isActive ? 'rgba(0,102,255,0.3)' : 'transparent'}`,
        background: isActive ? 'rgba(0,102,255,0.1)' : 'transparent',
        cursor: 'pointer', transition: 'all 0.12s', fontFamily: F, marginBottom: 2,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: isActive ? 'rgba(0,102,255,0.18)' : C.surf2,
        border: `1px solid ${isActive ? 'rgba(0,102,255,0.35)' : C.bdr}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} color={isActive ? BLUE : C.t2} />
      </div>
      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? BLUE : C.text, lineHeight: 1.2 }}>{label}</div>
        {showDesc && <div style={{ fontSize: 11, color: C.t3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>}
      </div>
      <ChevronRight size={12} color={isActive ? 'rgba(0,102,255,0.5)' : C.t3} />
    </button>
  )
}

// ── Main shell ────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const C = useNanTheme()
  const { activeView, setActiveView } = useAppStore()
  const { address } = useAccount()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = !!address && (ADMIN_ADDRESS === '' || address.toLowerCase() === ADMIN_ADDRESS)
  const [adminToast, setAdminToast] = useState(false)
  const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 769px)') : null
  const [isDesktop, setIsDesktop] = useState(mq ? mq.matches : false)

  useEffect(() => {
    if (!mq) return
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 5-tap logo hidden admin unlock
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleLogoTap = () => {
    if (!isAdmin) return
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    if (tapCount.current >= 5) {
      tapCount.current = 0; setActiveView('admin'); setDrawerOpen(false)
      setAdminToast(true); setTimeout(() => setAdminToast(false), 2000); return
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
  }

  const navActive = (id: string) => activeView === id

  const go = (id: string) => { setActiveView(id); setDrawerOpen(false) }

  // ── Desktop layout ───────────────────────────────────────────────────────
  if (isDesktop) {
    const SIDEBAR_W = 240
    const TOPBAR_H = 56

    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: F, overflow: 'hidden' }}>
        {adminToast && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: BLUE, color: '#fff', padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 300, pointerEvents: 'none' }}>Admin unlocked</div>
        )}

        {/* ── Desktop topbar ── */}
        <header style={{
          height: TOPBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: SIDEBAR_W, paddingRight: 28,
          background: C.isDark ? '#08090B' : '#FFFFFF',
          borderBottom: `1px solid ${C.bdr}`,
          zIndex: 200,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t2, textTransform: 'capitalize' }}>
            {activeView === 'home' ? 'Dashboard' : activeView.charAt(0).toUpperCase() + activeView.slice(1)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell color={C.t2} />
          </div>
        </header>

        {/* ── Body row ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Desktop sidebar ── */}
          <nav style={{
            width: SIDEBAR_W, flexShrink: 0,
            background: C.isDark ? '#08090B' : '#FFFFFF',
            borderRight: `1px solid ${C.bdr}`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            position: 'fixed', top: 0, left: 0, bottom: 0,
          }}>
            {/* Logo */}
            <div
              onClick={handleLogoTap}
              style={{
                height: TOPBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
                gap: 9, paddingLeft: 18, borderBottom: `1px solid ${C.bdr}`,
                cursor: 'default', userSelect: 'none',
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <NanMark size={16} />
              </div>
              <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.04em', color: C.text }}>nan</span>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px', scrollbarWidth: 'none' }}>
              {SIDEBAR_SECTIONS.map(section => (
                <div key={section.title} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.09em', padding: '10px 10px 4px' }}>{section.title}</div>
                  {section.items.map(({ id, label, Icon, desc }) => (
                    <SideNavBtn
                      key={`${id}-${label}`}
                      _id={id} label={label} Icon={Icon} desc={desc}
                      isActive={navActive(id)}
                      onClick={() => go(id)}
                      C={C}
                      showDesc={false}
                    />
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {/* ── Main content ── */}
          <main style={{
            flex: 1,
            marginLeft: SIDEBAR_W,
            overflowY: 'auto', overflowX: 'hidden',
            padding: '24px 0 48px',
            scrollbarWidth: 'thin',
            scrollbarColor: `${C.bdr} transparent`,
          }}>
            <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 28px' }}>
              {children}
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ── Mobile layout ────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: F, overflow: 'hidden', transition: 'background 0.25s' }}>

      {adminToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: C.blue, color: '#fff', padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 300, pointerEvents: 'none' }}>Admin unlocked</div>
      )}

      {/* Drawer overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 105, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      )}

      {/* ── Mobile side drawer ── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 272, zIndex: 110,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        borderLeft: `1px solid ${C.bdr}`,
        boxShadow: C.isDark ? '-16px 0 48px rgba(0,0,0,0.6)' : '-16px 0 48px rgba(0,0,0,0.12)',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drawer header */}
        <div onClick={handleLogoTap} style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 12, borderBottom: `1px solid ${C.bdr}`, cursor: 'default', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NanMark size={15} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.04em', color: C.text }}>nan</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationBell color={C.t2} />
            <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" style={{ width: 30, height: 30, borderRadius: 8, background: C.surf2, border: `1px solid ${C.bdr2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} color={C.t2} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '8px 10px', paddingBottom: 'max(100px,calc(env(safe-area-inset-bottom) + 80px))', scrollbarWidth: 'none' }}>
          {SIDEBAR_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.09em', padding: '12px 8px 5px' }}>{section.title}</div>
              {section.items.map(({ id, label, Icon, desc }) => {
                const isActive = activeView === id
                return (
                  <button key={`${id}-${label}`} onClick={() => go(id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10, border: `1px solid ${isActive ? C.blueBd : 'transparent'}`, background: isActive ? C.blueDim : 'transparent', cursor: 'pointer', transition: 'all 0.12s', fontFamily: F, marginBottom: 2, WebkitTapHighlightColor: 'transparent' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: isActive ? 'rgba(0,102,255,0.18)' : C.surf2, border: `1px solid ${isActive ? C.blueBd : C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={15} color={isActive ? C.blue : C.t2} />
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? C.blue : C.text, lineHeight: 1.2 }}>{label}</div>
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</div>
                    </div>
                    <ChevronRight size={12} color={isActive ? C.blueBd : C.t3} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile main content ── */}
      <main style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        paddingTop: 10,
        paddingLeft: 'max(14px,env(safe-area-inset-left))',
        paddingRight: 'max(14px,env(safe-area-inset-right))',
        paddingBottom: 60,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none',
      }}>
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav style={{
        flexShrink: 0, zIndex: 100,
        background: C.isDark ? '#08090B' : '#FFFFFF',
        borderTop: `1px solid ${C.bdr}`,
        paddingBottom: 'env(safe-area-inset-bottom,0px)',
        transition: 'background 0.25s',
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto' }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button key={id} onClick={() => go(id)} aria-label={label} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                padding: '6px 2px 7px',
                minHeight: 46, border: 'none', background: 'transparent',
                cursor: 'pointer', transition: 'color 0.12s',
                fontFamily: F, WebkitTapHighlightColor: 'transparent', position: 'relative',
              }}>
                <Icon size={18} color={isActive ? C.blue : C.t3} strokeWidth={isActive ? 2.2 : 1.7} />
                <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400, color: isActive ? C.blue : C.t3, lineHeight: 1 }}>{label}</span>
                {isActive && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 18, height: 2, borderRadius: 2, background: C.blue }} />}
              </button>
            )
          })}
          <button onClick={() => setDrawerOpen(v => !v)} aria-label="More" style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            padding: '6px 2px 7px',
            minHeight: 46, border: 'none', background: 'transparent',
            cursor: 'pointer', transition: 'color 0.12s',
            fontFamily: F, WebkitTapHighlightColor: 'transparent',
          }}>
            <Menu size={18} color={drawerOpen ? C.blue : C.t3} strokeWidth={drawerOpen ? 2.2 : 1.7} />
            <span style={{ fontSize: 9, fontWeight: drawerOpen ? 700 : 400, color: drawerOpen ? C.blue : C.t3, lineHeight: 1 }}>More</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
