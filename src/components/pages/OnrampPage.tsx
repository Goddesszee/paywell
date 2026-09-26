import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import { CreditCard, ArrowRight, CheckCircle, AlertCircle, Loader } from 'lucide-react'

const T  = '#0D0D0D'
const T2 = '#6B6B6B'
const T3 = '#A0A0A0'
const W  = '#FFFFFF'
const G  = '#F7F7F8'
const B  = 'rgba(0,0,0,0.08)'
const F  = "'Inter', -apple-system, sans-serif"

type Step = 'idle' | 'loading' | 'widget' | 'success' | 'error' | 'not_configured'

interface OnrampSession {
  sessionToken?: string
  widgetUrl?: string
  sessionId?: string
  [key: string]: unknown
}

export function OnrampPage() {
  const { address, isConnected } = useAccount()
  const [step, setStep] = useState<Step>('idle')
  const [amount, setAmount] = useState('50')
  const [session, setSession] = useState<OnrampSession | null>(null)
  const [error, setError] = useState('')
  const [settled, setSettled] = useState<{ amount: string } | null>(null)

  const startOnramp = async () => {
    if (!address) return
    setStep('loading')
    setError('')

    try {
      const res = await fetch('/api/onramp-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationAddress: address, userId: address, amount }),
      })
      const data = await res.json() as OnrampSession & { error?: string; message?: string }

      if (res.status === 503 || data.error === 'onramp_not_configured') {
        setStep('not_configured')
        return
      }
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Failed to start onramp')
        setStep('error')
        return
      }

      setSession(data)
      setStep('widget')
    } catch {
      setError('Network error — please try again')
      setStep('error')
    }
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

  if (step === 'success' && settled) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={28} color="#1a8047" />
        </div>
        <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: T, marginBottom: 8 }}>USDC is on its way</h2>
        <p style={{ fontFamily: F, fontSize: 14, color: T2, lineHeight: 1.6, marginBottom: 6 }}>
          {settled.amount} USDC will arrive in your wallet after settlement.
        </p>
        <p style={{ fontFamily: F, fontSize: 12, color: T3, marginBottom: 28 }}>
          Settlement typically takes 1–3 minutes.
        </p>
        <button onClick={() => { setStep('idle'); setSession(null); setSettled(null) }} style={{
          fontFamily: F, fontWeight: 600, fontSize: 14, height: 46, padding: '0 22px',
          borderRadius: 11, border: 'none', background: T, color: W, cursor: 'pointer',
        }}>Buy more USDC</button>
      </div>
    )
  }

  if (step === 'not_configured') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{
          padding: '20px', borderRadius: 16, background: G,
          border: `1px solid ${B}`, textAlign: 'center',
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <CreditCard size={20} color={W} />
          </div>
          <h3 style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: T, marginBottom: 8 }}>
            Fiat Onramp — Coming Soon
          </h3>
          <p style={{ fontFamily: F, fontSize: 13, color: T2, lineHeight: 1.6, marginBottom: 16 }}>
            The Circle Onramp Kit is in private beta. To activate it:
          </p>
          <div style={{ textAlign: 'left', background: W, borderRadius: 10, padding: '14px', border: `1px solid ${B}`, marginBottom: 16 }}>
            {[
              'Get a Kit Key from console.circle.com',
              'Add CIRCLE_STABLECOIN_KIT_API_KEY to Netlify Environment Variables',
              'Redeploy your site',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 2 ? 10 : 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: T, color: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontFamily: F, fontSize: 12.5, color: T2, lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setStep('idle')} style={{
            fontFamily: F, fontWeight: 600, fontSize: 13, height: 40, padding: '0 18px',
            borderRadius: 9, border: `1px solid ${B}`, background: W, color: T, cursor: 'pointer',
          }}>← Back</button>
        </div>
      </div>
    )
  }

  if (step === 'widget' && session) {
    // The widget iframe — in full kit this would be mountIframe
    // For now we open the widgetUrl in a new tab until the npm package is available
    const widgetUrl = session.widgetUrl
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px' }}>
        <h2 style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: T, marginBottom: 6 }}>Complete your purchase</h2>
        <p style={{ fontFamily: F, fontSize: 13, color: T2, marginBottom: 20 }}>
          The Circle-hosted checkout handles payment and KYC securely.
        </p>
        {widgetUrl ? (
          <div>
            <iframe
              src={widgetUrl}
              title="Buy USDC"
              style={{ width: '100%', minHeight: 560, border: 'none', borderRadius: 14 }}
              allow="camera; microphone; payment; clipboard-write"
            />
            <button onClick={() => setStep('success')} style={{
              marginTop: 14, width: '100%', fontFamily: F, fontWeight: 600, fontSize: 14,
              height: 46, borderRadius: 11, border: 'none', background: '#1a8047', color: W, cursor: 'pointer',
            }}>
              I've completed payment
            </button>
          </div>
        ) : (
          <div style={{ padding: '20px', background: G, borderRadius: 12, border: `1px solid ${B}`, textAlign: 'center' }}>
            <p style={{ fontFamily: F, fontSize: 13, color: T2, marginBottom: 16 }}>
              Session created. Open the secure Circle checkout to complete your purchase.
            </p>
            <p style={{ fontFamily: F, fontSize: 11, color: T3, marginBottom: 16, wordBreak: 'break-all' }}>
              Session ID: {session.sessionId as string}
            </p>
            <button onClick={() => setStep('idle')} style={{
              fontFamily: F, fontWeight: 600, fontSize: 13, height: 40, padding: '0 18px',
              borderRadius: 9, border: `1px solid ${B}`, background: W, color: T, cursor: 'pointer',
            }}>← Back</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: T, marginBottom: 4 }}>Buy USDC</h2>
        <p style={{ fontFamily: F, fontSize: 13.5, color: T2 }}>
          Top up your wallet with card, Apple Pay, Google Pay or bank transfer.
        </p>
      </div>

      {/* Destination */}
      <div style={{ padding: '12px 14px', background: G, borderRadius: 12, border: `1px solid ${B}`, marginBottom: 16 }}>
        <div style={{ fontFamily: F, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, marginBottom: 4 }}>Destination wallet</div>
        <div style={{ fontFamily: "'JetBrains Mono', 'Menlo', monospace", fontSize: 13, color: T, wordBreak: 'break-all' }}>
          {address?.slice(0, 10)}...{address?.slice(-6)}
        </div>
        <div style={{ fontFamily: F, fontSize: 11, color: T3, marginTop: 2 }}>Arc Testnet · USDC</div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontFamily: F, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, display: 'block', marginBottom: 6 }}>
          Amount (USD)
        </label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontSize: 16, fontWeight: 600, color: T2 }}>$</span>
          <input
            type="number"
            min="10"
            max="10000"
            step="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: '100%', height: 50, borderRadius: 12, border: `1.5px solid ${B}`,
              background: W, paddingLeft: 30, paddingRight: 60,
              fontFamily: F, fontSize: 18, fontWeight: 700, color: T, outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontFamily: F, fontSize: 12, fontWeight: 600, color: T3 }}>USD</span>
        </div>

        {/* Quick amounts */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {['20', '50', '100', '200'].map(a => (
            <button key={a} onClick={() => setAmount(a)} style={{
              flex: 1, height: 34, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${amount === a ? T : B}`,
              background: amount === a ? T : W,
              color: amount === a ? W : T2,
              cursor: 'pointer',
            }}>${a}</button>
          ))}
        </div>
      </div>

      {/* Payment methods */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: F, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: T3, marginBottom: 8 }}>Payment methods</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Debit Card', 'Apple Pay', 'Google Pay', 'Bank Transfer'].map(m => (
            <div key={m} style={{
              padding: '6px 10px', borderRadius: 8, border: `1px solid ${B}`,
              fontFamily: F, fontSize: 11, fontWeight: 500, color: T2,
              background: G, flexShrink: 0,
            }}>{m}</div>
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
          <><Loader size={16} className="animate-spin" /> Opening checkout...</>
        ) : (
          <>Buy ${amount} USDC <ArrowRight size={15} /></>
        )}
      </button>

      <p style={{ fontFamily: F, fontSize: 11, color: T3, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
        Powered by Circle · KYC handled securely by Circle · USDC on Arc Testnet
      </p>
    </div>
  )
}
