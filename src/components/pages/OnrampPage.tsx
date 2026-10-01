import React, { useRef, useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingCart, CreditCard, Building2, Smartphone, AlertCircle, Check, X } from 'lucide-react'
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

// Lifecycle event types from Circle onramp widget postMessage
type OnrampEvent =
  | { event: 'INITIALIZATION_SUCCESS' }
  | { event: 'INITIALIZATION_ERROR'; code: string }
  | { event: 'DEPOSIT_SUBMITTED'; payload: { amount: string; tokenSymbol: string; paymentMethod: string } }
  | { event: 'DEPOSIT_SETTLED'; payload: { amount: string; tokenSymbol: string } }
  | { event: 'DEPOSIT_NOT_COMPLETED'; code: string }

export function OnrampPage() {
  const { address, isConnected } = useAccount()
  const _setActiveView = useAppStore(s => s.setActiveView)
  const [amount, setAmount] = useState(100)
  const [custom, setCustom] = useState('100')
  const [method, setMethod] = useState('Debit')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'widget' | 'submitted' | 'settled'>('idle')
  const [depositInfo, setDepositInfo] = useState<{ amount: string; token: string } | null>(null)
  const iframeContainerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onrampKitRef = useRef<any>(null)

  const setAmt = (v: number) => { setAmount(v); setCustom(String(v)) }
  const onCustom = (v: string) => { setCustom(v); const n = parseFloat(v); if (!isNaN(n) && n > 0) setAmount(n) }

  // Clean up onramp widget on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      if (onrampKitRef.current?.unmount) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        try { onrampKitRef.current.unmount() } catch { /* ignore */ }
      }
    }
  }, [])

  // Listen for Circle widget postMessage lifecycle events
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Accept messages from Circle onramp origins
      if (!e.origin.includes('arc.io') && !e.origin.includes('circle.com')) return
      const data = e.data as OnrampEvent
      if (!data?.event) return
      if (data.event === 'DEPOSIT_SUBMITTED') {
        const p = (data).payload
        setDepositInfo({ amount: p.amount, token: p.tokenSymbol })
        setPhase('submitted')
      }
      if (data.event === 'DEPOSIT_SETTLED') {
        const p = (data).payload
        setDepositInfo({ amount: p.amount, token: p.tokenSymbol })
        setPhase('settled')
      }
      if (data.event === 'DEPOSIT_NOT_COMPLETED') {
        const d = data
        if (d.code !== 'CANCELED_BY_CUSTOMER') {
          setError(`Onramp ended: ${d.code}`)
        }
        setPhase('idle')
      }
      if (data.event === 'INITIALIZATION_ERROR') {
        const d = data
        setError(`Widget failed to initialise: ${d.code}`)
        setPhase('idle')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleBuy = async () => {
    if (!isConnected || !address) { setError('Connect your wallet first'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/onramp-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appUserId: address, destinationAddress: address, amount: String(amount), paymentMethod: method, blockchain: 'ARC-TESTNET' }),
      })
      if (!res.ok) {
        if (res.status === 503) { setError('Add CIRCLE_STABLECOIN_KIT_API_KEY to environment variables to activate onramp'); return }
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
        throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`)
      }
      const session = await res.json() as Record<string, unknown>
      const widgetUrl = session.widgetUrl as string | undefined

      if (!widgetUrl) throw new Error('No widget URL returned from Circle')

      // Mount the iframe in-page when we have a widgetUrl and a container.
      // If the widgetUrl embeds a sessionToken, the widget postMessages lifecycle
      // events (DEPOSIT_SUBMITTED, DEPOSIT_SETTLED) back to this page — the
      // window.addEventListener('message') handler above catches them.
      if (widgetUrl && iframeContainerRef.current) {
        const container = iframeContainerRef.current
        // Clear any old iframe
        container.innerHTML = ''
        const iframe = document.createElement('iframe')
        iframe.src = widgetUrl
        iframe.allow = 'camera; microphone; payment'
        iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:16px;'
        container.appendChild(iframe)
        onrampKitRef.current = {
          unmount: () => { container.innerHTML = '' },
        }
        setPhase('widget')
      } else if (widgetUrl) {
        // No container yet — open popup fallback
        window.open(widgetUrl, '_blank', 'noopener,noreferrer')
        setPhase('submitted')
      } else {
        throw new Error('No widget URL returned from Circle')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to launch onramp') }
    finally { setLoading(false) }
  }

  const handleClose = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (onrampKitRef.current?.unmount) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      try { onrampKitRef.current.unmount() } catch { /* ignore */ }
      onrampKitRef.current = null
    }
    setPhase('idle')
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

      {/* In-page iframe container — shown when widget is mounted */}
      {phase === 'widget' && (
        <div style={{ position:'relative', marginBottom:20 }}>
          <button onClick={handleClose} style={{ position:'absolute', top:8, right:8, zIndex:10, background:SURF, border:`1px solid ${BDR}`, borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <X size={14} color={T2} />
          </button>
          <div
            ref={iframeContainerRef}
            style={{ width:'100%', minHeight:560, borderRadius:16, overflow:'hidden', border:`1px solid ${BDR}`, background:SURF2 }}
          />
        </div>
      )}

      {/* Not yet in widget mode — show the iframe mount target for later */}
      {phase === 'idle' && (
        <div ref={iframeContainerRef} style={{ display:'none' }} />
      )}

      {/* Settled confirmation */}
      {phase === 'settled' && (
        <div style={{ textAlign:'center', padding:'28px 16px', background:SURF, borderRadius:16, marginBottom:20, border:`1px solid rgba(0,200,83,0.20)` }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,200,83,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <Check size={22} color="#00C853" />
          </div>
          <p style={{ fontWeight:700, fontSize:16, color:TEXT, marginBottom:6 }}>Deposit Settled</p>
          {depositInfo && <p style={{ fontSize:13, color:T2, marginBottom:8 }}>{depositInfo.amount} {depositInfo.token} is on its way to your wallet.</p>}
          <p style={{ fontSize:12, color:T3, marginBottom:20, lineHeight:1.5 }}>USDC will arrive on Arc Testnet shortly.</p>
          <button onClick={() => { setPhase('idle'); setDepositInfo(null) }} style={{ padding:'11px 24px', borderRadius:12, background:BLUE, color:'#fff', border:'none', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:F }}>Buy more USDC</button>
        </div>
      )}

      {/* Submitted (popup path) confirmation */}
      {phase === 'submitted' && (
        <div style={{ textAlign:'center', padding:'28px 16px', background:SURF, borderRadius:16, marginBottom:20, border:`1px solid rgba(0,102,255,0.15)` }}>
          <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(0,102,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <ShoppingCart size={22} color={BLUE} />
          </div>
          <p style={{ fontWeight:700, fontSize:16, color:TEXT, marginBottom:6 }}>Circle Onramp Opened</p>
          <p style={{ fontSize:13, color:T2, marginBottom:20, lineHeight:1.5 }}>Complete your purchase in the new tab. USDC will arrive in your wallet on Arc Testnet.</p>
          <button onClick={() => setPhase('idle')} style={{ padding:'11px 24px', borderRadius:12, background:BLUE, color:'#fff', border:'none', cursor:'pointer', fontSize:14, fontWeight:600, fontFamily:F }}>Buy more USDC</button>
        </div>
      )}

      {phase === 'idle' && (
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
