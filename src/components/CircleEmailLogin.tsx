/**
 * Circle User-Controlled Wallet — Email OTP login
 *
 * Prerequisites (Vercel env vars):
 *   CIRCLE_USER_CONTROLLED_API_KEY  — Circle API key
 *   VITE_CIRCLE_APP_ID              — App ID from Circle Console → Wallets → User Controlled → Configurator
 *
 * Circle Console setup:
 *   Wallets → User Controlled → Configurator → Authentication Methods → Email OTP
 *   Configure your SMTP credentials there so Circle can deliver the OTP code.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAppStore } from '../store/appStore'
import { ArrowLeft, ArrowRight, Loader } from 'lucide-react'

const F    = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'
const BG   = 'var(--nan-bg)'
const TEXT = 'var(--nan-text)'
const TEXT2 = '#8A8F9E'
const TEXT3 = '#50556A'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

interface LoginResult { userToken: string; encryptionKey: string }
interface OtpTokens   { deviceToken: string; deviceEncryptionKey: string; otpToken: string }

type Step = 'email' | 'sent' | 'creating' | 'done' | 'error'

interface Props {
  onBack?: () => void
  onSuccess: (walletAddress: string, userToken: string, email: string) => void
}

export function CircleEmailLogin({ onBack, onSuccess }: Props) {
  const { setAuth, profile } = useAppStore()
  const sdkRef       = useRef<W3SSdk | null>(null)
  const loginRes     = useRef<LoginResult | null>(null)

  const [deviceId,  setDeviceId]  = useState('')
  const [email,     setEmail]     = useState('')
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null)
  const [step,      setStep]      = useState<Step>('email')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  // ── load wallets and finish auth ────────────────────────────────────────────
  const finishAuth = useCallback(async (userToken: string) => {
    try {
      const res  = await fetch('/api/wallet', { headers: { 'x-user-token': userToken } })
      const data = await res.json() as { wallets?: { address: string }[] }
      const addr = data.wallets?.[0]?.address ?? ''
      setAuth({ email, sessionToken: userToken, userToken, circleWalletAddress: addr, walletAddress: addr, walletId: addr })
      setStep('done')
      onSuccess(addr, userToken, email)
    } catch {
      setError('Could not load your wallet. Please try again.')
      setStep('error')
    }
  }, [email, onSuccess, setAuth])

  // ── init Circle Web SDK ────────────────────────────────────────────────────
  useEffect(() => {
    const appId = CIRCLE_APP_ID ?? 'pending-configuration'

    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setError('OTP verification failed — please try again.')
        setStep('error')
        return
      }
      const r = result as LoginResult
      loginRes.current = r
      setStep('creating')
      void (async () => {
        setLoading(true)
        try {
          // initialize user / get wallet challenge
          const res  = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'initialize', userToken: r.userToken }),
          })
          const data = await res.json() as { challengeId?: string; code?: number; error?: string }

          if (data.code === 155106) {
            // existing user — load wallets directly
            await finishAuth(r.userToken)
            return
          }
          if (data.error || !data.challengeId) {
            setError(data.error ?? 'Wallet initialization failed')
            setStep('error')
            return
          }

          // execute challenge — Circle hosted UI asks user to set PIN
          const sdk = sdkRef.current
          if (!sdk) return
          sdk.setAuthentication({ userToken: r.userToken, encryptionKey: r.encryptionKey })
          sdk.execute(data.challengeId, async (execErr) => {
            if (execErr) {
              setError('Wallet creation failed — please try again.')
              setStep('error')
              return
            }
            await finishAuth(r.userToken)
          })
        } catch {
          setError('Network error — please try again.')
          setStep('error')
        } finally {
          setLoading(false)
        }
      })()
    }

    const sdk = new W3SSdk({ appSettings: { appId } }, onLoginComplete)
    sdkRef.current = sdk

    sdk.getDeviceId()
      .then(id => { setDeviceId(id); localStorage.setItem('nan_deviceId', id) })
      .catch(() => setError('Could not initialise Circle SDK'))
  }, [finishAuth])

  // ── Step 1: send OTP ────────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!email.trim() || !deviceId) return
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-otp', deviceId, email: email.trim() }),
      })
      const data = await res.json() as OtpTokens & { error?: string }
      if (data.error) throw new Error(data.error)

      setOtpTokens(data)
      sdkRef.current?.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID! },
        loginConfigs: {
          deviceToken: data.deviceToken,
          deviceEncryptionKey: data.deviceEncryptionKey,
          otpToken: data.otpToken,
        },
      })
      setStep('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: open Circle OTP verification UI ─────────────────────────────────
  const verifyOtp = () => {
    if (!sdkRef.current || !otpTokens) return
    sdkRef.current.verifyOtp()
  }

  // ── not configured hint ─────────────────────────────────────────────────────
  const notConfigured = !CIRCLE_APP_ID

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', fontFamily: F }}>

      {/* Back */}
      {onBack && (
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
          <ArrowLeft size={14} /> Back
        </button>
      )}

      {/* ── email entry ──────────────────────────────────────────────────────── */}
      {step === 'email' && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
            Enter your email
          </h2>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>
            We'll send a one-time code via Circle to verify you.
          </p>
          <input
            type="email" placeholder="you@example.com" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void sendOtp()}
            autoFocus style={inputS}
          />
          {error && <p style={errS}>{error}</p>}
          {notConfigured && (
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 8, lineHeight: 1.5 }}>
              Add <code>VITE_CIRCLE_APP_ID</code> and <code>CIRCLE_USER_CONTROLLED_API_KEY</code> in Vercel to activate live email login.
            </p>
          )}
          <button onClick={() => void sendOtp()} disabled={loading || !email.trim() || !deviceId}
            style={{ ...btnS(loading || !email.trim() || !deviceId ? SURFACE : BLUE,
              loading || !email.trim() || !deviceId ? TEXT3 : '#fff',
              loading || !email.trim() || !deviceId ? BORDER : undefined), marginTop: 12 }}>
            {loading ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </>
      )}

      {/* ── code sent — prompt to verify ────────────────────────────────────── */}
      {step === 'sent' && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
            Check your email
          </h2>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>
            A code was sent to <strong style={{ color: TEXT }}>{email}</strong>. Tap the button below to enter it.
          </p>
          <div style={{ background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.20)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: BLUE }}>
            Code sent — check your inbox.
          </div>
          {error && <p style={errS}>{error}</p>}
          <button onClick={verifyOtp}
            style={btnS(BLUE, '#fff')}>
            Enter verification code →
          </button>
          <button onClick={() => void sendOtp()}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              color: TEXT2, fontSize: 13, marginTop: 14, fontFamily: F, textDecoration: 'underline' }}>
            Resend code
          </button>
        </>
      )}

      {/* ── wallet being created ─────────────────────────────────────────────── */}
      {step === 'creating' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Loader size={28} style={{ animation: 'nan-spin 1s linear infinite', color: BLUE, marginBottom: 16 }} />
          <p style={{ fontSize: 15, color: TEXT2 }}>
            {loading ? 'Setting up your Circle wallet…' : 'Approve wallet creation in the popup…'}
          </p>
        </div>
      )}

      {/* ── success ─────────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>Wallet ready</p>
          <p style={{ fontSize: 13, color: TEXT2, marginTop: 4 }}>
            {profile.displayName ? `Welcome back, ${profile.displayName}` : 'Redirecting…'}
          </p>
        </div>
      )}

      {/* ── error ────────────────────────────────────────────────────────────── */}
      {step === 'error' && (
        <>
          <p style={errS}>{error}</p>
          <button onClick={() => { setStep('email'); setError('') }}
            style={{ ...btnS(SURFACE, TEXT, BORDER), marginTop: 16 }}>
            Try again
          </button>
        </>
      )}
    </div>
  )
}

// ── style helpers ──────────────────────────────────────────────────────────────
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

// keep TS happy — BG is used in the parent page, not here directly
void BG
import React from 'react'
