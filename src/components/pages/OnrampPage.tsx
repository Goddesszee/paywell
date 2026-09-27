import React, { useState, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { CreditCard, ArrowRight, CheckCircle, AlertCircle, Loader, X } from 'lucide-react'
import { AppKit } from '@circle-fin/app-kit'

const T  = '#0D0D0D'
const T2 = '#6B6B6B'
const T3 = '#A0A0A0'
const W  = '#FFFFFF'
const G  = '#F7F7F8'
const B  = 'rgba(0,0,0,0.08)'
const F  = "'Inter', -apple-system, sans-serif"

type Step = 'idle' | 'loading' | 'widget' | 'success' | 'error'

export function OnrampPage() {
  const { address, isConnected } = useAccount()
  const [step, setStep] = useState<Step>('idle')
  const [amount, setAmount] = useState('50')
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<{ close: () => void } | null>(null)
  const kitRef = useRef<AppKit | null>(null)

  useEffect(() => {
    kitRef.current = new AppKit()
    return () => {
      widgetRef.current?.close()
    }
  }, [])

  const startOnramp = async () => {
    if (!address || !containerRef.current || !kitRef.current) return
    setStep('loading')
    setError('')

    try {
      // Step 1: fetch session from our server route
      const session = await kitRef.current.onramp.fetchSession({
        url: '/api/onramp-session',
        body: {
          appUserId: address,
          destinationAddress: address,
          amount,
          currency: 'USD',
        },
      })

      setStep('widget')

      // Step 2: mount the hosted iframe widget
      widgetRef.current = kitRef.current.onramp.mountIframe({
        session,
        container: containerRef.current,
        onDepositSettled: () => {
          widgetRef.current?.close()
          setStep('success')
        },
        onDepositNotCompleted: ({ code }: { code: string }) => {
          if (code === 'CANCELED_BY_CUSTOMER') {
            widgetRef.current?.close()
            setStep('idle')
          } else {
            setError(`Payment not completed: ${code}`)
            setStep('error')
          }
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start onramp'
      setError(msg)
      setStep('error')
    }
  }

  const closeWidget = () => {
    widgetRef.current?.close()
    widgetRef.current = null
    setStep('idle')
  }

  if (!isConnected) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: G, border: `1px solid ${B}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CreditCard size={24} color={T} />
        </div>
        <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: T, marginBottom: 8 }}>Buy USDC</h2>
        <p style={{ fontFamily: F, fontSize: 14, color: T2, lineHeight: 1.6, marginBottom: 24 }}>
          Connect your wallet to buy USDC with card, Apple Pay, or bank transfer.
        </p>
        <div style={{ padding: '14px 16px', background: G, borderRadius: 12, border: `1px solid ${B}` }}>
          <p style={{ fontFamily: F, fontSize: 13, color: T3, margin: 0 }}>Connect a wallet using the button in the top bar</p>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={28} color="#1a8047" />
        </div>
        <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: T, marginBottom: 8 }}>USDC is on its way</h2>
        <p style={{ fontFamily: F, fontSize: 14, color: T2, lineHeight: 1.6, marginBottom: 6 }}>
          Your USDC will arrive in your wallet after settlement.
        </p>
        <p style={{ fontFamily: F, fontSize: 12, color: T3, marginBottom: 28 }}>Settlement typically takes 1–3 minutes.</p>
        <button onClick={() => setStep('idle')} style={{
          fontFamily: F, fontWeight: 600, fontSize: 14, height: 46, padding: '0 22px',
          borderRadius: 11, border: 'none', background: T, color: W, cursor: 'pointer',
        }}>Buy more USDC</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px' }}>
      {step !== 'widget' && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: T, marginBottom: 4 }}>Buy USDC</h2>
            <p style={{ fontFamily: F, fontSize: 13.5, color: T2 }}>
              Top up with card, Apple Pay, Google Pay or bank transfer.
            </p>
          </div>

          {/* Destination */}
          <div style={{ padding: '12px 14px', background: G, borderRadius: 12, border: `1px solid ${B}`, marginBottom: 16 }}>
            <div style={{ fontFamily: F, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, marginBottom: 4 }}>Destination wallet</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: T, wordBreak: 'break-all' }}>
              {address?.slice(0, 10)}...{address?.slice(-6)}
            </div>
            <div style={{ fontFamily: F, fontSize: 11, color: T3, marginTop: 2 }}>Arc Testnet · USDC</div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontFamily: F, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, display: 'block', marginBottom: 6 }}>Amount (USD)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontSize: 16, fontWeight: 600, color: T2 }}>$</span>
              <input
                type="number" min="10" max="10000" step="1"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={{
                  width: '100%', height: 50, borderRadius: 12, border: `1.5px solid ${B}`,
                  background: W, paddingLeft: 30, paddingRight: 60,
                  fontFamily: F, fontSize: 18, fontWeight: 700, color: T, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontSize: 12, fontWeight: 600, color: T3 }}>USD</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {['20', '50', '100', '200'].map(a => (
                <button key={a} onClick={() => setAmount(a)} style={{
                  flex: 1, height: 34, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${amount === a ? T : B}`,
                  background: amount === a ? T : W,
                  color: amount === a ? W : T2, cursor: 'pointer',
                }}>${a}</button>
              ))}
            </div>
          </div>

          {/* Payment methods */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: F, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, marginBottom: 8 }}>Payment methods</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Debit Card', 'Apple Pay', 'Google Pay', 'Bank Transfer'].map(m => (
                <div key={m} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${B}`, fontFamily: F, fontSize: 11, fontWeight: 500, color: T2, background: G }}>{m}</div>
              ))}
            </div>
          </div>

          {step === 'error' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16 }}>
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontFamily: F, fontSize: 13, color: '#dc2626', margin: 0 }}>{error}</p>
            </div>
          )}

          <button
            onClick={startOnramp}
            disabled={step === 'loading' || !amount || Number(amount) < 10}
            style={{
              width: '100%', height: 50, borderRadius: 13, fontFamily: F, fontWeight: 600, fontSize: 15,
              border: 'none', background: T, color: W, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: step === 'loading' || !amount || Number(amount) < 10 ? 0.5 : 1,
            }}
          >
            {step === 'loading' ? (
              <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Opening checkout...</>
            ) : (
              <>Buy ${amount} USDC <ArrowRight size={15} /></>
            )}
          </button>
          <p style={{ fontFamily: F, fontSize: 11, color: T3, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
            Powered by Circle · KYC handled securely · USDC on Arc Testnet
          </p>
        </>
      )}

      {/* Widget container — shown when step === 'widget' */}
      {step === 'widget' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: T, margin: 0 }}>Complete purchase</h2>
            <button onClick={closeWidget} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <X size={20} color={T2} />
            </button>
          </div>
        </div>
      )}

      {/* The iframe mounts here */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          minHeight: step === 'widget' ? 600 : 0,
          height: step === 'widget' ? 600 : 0,
          borderRadius: 14,
          overflow: 'hidden',
          border: step === 'widget' ? `1px solid ${B}` : 'none',
        }}
      />
    </div>
  )
}
