import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Home, Activity, Menu, X, LayoutDashboard,
  ArrowLeftRight, ArrowUpDown, Settings, ChevronRight,
  Droplet, Layers, Repeat, Bot, Wallet,
  MessageSquare, HelpCircle, Info, User, Search, Bookmark,
  Star, Lightbulb, ArrowRight, Clock, ShoppingBag, FileDown,
  FileText,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'
import { useNanTheme } from '../../hooks/useNanTheme'
import { NotificationBell } from '../ui/NotificationBell'
import { NanLogo } from '../NanLogo'
import { usePaymentWatcher } from '../../hooks/usePaymentWatcher'
import { usePushNotifications } from '../../hooks/usePushNotifications'

const F = "'Inter',-apple-system,sans-serif"
const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()
const BLUE = '#0066FF'

// ── Search result catalogue ────────────────────────────────────────────────────
interface SearchResult {
  id: string; title: string; subtitle: string; category: string
  Icon: React.ElementType; iconColor: string; action: string
}
const ALL_RESULTS: SearchResult[] = [
  { id:'send',        title:'Send USDC',           subtitle:'Transfer to any wallet',             category:'Payments',    Icon:ArrowRight,     iconColor:BLUE,      action:'send' },
  { id:'receive',     title:'Receive USDC',         subtitle:'Share your address',                 category:'Payments',    Icon:ArrowRight,     iconColor:'#00C853', action:'receive' },
  { id:'swap',        title:'Swap tokens',          subtitle:'Exchange USDC for other tokens',     category:'Finance',     Icon:Repeat,         iconColor:'#F0A500', action:'swap' },
  { id:'bridge',      title:'Bridge USDC',          subtitle:'Move USDC across chains',            category:'Finance',     Icon:ArrowLeftRight, iconColor:BLUE,      action:'bridge' },
  { id:'buy',         title:'Buy USDC',             subtitle:'Purchase with card or bank',         category:'Finance',     Icon:ShoppingBag,    iconColor:BLUE,      action:'onramp' },
  { id:'gateway',     title:'Gateway',              subtitle:'Unified cross-chain balance',        category:'Finance',     Icon:Layers,         iconColor:BLUE,      action:'gateway' },
  { id:'recurring',   title:'Recurring Payments',   subtitle:'Schedule automatic transfers',       category:'Finance',     Icon:Repeat,         iconColor:'#8B5CF6', action:'recurring' },
  { id:'faucet',      title:'Faucet',               subtitle:'Free testnet USDC',                  category:'Finance',     Icon:Droplet,        iconColor:'#00C853', action:'faucet' },
  { id:'agent',        title:'AI Agents',            subtitle:'Autonomous service & payment agent', category:'Agents',      Icon:Bot,            iconColor:BLUE,      action:'agent' },
  { id:'agent-wallet', title:'Agent Wallet',         subtitle:'Swap, bridge & recurring via agent', category:'Agents',      Icon:Wallet,         iconColor:BLUE,      action:'agent-wallet' },
  { id:'payment-requests', title:'Payment Requests', subtitle:'Create and track payment requests',   category:'Payments',    Icon:FileText,       iconColor:BLUE,      action:'payment-requests' },
  { id:'activity',    title:'Activity',             subtitle:'Transaction history',                category:'Account',     Icon:Clock,          iconColor:BLUE,      action:'activity' },
  { id:'exports',     title:'Exports & Accounting', subtitle:'Download CSV/JSON transaction records', category:'Account',     Icon:FileDown,       iconColor:BLUE,      action:'exports' },
  { id:'dashboard',   title:'Dashboard',            subtitle:'Portfolio & performance',            category:'Account',     Icon:LayoutDashboard,iconColor:BLUE,      action:'dashboard' },
  { id:'profile',     title:'Profile',              subtitle:'Name, avatar & preferences',         category:'Account',     Icon:User,           iconColor:BLUE,      action:'profile' },
  { id:'settings',    title:'Settings',             subtitle:'Wallet & app settings',              category:'Account',     Icon:Settings,       iconColor:BLUE,      action:'settings' },
  { id:'favorites',   title:'Saved Items',          subtitle:'Your bookmarked content',            category:'Account',     Icon:Bookmark,       iconColor:BLUE,      action:'favorites' },
  { id:'faq',         title:'FAQ',                  subtitle:'Common questions answered',          category:'Help',        Icon:HelpCircle,     iconColor:'#F0A500', action:'faq' },
  { id:'support',     title:'Support',              subtitle:'Get help from our team',             category:'Help',        Icon:MessageSquare,  iconColor:BLUE,      action:'support' },
  { id:'feedback',    title:'Feedback',             subtitle:'Rate your experience',               category:'Help',        Icon:Star,           iconColor:'#F0A500', action:'feedback' },
  { id:'suggestions', title:'Suggestions',          subtitle:'Share ideas to improve NAN',         category:'Help',        Icon:Lightbulb,      iconColor:'#00C853', action:'suggestions' },
  { id:'about',       title:'About NAN',            subtitle:'Platform info & contact',            category:'Info',        Icon:Info,           iconColor:BLUE,      action:'about' },
]

// ── Command Palette ────────────────────────────────────────────────────────────
function CommandPalette({ onClose, onGo }: { onClose: () => void; onGo: (action: string) => void }) {
  const C = useNanTheme()
  const { recentSearches, addSearch, clearSearches } = useAppStore()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 40) }, [])

  const results: SearchResult[] = query.trim()
    ? ALL_RESULTS.filter(r =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.subtitle.toLowerCase().includes(query.toLowerCase()) ||
        r.category.toLowerCase().includes(query.toLowerCase())
      )
    : ALL_RESULTS.slice(0, 10)

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { setCursor(0) }, [query])

  const commit = useCallback((r: SearchResult) => {
    addSearch(r.title)
    onGo(r.action)
    onClose()
  }, [addSearch, onGo, onClose])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); commit(results[cursor]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // Group for display
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      />
      {/* Palette */}
      <div style={{
        position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)',
        width: 'min(580px, calc(100vw - 32px))',
        zIndex: 510,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        border: `1px solid ${C.bdr}`,
        borderRadius: 16,
        boxShadow: C.isDark ? '0 24px 64px rgba(0,0,0,0.7)' : '0 24px 64px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: 'min(520px, 70vh)',
      }}>
        {/* Search input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.bdr}`, flexShrink: 0 }}>
          <Search size={16} color={C.t3} style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search NAN…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: C.text, fontSize: 15, fontFamily: F }}
          />
          {query ? (
            <button onClick={() => setQuery('')} style={{ background: C.surf2, border: 'none', borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={12} color={C.t2} />
            </button>
          ) : (
            <kbd style={{ flexShrink: 0, background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 5, padding: '2px 6px', fontSize: 11, color: C.t3, fontFamily: 'monospace' }}>Esc</kbd>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1, padding: '8px 8px', scrollbarWidth: 'none' }}>
          {/* Recent searches strip */}
          {!query && recentSearches.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 6px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent</span>
                <button onClick={clearSearches} style={{ fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>Clear</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 4px 8px' }}>
                {recentSearches.slice(0, 6).map(r => (
                  <button key={r} onClick={() => setQuery(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20, cursor: 'pointer', fontFamily: F }}>
                    <Clock size={11} color={C.t3} />
                    <span style={{ fontSize: 12, color: C.t2 }}>{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{category}</div>
              {items.map(r => {
                const idx = results.indexOf(r)
                const active = idx === cursor
                return (
                  <button
                    key={r.id}
                    onClick={() => commit(r)}
                    onMouseEnter={() => setCursor(idx)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 10px', borderRadius: 10,
                      border: `1px solid ${active ? 'rgba(0,102,255,0.3)' : 'transparent'}`,
                      background: active ? 'rgba(0,102,255,0.08)' : 'transparent',
                      cursor: 'pointer', fontFamily: F, textAlign: 'left', transition: 'all 0.08s',
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${r.iconColor}14`, border: `1px solid ${r.iconColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <r.Icon size={15} color={r.iconColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.title}</div>
                      <div style={{ fontSize: 11, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subtitle}</div>
                    </div>
                    {active && <kbd style={{ flexShrink: 0, background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 4, padding: '2px 6px', fontSize: 10, color: C.t3 }}>↵</kbd>}
                  </button>
                )
              })}
            </div>
          ))}

          {query && results.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>No results</div>
              <div style={{ fontSize: 12, color: C.t3 }}>Try different keywords</div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${C.bdr}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['Esc', 'Close']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <kbd style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>{key}</kbd>
              <span style={{ fontSize: 11, color: C.t3 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Nav items (mobile bottom bar) ─────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'bridge',   label: 'Bridge',   Icon: ArrowLeftRight },
  { id: 'activity', label: 'Activity', Icon: Activity },
  { id: 'gateway',  label: 'Gateway',  Icon: Layers },
]

// ── Sidebar sections (desktop sidebar only — mobile drawer uses MOBILE_SECTIONS) ──
const SIDEBAR_SECTIONS = [
  { title: 'Main', items: [
    { id: 'home',      label: 'Home',      Icon: Home,             desc: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard,  desc: 'Portfolio & performance' },
    { id: 'activity',  label: 'Activity',  Icon: Activity,         desc: 'Transaction history' },
  ]},
  { title: 'Payments', items: [
    { id: 'send',              label: 'Send',             Icon: ArrowRight,  desc: 'Send USDC to any wallet' },
    { id: 'receive',           label: 'Receive',          Icon: ArrowRight,  desc: 'Share your wallet address' },
    { id: 'payment-requests',  label: 'Payment Requests', Icon: FileText,    desc: 'Create and track requests' },
    { id: 'activity',          label: 'Transactions',     Icon: Activity,    desc: 'Transaction history' },
  ]},
  { title: 'Finance', items: [
    { id: 'bridge',    label: 'Bridge',    Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
    { id: 'swap',      label: 'Swap',      Icon: ArrowUpDown,    desc: 'Exchange tokens' },
    { id: 'gateway',   label: 'Gateway',   Icon: Layers,         desc: 'Unified cross-chain balance' },
    { id: 'faucet',    label: 'Faucet',    Icon: Droplet,        desc: 'Free testnet USDC' },
  ]},
  { title: 'Automation', items: [
    { id: 'agent',        label: 'AI Agents',     Icon: Bot,    desc: 'Create and manage agents' },
    { id: 'agent-wallet', label: 'Agent Wallet',  Icon: Wallet, desc: 'Swap, bridge & recurring via agent' },
    { id: 'recurring',    label: 'Recurring',     Icon: Repeat, desc: 'Scheduled payments' },
  ]},
  { title: 'Account', items: [
    { id: 'exports',   label: 'Generate Statement', Icon: FileDown, desc: 'Download your account statement' },
    { id: 'settings',  label: 'Settings',  Icon: Settings, desc: 'Wallet & app settings' },
    { id: 'favorites', label: 'Saved',     Icon: Bookmark, desc: 'Your bookmarked items' },
  ]},
  { title: 'Help & Info', items: [
    { id: 'support',     label: 'Support',     Icon: MessageSquare, desc: 'Get help' },
    { id: 'faq',         label: 'FAQ',         Icon: HelpCircle,    desc: 'Common questions' },
    { id: 'feedback',    label: 'Feedback',    Icon: Star,          desc: 'Rate your experience' },
    { id: 'suggestions', label: 'Suggestions', Icon: Lightbulb,     desc: 'Share an idea' },
    { id: 'about',       label: 'About NAN',   Icon: Info,          desc: 'Platform info' },
  ]},
]

// Mobile drawer:
//  - No "Home" (bottom nav covers it) or "Dashboard" (Home IS the mobile overview)
//  - No "Transactions" from Payments (duplicate of Activity in Main)
//  - No "Swap" (complex enough to be desktop-first)
const MOBILE_DRAWER_SECTIONS = SIDEBAR_SECTIONS.map(s => ({
  ...s,
  items: s.items.filter(i =>
    i.id !== 'home' &&
    i.id !== 'dashboard' &&
    i.id !== 'swap' &&
    !(s.title === 'Payments' && i.label === 'Transactions') &&
    !(s.title === 'Payments' && i.id === 'send') &&
    !(s.title === 'Payments' && i.id === 'receive')
  ),
})).filter(s => s.items.length > 0)

// ── Sidebar nav button ─────────────────────────────────────────────────────────
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

// ── Main shell ─────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const C = useNanTheme()
  const { activeView, setActiveView } = useAppStore()
  const { address } = useAccount()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Global payment watcher — polls every 30 s regardless of which screen is open.
  // Fires notifications + adds to the activity store on new incoming USDC transfers.
  usePaymentWatcher()
  // Web Push subscription — registers this device with the server chain watcher
  // so notifications arrive even when the tab is closed.
  usePushNotifications()
  // If VITE_ADMIN_ADDRESS is set, only that wallet can access admin.
  // If it is not set (empty), any connected wallet — or no wallet — can access admin via 5-tap.
  const isAdmin = ADMIN_ADDRESS === ''
    ? true
    : (!!address && address.toLowerCase() === ADMIN_ADDRESS)
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

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setPaletteOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (isDesktop && activeView === 'home') setActiveView('dashboard')
  }, [isDesktop, activeView, setActiveView])

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

  const go = (id: string) => {
    if (id === 'home' && isDesktop) { setActiveView('landing'); setDrawerOpen(false); return }
    setActiveView(id); setDrawerOpen(false)
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  if (isDesktop) {
    const SIDEBAR_W = 240
    const TOPBAR_H = 56

    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: F, overflow: 'hidden' }}>
        {adminToast && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: BLUE, color: '#fff', padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 300, pointerEvents: 'none' }}>Admin unlocked</div>
        )}

        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onGo={go} />}

        {/* Desktop topbar */}
        <header style={{
          height: TOPBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: SIDEBAR_W, paddingRight: 28,
          background: C.isDark ? '#08090B' : '#FFFFFF',
          borderBottom: `1px solid ${C.bdr}`,
          zIndex: 200,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t2, textTransform: 'capitalize' }}>
            {activeView.charAt(0).toUpperCase() + activeView.slice(1)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Search bar — Vercel style */}
            <button
              onClick={() => setPaletteOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 8,
                border: `1px solid ${C.bdr}`,
                background: C.surf,
                cursor: 'pointer', fontFamily: F,
                color: C.t3, fontSize: 12,
                transition: 'border-color 0.12s',
              }}
            >
              <Search size={13} color={C.t3} />
              <span>Search…</span>
              <kbd style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace', color: C.t3 }}>⌘K</kbd>
            </button>
            <NotificationBell color={C.t2} />
          </div>
        </header>

        {/* Body row */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Desktop sidebar */}
          <nav style={{
            width: SIDEBAR_W, flexShrink: 0,
            background: C.isDark ? '#08090B' : '#FFFFFF',
            borderRight: `1px solid ${C.bdr}`,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            position: 'fixed', top: 0, left: 0, bottom: 0,
          }}>
            {/* Sidebar top — plain nan logo, admin unlock on 5 taps */}
            <div style={{
              height: TOPBAR_H, flexShrink: 0, display: 'flex', alignItems: 'center',
              paddingLeft: 20, paddingRight: 12,
              borderBottom: `1px solid ${C.bdr}`,
            }}>
              <div onClick={handleLogoTap} style={{ cursor: 'default', lineHeight: 0 }}>
                <NanLogo height={26} />
              </div>
            </div>
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

          <main style={{
            flex: 1, marginLeft: SIDEBAR_W,
            overflowY: 'auto', overflowX: 'hidden',
            padding: '0',
            scrollbarWidth: 'thin',
            scrollbarColor: `${C.bdr} transparent`,
          }}>
            {children}
          </main>
        </div>
      </div>
    )
  }

  // ── Mobile layout ───────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, height: '100dvh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: F, overflow: 'hidden', transition: 'background 0.25s' }}>

      {adminToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: C.blue, color: '#fff', padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 300, pointerEvents: 'none' }}>Admin unlocked</div>
      )}

      {/* Drawer overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 105, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />
      )}

      {/* Mobile side drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 272, zIndex: 110,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        borderLeft: `1px solid ${C.bdr}`,
        boxShadow: C.isDark ? '-16px 0 48px rgba(0,0,0,0.6)' : '-16px 0 48px rgba(0,0,0,0.12)',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Mobile drawer header */}
        <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 12, borderBottom: `1px solid ${C.bdr}`, userSelect: 'none' }}>
          <button onClick={handleLogoTap} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}>
            <NanLogo height={28} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationBell color={C.t2} />
            <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" style={{ width: 30, height: 30, borderRadius: 8, background: C.surf2, border: `1px solid ${C.bdr2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} color={C.t2} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '8px 10px', paddingBottom: 'max(100px,calc(env(safe-area-inset-bottom) + 80px))', scrollbarWidth: 'none' }}>
          {MOBILE_DRAWER_SECTIONS.map(section => (
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

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onGo={go} />}

      {/* Mobile main content — agent view gets overflow:hidden so it self-manages scroll */}
      <main style={{
        flex: 1,
        minHeight: 0,           /* critical: lets flex item shrink below content height */
        overflowY: (activeView === 'agent' || activeView === 'agent-wallet') ? 'hidden' : 'auto',
        overflowX: 'hidden',
        paddingTop: (activeView === 'agent' || activeView === 'agent-wallet') ? 0 : 12,
        paddingLeft: (activeView === 'agent' || activeView === 'agent-wallet') ? 0 : 'max(16px,env(safe-area-inset-left))',
        paddingRight: (activeView === 'agent' || activeView === 'agent-wallet') ? 0 : 'max(16px,env(safe-area-inset-right))',
        paddingBottom: (activeView === 'agent' || activeView === 'agent-wallet') ? 0 : 'max(20px,env(safe-area-inset-bottom))',
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        msOverflowStyle: 'none',
        display: (activeView === 'agent' || activeView === 'agent-wallet') ? 'flex' : 'block',
        flexDirection: (activeView === 'agent' || activeView === 'agent-wallet') ? 'column' : undefined,
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {children}
      </main>

      {/* Mobile bottom nav — hidden on agent view so chat fills the full screen */}
      <nav style={{
        flexShrink: 0, zIndex: 100,
        background: C.isDark ? '#08090B' : '#FFFFFF',
        borderTop: `1px solid ${C.bdr}`,
        paddingBottom: 'env(safe-area-inset-bottom,0px)',
        transition: 'background 0.25s',
        display: (activeView === 'agent' || activeView === 'agent-wallet') ? 'none' : undefined,
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto' }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button key={id} onClick={() => go(id)} aria-label={label} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '8px 2px 8px',
                minHeight: 52, border: 'none', background: 'transparent',
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
            alignItems: 'center', justifyContent: 'center', gap: 3,
            padding: '8px 2px 8px',
            minHeight: 52, border: 'none', background: 'transparent',
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
