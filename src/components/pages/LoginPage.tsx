import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Mail, Wallet, ArrowLeft, Loader, ArrowRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F = "'Inter', -apple-system, sans-serif"
const BG       = '#08090B'
const SURFACE  = '#13151A'
const BORDER   = 'rgba(255,255,255,0.10)'
const BLUE     = '#0066FF'
const TEXT     = '#F2F3F5'
const TEXT2    = '#8A8F9E'
const TEXT3    = '#50556A'

type LoginMode = 'choose' | 'email' | 'otp'

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setOnboarding, onboarding, setActiveView } = useAppStore()
  const [mode, setMode] = useState<LoginMode>('choose')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('google-auth=')) {
      const params = new URLSearchParams(hash.slice(1))
      const token = params.get('google-auth')
      const emailParam = params.get('email')
      if (token && emailParam) {
        window.location.hash = ''
        setAuth({ email: emailParam, sessionToken: token, walletAddress: '', walletId: '' })
        setActiveView(onboarding.completed ? 'home' : 'onboarding')
      }
    }
  }, [onboarding.completed, setAuth, setActiveView])

  useEffect(() => {
    if (isConnected && address) {
      setAuth({ email: '', sessionToken: 'wallet', walletAddress: address, walletId: address })
      setActiveView(onboarding.completed ? 'home' : 'onboarding')
    }
  }, [isConnected, address, onboarding.completed, setAuth, setActiveView, setOnboarding])

  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send' }),
      })
      if (!res.ok) throw new Error('Failed to send code')
      setOtpSent(true); setMode('otp')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code')
    } finally { setLoading(false) }
  }

  const verifyOtp = async () => {
    if (!otp.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp, action: 'verify' }),
      })
      const data = await res.json() as { success?: boolean; sessionToken?: string }
      if (!res.ok || !data.success) throw new Error('Invalid code')
      setAuth({ email, sessionToken: data.sessionToken ?? 'email-auth', walletAddress: '', walletId: '' })
      setActiveView(onboarding.completed ? 'home' : 'onboarding')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 44 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg viewBox="0 0 324 480" width="18" height="25" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.04em', color: TEXT }}>nan</span>
          <p style={{ fontSize: 14, color: TEXT2, marginTop: 6 }}>The intelligent payment layer</p>
        </div>

        {/* Choose method */}
        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} style={btnS(BLUE, '#fff')}>
                  <Wallet size={17} /><span>Continue with Wallet</span>
                </button>
              )}
            </ConnectKitButton.Custom>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0' }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ fontSize: 12, color: TEXT3, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            <button onClick={() => setMode('email')} style={btnS(SURFACE, TEXT, BORDER)}>
              <Mail size={17} /><span>Continue with Email</span>
            </button>

            <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
              By continuing you agree to NAN's Terms of Service and Privacy Policy.
            </p>
          </div>
        )}

        {/* Email entry */}
        {mode === 'email' && (
          <div>
            <button onClick={() => { setMode('choose'); setError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>Enter your email</h2>
            <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>We'll send you a one-time code to sign in.</p>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && void sendOtp()}
              autoFocus style={inputS} />
            {error && <p style={errS}>{error}</p>}
            <button onClick={() => void sendOtp()} disabled={loading || !email.trim()}
              style={{ ...btnS(loading || !email.trim() ? SURFACE : BLUE, loading || !email.trim() ? TEXT3 : '#fff', loading || !email.trim() ? BORDER : 'none'), marginTop: 12 }}>
              {loading ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </div>
        )}

        {/* OTP entry */}
        {mode === 'otp' && (
          <div>
            <button onClick={() => { setMode('email'); setError(''); setOtp('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>Check your email</h2>
            <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>
              We sent a 6-digit code to <strong style={{ color: TEXT }}>{email}</strong>
            </p>
            {otpSent && (
              <div style={{ background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.20)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: BLUE }}>
                Code sent. Check your inbox.
              </div>
            )}
            <input type="text" inputMode="numeric" maxLength={6} placeholder="000000"
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && otp.length === 6 && void verifyOtp()}
              autoFocus
              style={{ ...inputS, textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.3em' }} />
            {error && <p style={errS}>{error}</p>}
            <button onClick={() => void verifyOtp()} disabled={loading || otp.length !== 6}
              style={{ ...btnS(loading || otp.length !== 6 ? SURFACE : BLUE, loading || otp.length !== 6 ? TEXT3 : '#fff', loading || otp.length !== 6 ? BORDER : 'none'), marginTop: 12 }}>
              {loading ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} /> : null}
              {loading ? 'Verifying…' : 'Verify →'}
            </button>
            <button onClick={() => void sendOtp()}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 13, marginTop: 14, fontFamily: F, textDecoration: 'underline' }}>
              Resend code
            </button>
          </div>
        )}
      </div>

      <p style={{ position: 'fixed', bottom: 20, fontSize: 11, color: TEXT3 }}>
        Arc · Circle USDC · Testnet
      </p>
    </div>
  )
}

function btnS(bg: string, color: string, borderColor?: string): React.CSSProperties {
  return {
    width: '100%', padding: '13px 20px',
    background: bg, color,
    border: borderColor ? `1px solid ${borderColor}` : 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: F,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    transition: 'opacity 0.15s', letterSpacing: '-0.01em',
  }
}

const inputS: React.CSSProperties = {
  width: '100%', padding: '13px 16px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12, fontSize: 16, fontFamily: F,
  color: '#F2F3F5', background: '#13151A', outline: 'none',
  boxSizing: 'border-box',
}

const errS: React.CSSProperties = { fontSize: 13, color: '#FF3B3B', marginTop: 8 }
