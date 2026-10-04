/**
 * Circle User-Controlled Wallet — Email OTP login
 *
 * Flow:
 *  1. User enters email → backend calls createDeviceTokenForEmailLogin
 *     Circle sends OTP to the email via configured SMTP (Circle Console)
 *  2. User pastes/types OTP code in our custom input (no Circle popup)
 *  3. Backend calls verifyOtpToken → returns userToken + encryptionKey
 *  4. If new user → backend calls createUserPinWithWallets → SDK executes challenge
 *     If returning user (code 155106) → skip straight to step 5
 *  5. Load wallets → done
 *
 * Required Vercel env vars:
 *   CIRCLE_USER_CONTROLLED_API_KEY  (or CIRCLE_API_KEY)
 *   VITE_CIRCLE_APP_ID
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAppStore } from '../store/appStore'
import { ArrowLeft, ArrowRight, Loader, Mail } from 'lucide-react'

const F     = "'Inter', -apple-system, sans-serif"
const BLUE  = '#0066FF'
const TEXT  = 'var(--nan-text)'
const TEXT2 = '#8A8F9E'
const TEXT3 = '#50556A'
const SURF  = 'var(--nan-surface)'
const BDR   = 'var(--nan-bdr2)'

const CIRCLE_APP_ID = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined

type Step = 'email' | 'otp_input' | 'verifying' | 'wallet_setup' | 'done' | 'error'

interface OtpTokens   { deviceToken: string; deviceEncryptionKey: string; otpToken: string }
interface VerifyResult { userToken: string; encryptionKey: string }

interface Props {
  onBack?: () => void
  onSuccess: (walletAddress: string, userToken: string, email: string) => void
}

export function CircleEmailLogin({ onBack, onSuccess }: Props) {
  const { setAuth, profile } = useAppStore()
  const sdkRef      = useRef<W3SSdk | null>(null)
  const otpTokenRef = useRef<string>('')
  const devTokenRef = useRef<string>('')
  const devEncRef   = useRef<string>('')

  const [email,     setEmail]     = useState('')
  const [otpCode,   setOtpCode]   = useState('')
  const [step,      setStep]      = useState<Step>('email')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // ── init SDK once ─────────────────────────────────────────────────────────
  useEffect(() => {
    const appId = CIRCLE_APP_ID ?? 'pending-configuration'
    const sdk = new W3SSdk({ appSettings: { appId } })
    sdkRef.current = sdk
  }, [])

  // ── finish: load wallets and call onSuccess ────────────────────────────────
  const finishAuth = useCallback(async (userToken: string) => {
    setStep('wallet_setup')
    setStatusMsg('Loading your wallet…')
    try {
      const res  = await fetch('/api/wallet', { headers: { 'x-user-token': userToken } })
      const data = await res.json() as { wallets?: { address: string }[]; error?: string }
      if (data.error) throw new Error(data.error)
      const addr = data.wallets?.[0]?.address ?? ''
      setAuth({
        email,
        sessionToken: userToken,
        userToken,
        circleWalletAddress: addr,
        walletAddress: addr,
        walletId: addr,
      })
      setStep('done')
      onSuccess(addr, userToken, email)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load wallet. Please try again.')
      setStep('error')
    }
  }, [email, onSuccess, setAuth])

  // ── initialize: new user gets wallet challenge, existing skips ─────────────
  const initializeUser = useCallback(async (userToken: string, encryptionKey: string) => {
    setStatusMsg('Setting up your account…')
    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize', userToken }),
      })
      const data = await res.json() as { challengeId?: string; code?: number; error?: string }

      // Returning user — skip wallet creation
      if (data.code === 155106) {
        await finishAuth(userToken)
        return
      }
      if (data.error || !data.challengeId) {
        throw new Error(data.error ?? 'Wallet initialization failed')
      }

      // New user — execute challenge (Circle hosted PIN / wallet-creation UI)
      setStatusMsg('Complete wallet setup in the popup…')
      const sdk = sdkRef.current
      if (!sdk) throw new Error('SDK not initialised')
      sdk.setAuthentication({ userToken, encryptionKey })
      sdk.execute(data.challengeId, async (execErr) => {
        if (execErr) {
          // "already initialized" from the execute callback = returning user
          const msg = execErr instanceof Error ? execErr.message : String(execErr)
          if (msg.toLowerCase().includes('already') || msg.includes('155106')) {
            await finishAuth(userToken)
            return
          }
          setError('Wallet setup failed — please try again.')
          setStep('error')
          return
        }
        await finishAuth(userToken)
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Setup error — please try again.'
      // Catch "already initialized" at any level
      if (msg.toLowerCase().includes('already') || msg.includes('155106')) {
        await finishAuth(userToken)
        return
      }
      setError(msg)
      setStep('error')
    }
  }, [finishAuth])

  // ── Step 1: send OTP via Circle ───────────────────────────────────────────
  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true); setError(''); setOtpCode('')

    // Get deviceId from SDK
    let deviceId = localStorage.getItem('nan_deviceId') ?? ''
    if (!deviceId && sdkRef.current) {
      try { deviceId = await sdkRef.current.getDeviceId(); localStorage.setItem('nan_deviceId', deviceId) }
      catch { deviceId = `dev-${Date.now()}` }
    }

    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-otp', deviceId, email: email.trim() }),
      })
      const data = await res.json() as OtpTokens & { error?: string }
      if (data.error) throw new Error(data.error)

      otpTokenRef.current = data.otpToken
      devTokenRef.current = data.deviceToken
      devEncRef.current   = data.deviceEncryptionKey

      // Feed tokens into SDK so it can verify
      sdkRef.current?.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID! },
        loginConfigs: {
          deviceToken: data.deviceToken,
          deviceEncryptionKey: data.deviceEncryptionKey,
          otpToken: data.otpToken,
        },
      })
      setStep('otp_input')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code — check your email address')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: verify OTP code via backend ───────────────────────────────────
  const verifyOtp = async () => {
    const code = otpCode.trim().replace(/\s/g, '')
    if (!code) { setError('Please enter the verification code'); return }
    setStep('verifying'); setError('')

    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify-otp',
          otpToken: otpTokenRef.current,
          otpCode: code,
          deviceToken: devTokenRef.current,
          deviceEncryptionKey: devEncRef.current,
        }),
      })
      const data = await res.json() as VerifyResult & { code?: number; error?: string }

      if (data.error || !data.userToken) {
        // Returning user edge case
        if (data.code === 155106 || data.error?.toLowerCase().includes('already')) {
          // We have a userToken from a previous session? Try finishAuth with stored token
          setError('Already verified — loading your wallet…')
          return
        }
        throw new Error(data.error ?? 'Verification failed')
      }

      await initializeUser(data.userToken, data.encryptionKey ?? '')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Verification failed'
      if (msg.toLowerCase().includes('already') || msg.includes('155106')) {
        setError('Already verified — tap "Try again" to reload.')
      } else {
        setError(msg)
      }
      setStep('error')
    }
  }

  const notConfigured = !CIRCLE_APP_ID

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', fontFamily: F }}>

      {/* Back */}
      {onBack && step === 'email' && (
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
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22, lineHeight: 1.55 }}>
            New here? We'll create your wallet automatically.<br />
            Already have an account? You'll pick up right where you left off.
          </p>

          {notConfigured && (
            <div style={{ background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#F0A500', lineHeight: 1.5 }}>
              Add <code>VITE_CIRCLE_APP_ID</code> and <code>CIRCLE_USER_CONTROLLED_API_KEY</code> in Vercel to activate live email login.
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Mail size={15} color={TEXT3} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void sendOtp()}
              autoFocus
              style={{ ...inputS, paddingLeft: 40 }}
            />
          </div>

          {error && <p style={errS}>{error}</p>}

          <button
            onClick={() => void sendOtp()}
            disabled={loading || !email.trim()}
            style={btnS(loading || !email.trim() ? SURF : BLUE,
              loading || !email.trim() ? TEXT3 : '#fff',
              loading || !email.trim() ? BDR : undefined)}
          >
            {loading
              ? <><Loader size={15} style={{ animation: 'nan-spin 1s linear infinite' }} /> Sending…</>
              : <><ArrowRight size={15} /> Continue</>}
          </button>
        </>
      )}

      {/* ── OTP input — paste-friendly ───────────────────────────────────────── */}
      {step === 'otp_input' && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
            Check your email
          </h2>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 20, lineHeight: 1.55 }}>
            A code was sent to <strong style={{ color: TEXT }}>{email}</strong>.<br />
            Paste or type it below.
          </p>

          {/* Big paste-friendly OTP input */}
          <input
            type="text"
            inputMode="none"
            placeholder="Paste code here e.g. W4L-988288"
            value={otpCode}
            onChange={e => setOtpCode(e.target.value)}
            onPaste={e => {
              e.preventDefault()
              const pasted = e.clipboardData.getData('text').trim()
              setOtpCode(pasted)
            }}
            onKeyDown={e => e.key === 'Enter' && void verifyOtp()}
            autoFocus
            autoComplete="one-time-code"
            style={{
              ...inputS,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textAlign: 'center',
              marginBottom: 12,
              color: '#F2F3F5',
            }}
          />

          {error && <p style={errS}>{error}</p>}

          <button
            onClick={() => void verifyOtp()}
            disabled={!otpCode.trim()}
            style={btnS(!otpCode.trim() ? SURF : BLUE,
              !otpCode.trim() ? TEXT3 : '#fff',
              !otpCode.trim() ? BDR : undefined)}
          >
            <ArrowRight size={15} /> Verify
          </button>

          <button onClick={() => void sendOtp()} style={ghostBtnS}>
            Resend code
          </button>
          <button onClick={() => { setStep('email'); setError('') }} style={{ ...ghostBtnS, color: TEXT3, fontSize: 12 }}>
            ← Use a different email
          </button>
        </>
      )}

      {/* ── verifying / wallet setup spinner ──────────────────────────────────── */}
      {(step === 'verifying' || step === 'wallet_setup') && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Loader size={30} color={BLUE} style={{ animation: 'nan-spin 1s linear infinite', marginBottom: 18 }} />
          <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.6 }}>
            {step === 'verifying' ? 'Verifying your code…' : statusMsg || 'Setting up your wallet…'}
          </p>
          {step === 'wallet_setup' && statusMsg.includes('popup') && (
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 8 }}>
              Complete the steps in the Circle popup to finish.
            </p>
          )}
        </div>
      )}

      {/* ── success ──────────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,200,83,0.12)',
            border: '2px solid rgba(0,200,83,0.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 18px', fontSize: 24 }}>✓</div>
          <p style={{ fontSize: 17, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
            {profile.displayName ? `Welcome back, ${profile.displayName}!` : 'Wallet ready!'}
          </p>
          <p style={{ fontSize: 13, color: TEXT2 }}>Taking you in…</p>
        </div>
      )}

      {/* ── error ──────────────────────────────────────────────────────────── */}
      {step === 'error' && (
        <>
          <p style={errS}>{error}</p>
          <button onClick={() => { setStep('email'); setError('') }}
            style={{ ...btnS(SURF, TEXT, BDR), marginTop: 16 }}>
            Try again
          </button>
        </>
      )}
    </div>
  )
}

// ── style helpers ───────────────────────────────────────────────────────────
function btnS(bg: string, color: string, bdr?: string): React.CSSProperties {
  return {
    width: '100%', padding: '13px 20px',
    background: bg, color,
    border: bdr ? `1px solid ${bdr}` : 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: F,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    transition: 'opacity 0.15s', letterSpacing: '-0.01em',
  }
}

const ghostBtnS: React.CSSProperties = {
  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
  color: TEXT2, fontSize: 13, marginTop: 12, fontFamily: F, textDecoration: 'underline',
  padding: '4px 0',
}

const inputS: React.CSSProperties = {
  width: '100%', padding: '13px 16px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12, fontSize: 16, fontFamily: F,
  color: '#F2F3F5', background: '#13151A', outline: 'none',
  boxSizing: 'border-box',
}

const errS: React.CSSProperties = {
  fontSize: 13, color: '#FF3B3B', marginTop: 8, marginBottom: 8, lineHeight: 1.5,
}
