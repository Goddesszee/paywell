import React, { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { Button } from '../ui/Button'
import { CircleEmailLogin } from '../CircleEmailLogin'
import { ArrowRight, Check } from 'lucide-react'

const F    = "'Inter', -apple-system, sans-serif"
const BG   = 'var(--nan-bg)'
const SURF = 'var(--nan-surface)'
const SURF2= 'var(--nan-surface2)'
const BDR  = 'var(--nan-bdr)'
const BLUE = '#0066FF'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'

const USE_CASES = [
  { id: 'payments',  label: 'Send & Receive',   icon: '↕',  desc: 'Everyday USDC transfers' },
  { id: 'shopping',  label: 'Shop',              icon: '◻',  desc: 'Browse the marketplace' },
  { id: 'agent',     label: 'AI Agent',          icon: '◈',  desc: 'Autonomous purchases' },
  { id: 'receiving', label: 'Accept Payments',   icon: '↓',  desc: 'Receive USDC from anyone' },
  { id: 'merchant',  label: 'Sell as Merchant',  icon: '⊞',  desc: 'List products, earn USDC' },
]

function fmt(addr?: string) { return addr ? addr.slice(0,6)+'…'+addr.slice(-4) : '' }

export function OnboardingPage() {
  const { address, isConnected } = useAccount()
  const { setOnboarding, agentPermissions, setAgentPermissions, setActiveView, profile } = useAppStore()
  const [step, setStep] = useState<'connect'|'usecases'|'agent'|'limits'>('connect')
  const [selected, setSelected] = useState<string[]>([])
  const [dailyLimit, setDailyLimit] = useState(String(agentPermissions.dailyLimit))
  const [perTxLimit, setPerTxLimit] = useState(String(agentPermissions.perTxLimit))

  const toggle = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const finish = () => {
    setOnboarding({ completed: true, useCases: selected, agentConfigured: step === 'limits' })
    setActiveView(profile.displayName ? 'home' : 'name')
  }

  const prevConn = React.useRef(false)
  React.useLayoutEffect(() => {
    if (isConnected && !prevConn.current && step === 'connect') {
      prevConn.current = true
      setTimeout(() => setStep('usecases'), 0)
    }
    if (!isConnected) prevConn.current = false
  })

  const stepNum = step==='connect'?1:step==='usecases'?2:step==='agent'?3:4

  return (
    <div style={{
      minHeight: '100dvh', background: BG, color: TEXT, fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <svg viewBox="0 0 324 480" width="16" height="22" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: TEXT }}>nan</span>
          <p style={{ color: T2, fontSize: 13, marginTop: 6 }}>The intelligent payment layer</p>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
            {[1,2,3,4].map(n => (
              <div key={n} style={{
                width: n === stepNum ? 20 : 6, height: 6, borderRadius: 3,
                background: n <= stepNum ? BLUE : 'rgba(255,255,255,0.10)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Connect ── */}
        {step === 'connect' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: T3, marginBottom: 8, fontWeight: 600 }}>Step 01</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 8, color: TEXT }}>Welcome to NAN</h2>
            <p style={{ color: T2, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Sign in with your email — a Circle wallet is created automatically on Arc Testnet.
            </p>
            <CircleEmailLogin onSuccess={() => { setStep('usecases') }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: BDR }} />
              <span style={{ fontSize: 12, color: T3 }}>or connect a wallet</span>
              <div style={{ flex: 1, height: 1, background: BDR }} />
            </div>
            <ConnectKitButton.Custom>
              {({ isConnected: ck, show, truncatedAddress }) => (
                <button onClick={show} style={{
                  width: '100%', padding: '12px 20px',
                  background: SURF, color: TEXT,
                  border: `1px solid ${BDR}`, borderRadius: 12,
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                  {ck ? <><span style={{ width:7,height:7,borderRadius:'50%',background:'#00C853' }}/>Connected · {truncatedAddress}</> : 'Connect MetaMask / WalletConnect'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        )}

        {/* ── Step 2: Use cases ── */}
        {step === 'usecases' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: T3, marginBottom: 8, fontWeight: 600 }}>Step 02</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>What will you use NAN for?</h2>
            <p style={{ color: T2, fontSize: 13, marginBottom: 20 }}>Select all that apply.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {USE_CASES.map(({ id, label, icon, desc }) => {
                const on = selected.includes(id)
                return (
                  <button key={id} onClick={() => toggle(id)} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: on ? 'rgba(0,102,255,0.10)' : SURF,
                    border: `1px solid ${on ? 'rgba(0,102,255,0.25)' : BDR}`,
                    transition: 'all 0.15s', fontFamily: F, color: TEXT,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0, color: on ? BLUE : T2 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: on ? TEXT : TEXT }}>{label}</div>
                      <div style={{ fontSize: 12, color: T2 }}>{desc}</div>
                    </div>
                    {on && (
                      <span style={{ width:20,height:20,borderRadius:'50%',background:BLUE,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',flexShrink:0 }}>
                        <Check size={11} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <Button fullWidth onClick={() => setStep('agent')} disabled={selected.length === 0}>
              Continue <ArrowRight size={15} />
            </Button>
          </div>
        )}

        {/* ── Step 3: Agent ── */}
        {step === 'agent' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: T3, marginBottom: 8, fontWeight: 600 }}>Step 03</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 8, color: TEXT }}>Set up your AI Agent?</h2>
            <p style={{ color: T2, fontSize: 14, lineHeight: 1.65, marginBottom: 28 }}>
              NAN's AI agent can find products, execute recurring payments, and purchase items within limits you control.
            </p>
            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <Button fullWidth onClick={() => setStep('limits')}>Yes, set up my agent</Button>
              <Button fullWidth variant="ghost" onClick={finish}>Set up later</Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Limits ── */}
        {step === 'limits' && (
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.07em', textTransform: 'uppercase', color: T3, marginBottom: 8, fontWeight: 600 }}>Step 04</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 8, color: TEXT }}>Configure spending limits</h2>
            <p style={{ color: T2, fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
              Your agent will never exceed these. Change them anytime in Settings.
            </p>

            {/* Daily limit */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T2, marginBottom: 8, fontWeight: 600 }}>Daily limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[10,20,50,100].map(v => (
                  <button key={v} onClick={() => setDailyLimit(String(v))} style={{
                    flex:1, padding:'9px 0', borderRadius:9, cursor:'pointer',
                    background: dailyLimit===String(v) ? BLUE : SURF2,
                    border: `1px solid ${dailyLimit===String(v)?BLUE:'rgba(255,255,255,0.08)'}`,
                    color: dailyLimit===String(v)?'#fff':T2,
                    fontSize:14, fontWeight:700, fontFamily:F, transition:'all 0.15s',
                  }}>{v}</button>
                ))}
              </div>
              <input type="number" min="1" placeholder="Or enter custom…"
                value={![10,20,50,100].map(String).includes(dailyLimit)?dailyLimit:''}
                onChange={e => setDailyLimit(e.target.value)}
                style={{ width:'100%',padding:'10px 14px',borderRadius:10,fontSize:14,fontFamily:F,border:`1px solid ${BDR}`,background:SURF,color:TEXT,outline:'none',boxSizing:'border-box' as const }} />
            </div>

            {/* Per-tx limit */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T2, marginBottom: 8, fontWeight: 600 }}>Per-transaction limit (USDC)</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[5,10,25,50].map(v => (
                  <button key={v} onClick={() => setPerTxLimit(String(v))} style={{
                    flex:1, padding:'9px 0', borderRadius:9, cursor:'pointer',
                    background: perTxLimit===String(v) ? BLUE : SURF2,
                    border: `1px solid ${perTxLimit===String(v)?BLUE:'rgba(255,255,255,0.08)'}`,
                    color: perTxLimit===String(v)?'#fff':T2,
                    fontSize:14, fontWeight:700, fontFamily:F, transition:'all 0.15s',
                  }}>{v}</button>
                ))}
              </div>
              <input type="number" min="1" placeholder="Or enter custom…"
                value={![5,10,25,50].map(String).includes(perTxLimit)?perTxLimit:''}
                onChange={e => setPerTxLimit(e.target.value)}
                style={{ width:'100%',padding:'10px 14px',borderRadius:10,fontSize:14,fontFamily:F,border:`1px solid ${BDR}`,background:SURF,color:TEXT,outline:'none',boxSizing:'border-box' as const }} />
            </div>

            {/* Summary */}
            <div style={{ background:SURF2, border:`1px solid ${BDR}`, borderRadius:12, padding:'14px 16px', marginBottom:24 }}>
              {[
                {label:'Daily limit', val:`${dailyLimit} USDC`},
                {label:'Per transaction', val:`${perTxLimit} USDC`},
                {label:'Approval mode', val:'Ask before each purchase'},
              ].map(({label,val}) => (
                <div key={label} style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:`1px solid rgba(255,255,255,0.05)`,fontSize:13 }}>
                  <span style={{ color:T2 }}>{label}</span>
                  <span style={{ fontWeight:600,color:TEXT }}>{val}</span>
                </div>
              ))}
            </div>

            <Button fullWidth onClick={() => {
              setAgentPermissions({ dailyLimit:parseFloat(dailyLimit)||20, perTxLimit:parseFloat(perTxLimit)||10 })
              finish()
            }}>
              Launch NAN →
            </Button>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: T3 }}>
        {isConnected ? `✓ ${fmt(address)}` : 'Powered by Arc · Circle USDC · Testnet'}
      </p>
    </div>
  )
}
