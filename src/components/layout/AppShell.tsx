import React, { useState, useRef } from 'react'
import {
  Home, Wallet, Activity, Menu, X,
  ArrowLeftRight, ArrowUpDown, Settings, ChevronRight,
  CreditCard, Droplet, Layers, Repeat, Bot, Shield,
  MessageSquare, HelpCircle, Info, User, Search, Bookmark,
  Star, Lightbulb
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'
import { useNanTheme } from '../../hooks/useNanTheme'
import { NotificationBell } from '../ui/NotificationBell'

const F = "'Inter',-apple-system,sans-serif"
const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'wallet',   label: 'Wallet',   Icon: Wallet },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

const DRAWER_SECTIONS = [
  { title: 'Finance', items: [
    { id: 'onramp',    label: 'Buy USDC',  Icon: CreditCard,     desc: 'Card, Apple Pay, bank' },
    { id: 'swap',      label: 'Swap',      Icon: ArrowUpDown,    desc: 'Exchange tokens' },
    { id: 'bridge',    label: 'Bridge',    Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
    { id: 'gateway',   label: 'Gateway',   Icon: Layers,         desc: 'Unified cross-chain balance' },
    { id: 'faucet',    label: 'Faucet',    Icon: Droplet,        desc: 'Free testnet USDC' },
  ]},
  { title: 'Automation', items: [
    { id: 'agent',     label: 'AI Agents',       Icon: Bot,     desc: 'Create and manage agents' },
    { id: 'agent',     label: 'Agent Spending',   Icon: Shield,  desc: 'Budgets & permissions' },
    { id: 'recurring', label: 'Recurring',        Icon: Repeat,  desc: 'Scheduled payments' },
  ]},
  { title: 'Account', items: [
    { id: 'profile',   label: 'Profile',    Icon: User,           desc: 'Name, avatar & preferences' },
    { id: 'settings',  label: 'Settings',   Icon: Settings,       desc: 'Wallet & app settings' },
    { id: 'search',    label: 'Search',     Icon: Search,         desc: 'Find anything in NAN' },
    { id: 'favorites', label: 'Saved',      Icon: Bookmark,       desc: 'Your bookmarked items' },
  ]},
  { title: 'Help & Info', items: [
    { id: 'support',     label: 'Support',     Icon: MessageSquare, desc: 'Get help from our team' },
    { id: 'faq',         label: 'FAQ',         Icon: HelpCircle,    desc: 'Common questions answered' },
    { id: 'feedback',    label: 'Feedback',    Icon: Star,          desc: 'Rate your experience' },
    { id: 'suggestions', label: 'Suggestions', Icon: Lightbulb,     desc: 'Share an idea' },
    { id: 'about',       label: 'About NAN',   Icon: Info,          desc: 'Platform info & contact' },
  ]},
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const C = useNanTheme()
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
      tapCount.current = 0; setActiveView('admin'); setDrawerOpen(false)
      setAdminToast(true); setTimeout(() => setAdminToast(false), 2000); return
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
  }

  const navActive = (id: string) =>
    activeView === id || (id === 'wallet' && ['send','receive','send_confirm','send_success'].includes(activeView))

  const go = (id: string) => { setActiveView(id); setDrawerOpen(false) }

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:C.bg, fontFamily:F, overflow:'hidden', transition:'background 0.25s' }}>

      {adminToast && (
        <div style={{ position:'fixed', top:64, left:'50%', transform:'translateX(-50%)', background:C.blue, color:'#fff', padding:'7px 18px', borderRadius:20, fontSize:12, fontWeight:600, zIndex:300, pointerEvents:'none' }}>
          Admin unlocked
        </div>
      )}

      {/* ── Top bar ── */}
      <header style={{
        height:54, flexShrink:0, zIndex:60,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingLeft:'max(16px,env(safe-area-inset-left))',
        paddingRight:'max(16px,env(safe-area-inset-right))',
        background: C.isDark ? 'rgba(8,9,11,0.97)' : 'rgba(255,255,255,0.97)',
        backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
        borderBottom:`1px solid ${C.bdr}`,
        transition:'background 0.25s, border-color 0.25s',
      }}>
        <div onClick={handleLogoTap} style={{ display:'flex', alignItems:'center', gap:9, userSelect:'none', cursor:'default' }}>
          <div style={{ width:30, height:30, borderRadius:8, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight:800, fontSize:17, letterSpacing:'-0.04em', color:C.text }}>nan</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:C.blueDim, border:`1px solid ${C.blueBd}`, fontSize:11, fontWeight:600, color:C.blue }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:C.blue, display:'inline-block' }} />
            Arc Testnet
          </div>
          <NotificationBell color={C.t2} />
          <button onClick={() => setDrawerOpen(v => !v)} aria-label="Menu" style={{ width:34, height:34, borderRadius:8, background:drawerOpen?C.blue:C.surf2, border:`1px solid ${drawerOpen?C.blue:C.bdr2}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s' }}>
            {drawerOpen ? <X size={15} color="#fff" /> : <Menu size={15} color={C.t2} />}
          </button>
        </div>
      </header>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position:'fixed', inset:0, zIndex:105, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }} />
      )}

      {/* ── Side drawer ── */}
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:272, zIndex:110,
        background: C.isDark ? '#0D1017' : '#FFFFFF',
        borderLeft:`1px solid ${C.bdr}`,
        boxShadow: C.isDark ? '-16px 0 48px rgba(0,0,0,0.6)' : '-16px 0 48px rgba(0,0,0,0.12)',
        transform:drawerOpen?'translateX(0)':'translateX(100%)',
        transition:'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
        display:'flex', flexDirection:'column',
      }}>
        <div style={{ height:54, flexShrink:0, display:'flex', alignItems:'center', paddingLeft:16, borderBottom:`1px solid ${C.bdr}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:6, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 324 480" width="10" height="14" fill="none">
                <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
              </svg>
            </div>
            <span style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.04em', color:C.text }}>nan</span>
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch', padding:'8px 10px', paddingBottom:'max(100px,calc(env(safe-area-inset-bottom) + 80px))', scrollbarWidth:'none' }}>
          {DRAWER_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.t3, textTransform:'uppercase', letterSpacing:'0.09em', padding:'12px 8px 5px' }}>{section.title}</div>
              {section.items.map(({ id, label, Icon, desc }) => {
                const isActive = activeView === id
                return (
                  <button key={id} onClick={() => go(id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:11, padding:'9px 10px', borderRadius:10, border:`1px solid ${isActive?C.blueBd:'transparent'}`, background:isActive?C.blueDim:'transparent', cursor:'pointer', transition:'all 0.12s', fontFamily:F, marginBottom:2, WebkitTapHighlightColor:'transparent' }}>
                    <div style={{ width:32, height:32, borderRadius:8, flexShrink:0, background:isActive?'rgba(0,102,255,0.18)':C.surf2, border:`1px solid ${isActive?C.blueBd:C.bdr}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon size={15} color={isActive?C.blue:C.t2} />
                    </div>
                    <div style={{ flex:1, textAlign:'left', minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:isActive?C.blue:C.text, lineHeight:1.2 }}>{label}</div>
                      <div style={{ fontSize:11, color:C.t3, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{desc}</div>
                    </div>
                    <ChevronRight size={12} color={isActive?C.blueBd:C.t3} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <main style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'16px', paddingLeft:'max(16px,env(safe-area-inset-left))', paddingRight:'max(16px,env(safe-area-inset-right))', paddingBottom:96, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' }}>
        {children}
      </main>

      {/* ── Bottom nav ── */}
      <nav style={{ flexShrink:0, zIndex:100, background: C.isDark ? 'rgba(8,9,11,0.97)' : 'rgba(255,255,255,0.97)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', borderTop:`1px solid ${C.bdr}`, paddingTop:6, paddingBottom:'max(10px,env(safe-area-inset-bottom))', paddingLeft:'max(4px,env(safe-area-inset-left))', paddingRight:'max(4px,env(safe-area-inset-right))', transition:'background 0.25s' }}>
        <div style={{ display:'flex', maxWidth:480, margin:'0 auto' }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button key={id} onClick={() => go(id)} aria-label={label} style={{ flex:1, minHeight:50, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'4px 4px 6px', border:'none', background:'transparent', cursor:'pointer', transition:'all 0.15s', borderRadius:8, fontFamily:F, WebkitTapHighlightColor:'transparent', position:'relative' }}>
                <Icon size={21} color={isActive?C.blue:C.t3} strokeWidth={isActive?2.2:1.8} />
                <span style={{ fontSize:10, fontWeight:isActive?600:400, color:isActive?C.blue:C.t3, letterSpacing:'0.01em', lineHeight:1 }}>{label}</span>
                {isActive && <span style={{ position:'absolute', bottom:'max(8px,env(safe-area-inset-bottom))', width:3, height:3, borderRadius:'50%', background:C.blue }} />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
