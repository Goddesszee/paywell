import React, { useState, useRef } from 'react'
import {
  Home, Wallet, Activity, Menu, X,
  ArrowLeftRight, ArrowUpDown, Zap, Settings, ChevronRight,
  CreditCard, Droplet, Layers, Repeat, Bot
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useAccount } from 'wagmi'

const N = { bg:'#08090B', surf:'#111318', surf2:'#181C24', bdr:'rgba(255,255,255,0.07)', blue:'#0066FF', text:'#F2F3F5', t2:'#8A8F9E', t3:'#50556A', f:"'Inter',-apple-system,sans-serif" }

const ADMIN_ADDRESS = (import.meta.env.VITE_ADMIN_ADDRESS as string ?? '').toLowerCase()

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: Home },
  { id: 'wallet',   label: 'Wallet',   Icon: Wallet },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

const DRAWER_SECTIONS = [
  { title: 'Finance', items: [
    { id: 'onramp',    label: 'Buy USDC',  Icon: CreditCard,     desc: 'Card, Apple Pay, bank' },
    { id: 'faucet',    label: 'Faucet',    Icon: Droplet,        desc: 'Free testnet USDC' },
    { id: 'swap',      label: 'Swap',      Icon: ArrowUpDown,    desc: 'Exchange tokens' },
    { id: 'bridge',    label: 'Bridge',    Icon: ArrowLeftRight, desc: 'Move USDC across chains' },
    { id: 'gateway',   label: 'Gateway',   Icon: Layers,         desc: 'Unified cross-chain balance' },
  ]},
  { title: 'Automation', items: [
    { id: 'agent',     label: 'AI Agent',  Icon: Bot,            desc: 'Autonomous payments' },
    { id: 'recurring', label: 'Recurring', Icon: Repeat,         desc: 'Scheduled payments' },
  ]},
  { title: 'Account', items: [
    { id: 'settings',  label: 'Settings',  Icon: Settings,       desc: 'Wallet & preferences' },
  ]},
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
      tapCount.current = 0; setActiveView('admin'); setDrawerOpen(false)
      setAdminToast(true); setTimeout(() => setAdminToast(false), 2000); return
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, 1500)
  }

  const navActive = (id: string) =>
    activeView === id || (id === 'wallet' && ['send','receive','send_confirm','send_success'].includes(activeView))

  const go = (id: string) => { setActiveView(id); setDrawerOpen(false) }

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:N.bg, fontFamily:N.f, overflow:'hidden' }}>

      {adminToast && (
        <div style={{ position:'fixed', top:64, left:'50%', transform:'translateX(-50%)', background:N.blue, color:'#fff', padding:'7px 18px', borderRadius:20, fontSize:12, fontWeight:600, zIndex:300, pointerEvents:'none' }}>
          Admin unlocked
        </div>
      )}

      {/* ── Top bar ── */}
      <header style={{ height:54, flexShrink:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 max(16px,env(safe-area-inset-left)) 0 max(16px,env(safe-area-inset-right))', paddingLeft:'max(16px,env(safe-area-inset-left))', paddingRight:'max(16px,env(safe-area-inset-right))', background:'rgba(8,9,11,0.97)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:`1px solid ${N.bdr}` }}>
        <div onClick={handleLogoTap} style={{ display:'flex', alignItems:'center', gap:9, userSelect:'none', cursor:'default' }}>
          <div style={{ width:30, height:30, borderRadius:8, background:N.blue, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight:800, fontSize:17, letterSpacing:'-0.04em', color:'#fff' }}>nan</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:'rgba(0,102,255,0.10)', border:'1px solid rgba(0,102,255,0.20)', fontSize:11, fontWeight:600, color:N.blue }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:N.blue, display:'inline-block' }} />
            Arc Testnet
          </div>
          <button onClick={() => setDrawerOpen(v => !v)} aria-label="Menu" style={{ width:34, height:34, borderRadius:8, background:drawerOpen?N.blue:'#13151A', border:`1px solid ${drawerOpen?N.blue:'rgba(255,255,255,0.10)'}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s' }}>
            {drawerOpen ? <X size={15} color="#fff" /> : <Menu size={15} color={N.t2} />}
          </button>
        </div>
      </header>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position:'fixed', inset:0, zIndex:55, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' }} />
      )}

      {/* ── Side drawer — fixed, scrollable inside ── */}
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:272, zIndex:70, background:'#0D1017', borderLeft:`1px solid ${N.bdr}`, boxShadow:'-16px 0 48px rgba(0,0,0,0.6)', transform:drawerOpen?'translateX(0)':'translateX(100%)', transition:'transform 0.24s cubic-bezier(0.4,0,0.2,1)', display:'flex', flexDirection:'column' }}>
        {/* Drawer header */}
        <div style={{ height:54, flexShrink:0, display:'flex', alignItems:'center', paddingLeft:16, borderBottom:`1px solid ${N.bdr}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:6, background:N.blue, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg viewBox="0 0 324 480" width="10" height="14" fill="none">
                <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
              </svg>
            </div>
            <span style={{ fontWeight:800, fontSize:15, letterSpacing:'-0.04em', color:'#fff' }}>nan</span>
          </div>
        </div>
        {/* Scrollable list */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch', padding:'8px 10px', paddingBottom:'max(20px,env(safe-area-inset-bottom))', scrollbarWidth:'none' }}>
          {DRAWER_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:N.t3, textTransform:'uppercase', letterSpacing:'0.09em', padding:'12px 8px 5px' }}>{section.title}</div>
              {section.items.map(({ id, label, Icon, desc }) => {
                const isActive = activeView === id
                return (
                  <button key={id} onClick={() => go(id)} style={{ width:'100%', display:'flex', alignItems:'center', gap:11, padding:'9px 10px', borderRadius:10, border:`1px solid ${isActive?'rgba(0,102,255,0.25)':'transparent'}`, background:isActive?'rgba(0,102,255,0.10)':'transparent', cursor:'pointer', transition:'all 0.12s', fontFamily:N.f, marginBottom:2, WebkitTapHighlightColor:'transparent' }}>
                    <div style={{ width:32, height:32, borderRadius:8, flexShrink:0, background:isActive?'rgba(0,102,255,0.18)':N.surf2, border:`1px solid ${isActive?'rgba(0,102,255,0.30)':N.bdr}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon size={15} color={isActive?N.blue:N.t2} />
                    </div>
                    <div style={{ flex:1, textAlign:'left', minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:isActive?N.blue:N.text, lineHeight:1.2 }}>{label}</div>
                      <div style={{ fontSize:11, color:N.t3, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{desc}</div>
                    </div>
                    <ChevronRight size={12} color={isActive?'rgba(0,102,255,0.5)':N.t3} />
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
      <nav style={{ flexShrink:0, zIndex:100, background:'rgba(8,9,11,0.97)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', borderTop:`1px solid ${N.bdr}`, paddingTop:6, paddingBottom:'max(10px,env(safe-area-inset-bottom))', paddingLeft:'max(4px,env(safe-area-inset-left))', paddingRight:'max(4px,env(safe-area-inset-right))' }}>
        <div style={{ display:'flex', maxWidth:480, margin:'0 auto' }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = navActive(id)
            return (
              <button key={id} onClick={() => go(id)} aria-label={label} style={{ flex:1, minHeight:50, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'4px 4px 6px', border:'none', background:'transparent', cursor:'pointer', transition:'all 0.15s', borderRadius:8, fontFamily:N.f, WebkitTapHighlightColor:'transparent', position:'relative' }}>
                <Icon size={21} color={isActive?N.blue:N.t3} strokeWidth={isActive?2.2:1.8} />
                <span style={{ fontSize:10, fontWeight:isActive?600:400, color:isActive?N.blue:N.t3, letterSpacing:'0.01em', lineHeight:1 }}>{label}</span>
                {isActive && <span style={{ position:'absolute', bottom:'max(8px,env(safe-area-inset-bottom))', width:3, height:3, borderRadius:'50%', background:N.blue }} />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
