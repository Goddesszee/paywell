import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Mail, Wallet, ArrowLeft, Loader, ArrowRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F = "'Inter', -apple-system, sans-serif"
const BG      = 'var(--nan-bg)'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'
const BLUE    = '#0066FF'
const TEXT    = 'var(--nan-text)'
const TEXT2   = '#8A8F9E'
const TEXT3   = '#50556A'

type LoginMode = 'choose' | 'email' | 'otp'

// ── Google SVG icon ────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" fill="none">
      <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
      <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
      <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
      <path d="M43.611 20.083H42V20H24v8h11.303a11.966 11.966 0 01-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
    </svg>
  )
}

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setActiveView, profile } = useAppStore()
  const [mode, setMode] = useState<LoginMode>('choose')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [otpExpiry, setOtpExpiry] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [devOtp, setDevOtp] = useState('')

  // ── Google callback (hash-based redirect) ──────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('google-auth=')) {
      const params = new URLSearchParams(hash.slice(1))
      const token = params.get('google-auth')
      const emailParam = params.get('email') ?? ''
      const nameParam = params.get('name') ?? ''
      if (token) {
        window.location.hash = ''
        setAuth({ email: emailParam, sessionToken: token, walletAddress: '', walletId: '' })
        // If we got a name back and profile has no displayName yet, seed it
        if (nameParam && !profile.displayName) {
          useAppStore.getState().setProfile({ displayName: nameParam })
        }
        const hasName = profile.displayName || nameParam
        setActiveView(hasName ? 'home' : 'name')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Wallet connection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected && address) {
      setAuth({ email: '', sessionToken: 'wallet', walletAddress: address, walletId: address })
      setActiveView(profile.displayName ? 'home' : 'name')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address])

  // ── Google sign-in ────────────────────────────────────────────────────────
  const signInWithGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) {
      // Dev fallback — simulate a Google login with a mock token
      const mockToken = btoa(JSON.stringify({ email: 'demo@google.com', name: 'Demo User', exp: Date.now() + 86400000 }))
      setAuth({ email: 'demo@google.com', sessionToken: mockToken, walletAddress: '', walletId: '' })
      setActiveView(profile.displayName ? 'home' : 'name')
      return
    }
    const redirectUri = `${window.location.origin}/api/auth/google/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  // ── Email OTP ─────────────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), action: 'send' }),
      })
      const data = await res.json() as { success?: boolean; token?: string; expiresAt?: number; _devOtp?: string }
      if (!res.ok || !data.success) throw new Error('Failed to send code')
      setOtpToken(data.token ?? '')
      setOtpExpiry(data.expiresAt ?? 0)
      if (data._devOtp) setDevOtp(data._devOtp)
      setOtpSent(true)
      setMode('otp')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code')
    } finally { setLoading(false) }
  }

  const verifyOtp = async () => {
    if (otp.length !== 6) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp, token: otpToken, expiresAt: otpExpiry, action: 'verify' }),
      })
      const data = await res.json() as { success?: boolean; sessionToken?: string; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Invalid code')
      setAuth({ email: email.trim(), sessionToken: data.sessionToken ?? 'email-auth', walletAddress: '', walletId: '' })
      setActiveView(profile.displayName ? 'home' : 'name')
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

        {/* ── Choose method ─────────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Wallet */}
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} style={btnS(BLUE, '#fff')}>
                  <Wallet size={17} /><span>Continue with Wallet</span>
                </button>
              )}
            </ConnectKitButton.Custom>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ fontSize: 12, color: TEXT3, fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            {/* Email */}
            <button onClick={() => setMode('email')} style={btnS(SURFACE, TEXT, BORDER)}>
              <Mail size={17} /><span>Continue with Email</span>
            </button>

            {/* Google */}
            <button onClick={signInWithGoogle} style={btnS(SURFACE, TEXT, BORDER)}>
              <GoogleIcon /><span>Continue with Google</span>
            </button>

            <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
              By continuing you agree to NAN's Terms of Service and Privacy Policy.
            </p>
          </div>
        )}

        {/* ── Email entry ───────────────────────────────────────────────────── */}
        {mode === 'email' && (
          <div>
            <button onClick={() => { setMode('choose'); setError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>Enter your email</h2>
            <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>We'll send you a one-time code to sign in.</p>
            <input
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void sendOtp()}
              autoFocus style={inputS}
            />
            {error && <p style={errS}>{error}</p>}
            <button
              onClick={() => void sendOtp()} disabled={loading || !email.trim()}
              style={{ ...btnS(loading || !email.trim() ? SURFACE : BLUE, loading || !email.trim() ? TEXT3 : '#fff', loading || !email.trim() ? BORDER : undefined), marginTop: 12 }}>
              {loading ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
              {loading ? 'Sending…' : 'Send code'}
            </button>
          </div>
        )}

        {/* ── OTP entry ─────────────────────────────────────────────────────── */}
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
            {/* Dev-mode OTP hint */}
            {devOtp && (
              <div style={{ background: 'rgba(255,200,0,0.10)', border: '1px solid rgba(255,200,0,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c8a200' }}>
                Dev mode — your code is: <strong style={{ letterSpacing: '0.15em' }}>{devOtp}</strong>
              </div>
            )}
            <input
              type="text" inputMode="numeric" maxLength={6} placeholder="000000"
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && otp.length === 6 && void verifyOtp()}
              autoFocus
              style={{ ...inputS, textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.3em' }}
            />
            {error && <p style={errS}>{error}</p>}
            <button
              onClick={() => void verifyOtp()} disabled={loading || otp.length !== 6}
              style={{ ...btnS(loading || otp.length !== 6 ? SURFACE : BLUE, loading || otp.length !== 6 ? TEXT3 : '#fff', loading || otp.length !== 6 ? BORDER : undefined), marginTop: 12 }}>
              {loading ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} /> : null}
              {loading ? 'Verifying…' : 'Verify →'}
            </button>
            <button onClick={() => { setOtp(''); setDevOtp(''); void sendOtp() }}
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
