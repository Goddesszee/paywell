import React, { useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingCart, CreditCard, Building2, Smartphone, AlertCircle, Check } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface)'
const SURF2 = 'var(--nan-surface2)'
const BDR   = 'var(--nan-bdr)'
const BLUE  = '#0066FF'
const TEXT  = 'var(--nan-text)'
const T2    = 'var(--nan-text2)'
const T3    = 'var(--nan-text3)'

const PRESETS = [20, 50, 100, 200]
const METHODS = [
  { id:'Debit',        label:'Debit Card',    Icon: CreditCard },
  { id:'ApplePay',     label:'Apple Pay',     Icon: Smartphone },
  { id:'GooglePay',    label:'Google Pay',    Icon: Smartphone },
  { id:'BankTransfer', label:'Bank Transfer', Icon: Building2 },
]

export function OnrampPage() {
  const { address, isConnected } = useAccount()
  const _setActiveView = useAppStore(s => s.setActiveView)
  const [amount, setAmount] = useState(100)
  const [custom, setCustom] = useState('100')
  const [method, setMethod] = useState('Debit')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const setAmt = (v: number) => { setAmount(v); setCustom(String(v)) }
  const onCustom = (v: string) => { setCustom(v); const n = parseFloat(v); if (!isNaN(n) && n > 0) setAmount(n) }

  const handleBuy = async () => {
    if (!isConnected || !address) { setError('Connect your wallet first'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/onramp-session', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ appUserId:address, destinationAddress:address, amount:String(amount), paymentMethod:method, blockchain:'ARC-TESTNET' }) })
      if (!res.ok) {
        if (res.status === 503) { setError('Add CIRCLE_API_KEY to Vercel environment variables to activate onramp'); return }
        const err = await res.json().catch(() => ({ message:`HTTP ${res.status}` }))
        throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`)
      }
      const session = await res.json() as Record<string, unknown>
      const widgetUrl = session.widgetUrl as string | undefined
      if (!widgetUrl) throw new Error('No widget URL returned from Circle')
      window.open(widgetUrl, '_blank', 'noopener,noreferrer')
      setLaunched(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to launch onramp') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ fontFamily: F, maxWidth: 480, margin: '0 auto', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 20px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <ShoppingCart size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>Buy USDC</div>
          <div style={{ fontSize:12, color:T2 }}>Powered by Circle · lands on Arc Testnet</div>
        </div>
      </div>

      {/* Destination */}
      {isConnected && address ? (
        <div style={{ marginBottom:16, padding:14, background:SURF, borderRadius:12, border:`1px solid ${BDR}` }}>
          <div style={{ fontSize:11, fontWeight:600, color:T2, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:4 }}>Destination Wallet</div>
          <div style={{ fontSize:13, fontWeight:600, color:TEXT, fontFamily:'monospace' }}>{address.slice(0,10)}...{address.slice(-8)}</div>
          <div style={{ fontSize:12, color:T2, marginTop:2 }}>Arc Testnet · USDC</div>
        </div>
      ) : (
        <div style={{ marginBottom:16, padding:14, background:`rgba(0,102,255,0.06)`, borderRadius:12, border:`1px solid rgba(0,102,255,0.15)`, display:'flex', gap:8, alignItems:'flex-start' }}>
          <AlertCircle size={15} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
          <p style={{ color:T2, fontSize:13, margin:0 }}>Connect your wallet on the Home screen first</p>
        </div>
      )}

      {/* Amount */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T2, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:8 }}>Amount (USD)</div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 16px', height:56, borderRadius:14, border:`1px solid ${BDR}`, background:SURF2 }}>
          <span style={{ fontSize:20, fontWeight:700, color:T2 }}>$</span>
          <input type="number" value={custom} onChange={e => onCustom(e.target.value)} min={1}
            style={{ flex:1, border:'none', outline:'none', fontSize:24, fontWeight:700, color:TEXT, background:'transparent', fontFamily:F }} />
          <span style={{ fontSize:14, fontWeight:600, color:T2 }}>USD</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:10 }}>
          {PRESETS.map(a => (
            <button key={a} onClick={() => setAmt(a)} style={{ height:40, borderRadius:10, background:amount===a?BLUE:SURF, color:amount===a?'#fff':T2, border:`1px solid ${amount===a?BLUE:BDR}`, fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:F, transition:'all 0.15s' }}>${a}</button>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T2, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:8 }}>Payment Method</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {METHODS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setMethod(id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, background:method===id?BLUE:SURF, color:method===id?'#fff':T2, border:`1px solid ${method===id?BLUE:BDR}`, fontWeight:500, fontSize:13, cursor:'pointer', fontFamily:F, transition:'all 0.15s' }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display:'flex', gap:10, padding:14, background:'rgba(255,68,68,0.08)', borderRadius:12, border:'1px solid rgba(255,68,68,0.20)', marginBottom:16 }}>
          <AlertCircle size={16} color="#FF4444" style={{ flexShrink:0, marginTop:1 }} />
          <p style={{ color:'#FF4444', fontSize:13, margin:0, lineHeight:1.4 }}>{error}</p>
        </div>
      )}

      <div ref={containerRef} style={{ display:'none' }} />

      {/* Post-launch */}
      {launched ? (
        <div style={{ textAlign:'center', padding:'28px 16px', background:SURF, borderRadius:16, marginBottom:20, border:`1px solid rgba(0,200,83,0.20)` }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,200,83,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <Check size={22} color="#00C853" />
          </div>
          <p style={{ fontWeight:700, fontSize:16, color:TEXT, marginBottom:6 }}>Circle Onramp Opened</p>
          <p style={{ fontSize:13, color:T2, marginBottom:20, lineHeight:1.5 }}>Complete your purchase in the new tab. USDC will arrive in your wallet on Arc Testnet.</p>
          <button onClick={() => setLaunched(false)} style={{ padding:'11px 24px', borderRadius:12, background:BLUE, color:'#fff', border:'none', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:F }}>Buy more USDC</button>
        </div>
      ) : (
        <button onClick={() => { void handleBuy() }} disabled={loading || !isConnected} style={{ width:'100%', height:54, borderRadius:14, background:loading||!isConnected?SURF:BLUE, color:loading||!isConnected?T2:'#fff', border:'none', cursor:loading||!isConnected?'not-allowed':'pointer', fontSize:15, fontWeight:700, fontFamily:F, display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'all 0.15s' }}>
          {loading ? 'Loading…' : `Buy $${amount} USDC →`}
        </button>
      )}

      <p style={{ textAlign:'center', fontSize:12, color:T3, marginTop:14, lineHeight:1.5 }}>
        Powered by Circle · KYC & compliance handled
      </p>
    </div>
  )
}
