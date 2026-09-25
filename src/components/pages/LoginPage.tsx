import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Mail, Chrome, Wallet, ArrowLeft, Loader } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { NanLogo } from '../ui/Logo'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const SURFACE = '#F5F5F5'
const BORDER = 'rgba(0,0,0,0.1)'
const TEXT2 = '#6B6B6B'
const TEXT3 = '#A0A0A0'

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

  // Handle Google OAuth redirect
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('google-auth=')) {
      const params = new URLSearchParams(hash.slice(1))
      const token = params.get('google-auth')
      const emailParam = params.get('email')
      if (token && emailParam) {
        window.location.hash = ''
        setAuth({ email: emailParam, sessionToken: token, walletAddress: '', walletId: '' })
        if (!onboarding.completed) {
          setActiveView('onboarding')
        } else {
          setActiveView('home')
        }
      }
    }
  }, [onboarding.completed, setAuth, setActiveView])

  // Wallet connect auto-advance
  useEffect(() => {
    if (isConnected && address) {
      setAuth({ email: '', sessionToken: 'wallet', walletAddress: address, walletId: address })
      if (!onboarding.completed) {
        setActiveView('onboarding')
      } else {
        setActiveView('home')
      }
    }
  }, [isConnected, address, onboarding.completed, setAuth, setActiveView, setOnboarding])

  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'send' }),
      })
      if (!res.ok) throw new Error('Failed to send code')
      setOtpSent(true)
      setMode('otp')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (!otp.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp, action: 'verify' }),
      })
      const data = await res.json() as { success?: boolean; sessionToken?: string; devCode?: string }
      if (!res.ok || !data.success) throw new Error('Invalid code')
      setAuth({ email, sessionToken: data.sessionToken ?? 'email-auth', walletAddress: '', walletId: '' })
      if (!onboarding.completed) {
        setActiveView('onboarding')
      } else {
        setActiveView('home')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  const googleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) {
      setError('Google login not configured. Add VITE_GOOGLE_CLIENT_ID to environment variables.')
      return
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${window.location.origin}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state: Math.random().toString(36).slice(2),
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#FFF', fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
          <NanLogo size="lg" />
          <p style={{ fontSize: 14, color: TEXT2, marginTop: 10, fontWeight: 400 }}>
            The intelligent payment layer
          </p>
        </div>

        {/* ── Choose method ── */}
        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Wallet */}
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} style={btnStyle('#0D0D0D', '#FFF')}>
                  <Wallet size={18} />
                  <span>Continue with Wallet</span>
                </button>
              )}
            </ConnectKitButton.Custom>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ fontSize: 12, color: TEXT3, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            {/* Google */}
            <button onClick={googleLogin} style={btnStyle('#FFF', BLACK, BORDER)}>
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            {/* Email */}
            <button onClick={() => setMode('email')} style={btnStyle(SURFACE, BLACK, BORDER)}>
              <Mail size={18} />
              <span>Continue with Email</span>
            </button>

            <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              By continuing you agree to Paywell's Terms of Service and Privacy Policy.
            </p>
          </div>
        )}

        {/* ── Email entry ── */}
        {mode === 'email' && (
          <div>
            <button onClick={() => { setMode('choose'); setError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
              <ArrowLeft size={15} /> Back
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6, color: BLACK }}>Enter your email</h2>
            <p style={{ fontSize: 14, color: TEXT2, marginBottom: 24 }}>We'll send you a one-time code to sign in.</p>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void sendOtp()}
              autoFocus
              style={inputStyle}
            />
            {error && <p style={errStyle}>{error}</p>}
            <button
              onClick={() => void sendOtp()}
              disabled={loading || !email.trim()}
              style={{ ...btnStyle(loading || !email.trim() ? SURFACE : BLACK, loading || !email.trim() ? TEXT3 : '#FFF'), marginTop: 12, cursor: loading || !email.trim() ? 'not-allowed' : 'pointer' }}
            >
              {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Sending…' : 'Send code →'}
            </button>
          </div>
        )}

        {/* ── OTP entry ── */}
        {mode === 'otp' && (
          <div>
            <button onClick={() => { setMode('email'); setError(''); setOtp('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
              <ArrowLeft size={15} /> Back
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6, color: BLACK }}>Check your email</h2>
            <p style={{ fontSize: 14, color: TEXT2, marginBottom: 24 }}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            {otpSent && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#166534' }}>
                Code sent. Check your inbox (or server console in dev mode).
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && otp.length === 6 && void verifyOtp()}
              autoFocus
              style={{ ...inputStyle, textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.3em' }}
            />
            {error && <p style={errStyle}>{error}</p>}
            <button
              onClick={() => void verifyOtp()}
              disabled={loading || otp.length !== 6}
              style={{ ...btnStyle(loading || otp.length !== 6 ? SURFACE : BLACK, loading || otp.length !== 6 ? TEXT3 : '#FFF'), marginTop: 12, cursor: loading || otp.length !== 6 ? 'not-allowed' : 'pointer' }}
            >
              {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Verifying…' : 'Verify →'}
            </button>
            <button
              onClick={() => void sendOtp()}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

function btnStyle(bg: string, color: string, borderColor?: string): React.CSSProperties {
  return {
    width: '100%', padding: '14px 20px',
    background: bg, color,
    border: borderColor ? `1px solid ${borderColor}` : 'none',
    borderRadius: 14, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: F,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    transition: 'opacity 0.15s',
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px',
  border: '1.5px solid rgba(0,0,0,0.12)',
  borderRadius: 12, fontSize: 16, fontFamily: F,
  color: '#0D0D0D', background: '#FFF', outline: 'none',
  boxSizing: 'border-box',
}

const errStyle: React.CSSProperties = {
  fontSize: 13, color: '#DC2626', marginTop: 8,
}
