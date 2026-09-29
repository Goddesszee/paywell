import React from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowUpRight, ArrowDownLeft, ArrowUpDown, CreditCard, Bot, ChevronRight } from 'lucide-react'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const ARC  = 5042002
const BG   = '#08090B'
const SURF = '#13151A'
const SURF2= '#1A1D24'
const BDR  = 'rgba(255,255,255,0.07)'
const BLUE = '#0066FF'
const TEXT = '#F2F3F5'
const T2   = '#8A8F9E'
const T3   = '#50556A'
const GREEN= '#00C853'
const RED  = '#FF3B3B'

function QuickAction({ Icon, label, onClick, primary = false }: {
  Icon: React.ElementType; label: string; onClick: () => void; primary?: boolean
}) {
  return (
    <button onClick={onClick} style={{
      background: primary ? 'rgba(0,102,255,0.10)' : SURF,
      border: `1px solid ${primary ? 'rgba(0,102,255,0.22)' : BDR}`,
      borderRadius: 14, padding: '13px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      cursor: 'pointer', transition: 'all 0.15s', fontFamily: F, flex: 1,
      WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: primary ? BLUE : SURF2,
        border: `1px solid ${primary ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={primary ? '#fff' : T2} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: primary ? BLUE : T2, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  )
}

function TxRow({ item }: { item: ActivityItem }) {
  const isIn = item.sign === '+'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 0', borderBottom: `1px solid ${BDR}`,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: item.agentInitiated ? 'rgba(0,102,255,0.08)' : isIn ? 'rgba(0,200,83,0.08)' : 'rgba(255,59,59,0.08)',
        border: `1px solid ${item.agentInitiated ? 'rgba(0,102,255,0.15)' : isIn ? 'rgba(0,200,83,0.15)' : 'rgba(255,59,59,0.15)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 16 }}>{item.agentInitiated ? '🤖' : isIn ? '↓' : '↑'}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.description}
        </div>
        <div style={{ fontSize: 12, color: T3, marginTop: 2, fontFamily: MONO }}>
          {item.counterparty && <span>{item.counterparty} · </span>}
          {new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: isIn ? GREEN : RED, flexShrink: 0 }}>
        {item.sign}{item.amount} USDC
      </span>
    </div>
  )
}

export function HomePage() {
  const { address, isConnected } = useAccount()
  const { activity, agentPermissions, agentDailyUsed, setActiveView } = useAppStore()
  const usdcFact = getUsdc(ARC)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })

  const formatted = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC)).toFixed(2)
    : null

  const total    = formatted ? parseFloat(formatted) : 0
  const daily    = agentPermissions.dailyLimit
  const available= Math.max(0, total - daily)
  const remaining= Math.max(0, daily - agentDailyUsed)
  const pct      = daily > 0 ? (agentDailyUsed / daily) * 100 : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const recent = activity.slice(0, 5)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F }}>

      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: T3, fontWeight: 500, marginBottom: 2 }}>{greeting}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: '-0.025em' }}>
          {address ? address.slice(0,6)+'…'+address.slice(-4) : 'Welcome to NAN'}
        </div>
      </div>

      {/* Balance card */}
      <div style={{
        background: 'linear-gradient(145deg,#0E1014 0%,#13151A 60%,#0D0F13 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20, padding: '22px 22px 18px',
        marginBottom: 12, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position:'absolute',top:-30,right:-30,width:160,height:160,borderRadius:'50%',background:'radial-gradient(circle,rgba(0,102,255,0.16) 0%,transparent 65%)',pointerEvents:'none' }} />
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6, fontFamily: MONO }}>Total Balance</div>
        {isLoading ? (
          <div style={{ height: 48, width: 160, background: 'rgba(255,255,255,0.06)', borderRadius: 8, marginBottom: 12, animation: 'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: 12, fontFamily: F }}>
            {formatted ?? '0.00'}<span style={{ fontSize: 18, color: 'rgba(255,255,255,0.40)', fontWeight: 500, marginLeft: 6 }}>USDC</span>
          </div>
        )}
        {!isConnected && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontFamily: MONO }}>Connect wallet to see balance</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[{ label:'Available', val:`${available.toFixed(2)} USDC` },{ label:'Agent', val:`${daily} USDC` }].map(({label,val}) => (
            <div key={label} style={{ display:'flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.10)',borderRadius:100,padding:'4px 10px',fontFamily:MONO,fontSize:11,color:'rgba(255,255,255,0.75)' }}>
              <span style={{ width:5,height:5,borderRadius:'50%',background:'rgba(255,255,255,0.4)',flexShrink:0 }} />
              <span style={{ color:'rgba(255,255,255,0.40)' }}>{label}: </span>{val}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        <QuickAction Icon={CreditCard}    label="Buy"     onClick={() => setActiveView('onramp')} />
        <QuickAction Icon={ArrowUpDown}   label="Swap"    onClick={() => setActiveView('swap')} />
        <QuickAction Icon={ArrowUpRight}  label="Send"    onClick={() => setActiveView('send')} primary />
        <QuickAction Icon={ArrowDownLeft} label="Receive" onClick={() => setActiveView('receive')} />
      </div>

      {/* Agent spending */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, padding:'16px 18px', marginBottom:14 }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <div style={{ width:28,height:28,borderRadius:8,background:'rgba(0,102,255,0.12)',border:'1px solid rgba(0,102,255,0.20)',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <Bot size={14} color={BLUE} />
            </div>
            <span style={{ fontSize:13,fontWeight:700,color:TEXT }}>Agent Spending</span>
          </div>
          <span style={{ fontSize:11,fontWeight:600,color:BLUE,background:'rgba(0,102,255,0.10)',border:'1px solid rgba(0,102,255,0.18)',padding:'2px 8px',borderRadius:20 }}>Active</span>
        </div>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
          {[{label:'Daily limit',val:`${daily}`},{label:'Used today',val:`${agentDailyUsed}`},{label:'Remaining',val:`${remaining.toFixed(2)}`}].map(({label,val}) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:15,fontWeight:700,color:TEXT,fontFamily:MONO }}>{val} <span style={{ fontSize:10,color:T3 }}>USDC</span></div>
              <div style={{ fontSize:11,color:T3,marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden',marginBottom:12 }}>
          <div style={{ width:`${Math.min(pct,100)}%`,height:'100%',background:pct>80?RED:BLUE,borderRadius:2,transition:'width 0.5s ease' }} />
        </div>
        <button onClick={() => setActiveView('agent')} style={{
          width:'100%',padding:'9px',borderRadius:9,
          background:'rgba(0,102,255,0.08)',border:'1px solid rgba(0,102,255,0.18)',
          color:BLUE,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:F,
          display:'flex',alignItems:'center',justifyContent:'center',gap:6,
        }}>
          Open Agent <ChevronRight size={14} />
        </button>
      </div>

      {/* Recent activity */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px 0' }}>
          <span style={{ fontSize:13,fontWeight:700,color:TEXT }}>Recent Activity</span>
          <button onClick={() => setActiveView('activity')} style={{ fontSize:12,color:BLUE,background:'none',border:'none',cursor:'pointer',fontFamily:F,display:'flex',alignItems:'center',gap:3 }}>
            View all <ChevronRight size={12} />
          </button>
        </div>
        <div style={{ padding:'4px 18px 8px' }}>
          {recent.length === 0 ? (
            <div style={{ textAlign:'center',padding:'24px 0',color:T3,fontSize:13 }}>No activity yet</div>
          ) : recent.map(item => <TxRow key={item.id} item={item} />)}
        </div>
      </div>
    </div>
  )
}
