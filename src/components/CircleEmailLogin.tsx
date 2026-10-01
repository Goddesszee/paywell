/**
 * Circle User-Controlled Wallet — Email OTP login
 *
 * Correct flow per Circle docs:
 *  1. Enter email → POST /api/wallet (action=request-otp)
 *     Circle sends OTP email. Returns deviceToken, deviceEncryptionKey, otpToken.
 *  2. Feed tokens into W3SSdk via updateConfigs then call sdk.verifyOtp()
 *     Circle opens its hosted OTP entry popup. User types the code there.
 *  3. SDK fires onLoginComplete callback with userToken + encryptionKey
 *  4. POST /api/wallet (action=initialize) — creates wallet for new users
 *     code 155106 = existing user, skip to step 5
 *  5. GET /api/wallet → load wallets → done
 *
 * Required env vars (Vercel):
 *   VITE_CIRCLE_APP_ID
 *   CIRCLE_USER_CONTROLLED_API_KEY (or CIRCLE_API_KEY)
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

type Step = 'email' | 'otp_sent' | 'verifying' | 'wallet_setup' | 'done' | 'error'
interface LoginResult { userToken: string; encryptionKey: string }
interface OtpTokens   { deviceToken: string; deviceEncryptionKey: string; otpToken: string }

interface Props {
  onBack?: () => void
  onSuccess: (walletAddress: string, userToken: string, email: string) => void
}

export function CircleEmailLogin({ onBack, onSuccess }: Props) {
  const { setAuth, profile } = useAppStore()
  const sdkRef      = useRef<W3SSdk | null>(null)
  const otpDataRef  = useRef<OtpTokens | null>(null)

  const [email,     setEmail]     = useState('')
  const [step,      setStep]      = useState<Step>('email')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  // ── finish: load wallets and call onSuccess ────────────────────────────────
  const finishAuth = useCallback(async (userToken: string) => {
    setStep('wallet_setup')
    setStatusMsg('Loading your wallet…')
    try {
      const res  = await fetch('/api/wallet', {
        headers: { 'x-user-token': userToken },
      })
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

  // ── initialize: new user gets wallet challenge, existing user skips ────────
  const initializeUser = useCallback(async (loginRes: LoginResult) => {
    setStatusMsg('Setting up your account…')
    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize', userToken: loginRes.userToken }),
      })
      const data = await res.json() as { challengeId?: string; code?: number; error?: string }

      // Existing user — just load their wallets
      if (data.code === 155106) {
        await finishAuth(loginRes.userToken)
        return
      }
      if (data.error || !data.challengeId) {
        // If the error message indicates already initialized, treat as existing user
        if (data.error?.toLowerCase().includes('already') || data.error?.toLowerCase().includes('initialized')) {
          await finishAuth(loginRes.userToken)
          return
        }
        throw new Error(data.error ?? 'Wallet initialization failed')
      }

      // New user — execute wallet creation challenge via SDK
      setStatusMsg('Complete wallet setup in the popup…')
      const sdk = sdkRef.current
      if (!sdk) throw new Error('SDK not initialised')
      sdk.setAuthentication({ userToken: loginRes.userToken, encryptionKey: loginRes.encryptionKey })
      sdk.execute(data.challengeId, async (execErr) => {
        if (execErr) {
          const msg = execErr instanceof Error ? execErr.message : String(execErr)
          // "Already initialized" can also surface here
          if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('155106')) {
            await finishAuth(loginRes.userToken)
            return
          }
          setError('Wallet setup failed — please try again.')
          setStep('error')
          return
        }
        await finishAuth(loginRes.userToken)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup error — please try again.')
      setStep('error')
    }
  }, [finishAuth])

  // ── init SDK once ──────────────────────────────────────────────────────────
  useEffect(() => {
    const appId = CIRCLE_APP_ID ?? 'pending-configuration'

    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // If the error is "already initialized" the login still succeeded — userToken is in result
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('155106')) {
          const res = result as LoginResult | undefined
          if (res?.userToken) {
            void finishAuth(res.userToken)
            return
          }
        }
        setError('Verification failed — please check your code and try again.')
        setStep('error')
        return
      }
      const res = result as LoginResult
      void initializeUser(res)
    }

    const sdk = new W3SSdk({ appSettings: { appId } }, onLoginComplete)
    sdkRef.current = sdk
  }, [initializeUser, finishAuth])

  // ── Step 1: send OTP ───────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true); setError('')

    // Get deviceId from SDK
    const sdk = sdkRef.current
    if (!sdk) { setError('SDK not ready — please refresh the page.'); setLoading(false); return }

    let deviceId: string
    try {
      deviceId = await sdk.getDeviceId()
    } catch {
      setError('Could not initialise Circle SDK — please refresh the page.')
      setLoading(false)
      return
    }

    try {
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request-otp', deviceId, email: email.trim() }),
      })
      const data = await res.json() as OtpTokens & { error?: string }
      if (data.error) throw new Error(data.error)

      otpDataRef.current = data

      // Feed tokens into SDK
      sdk.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID ?? 'pending-configuration' },
        loginConfigs: {
          deviceToken:          data.deviceToken,
          deviceEncryptionKey:  data.deviceEncryptionKey,
          otpToken:             data.otpToken,
        },
      })
      setStep('otp_sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code — please check your email address.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: open Circle OTP popup ─────────────────────────────────────────
  const verifyOtp = () => {
    setStep('verifying')
    setStatusMsg('Waiting for verification…')
    sdkRef.current?.verifyOtp()
  }

  const notConfigured = !CIRCLE_APP_ID

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', fontFamily: F }}>

      {onBack && step === 'email' && (
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
          <ArrowLeft size={14} /> Back
        </button>
      )}

      {/* ── email entry ────────────────────────────────────────────────────── */}
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
            <div style={{ background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.3)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#F0A500', lineHeight: 1.5 }}>
              Add <code>VITE_CIRCLE_APP_ID</code> and <code>CIRCLE_USER_CONTROLLED_API_KEY</code> in Vercel to activate live email login.
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Mail size={15} color={TEXT3} style={{ position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', pointerEvents: 'none' }} />
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

      {/* ── OTP sent ─────────────────────────────────────────────────────── */}
      {step === 'otp_sent' && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
            Check your inbox
          </h2>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22, lineHeight: 1.55 }}>
            A verification code was sent to <strong style={{ color: TEXT }}>{email}</strong>.<br />
            Tap the button below — a popup will open where you enter the code.
          </p>

          <div style={{ background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.2)',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: BLUE, lineHeight: 1.5 }}>
            Code sent — check inbox and spam folder.
          </div>

          {error && <p style={errS}>{error}</p>}

          <button onClick={verifyOtp} style={btnS(BLUE, '#fff')}>
            Enter verification code →
          </button>

          <button onClick={() => void sendOtp()}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              color: TEXT2, fontSize: 13, marginTop: 14, fontFamily: F, textDecoration: 'underline' }}>
            Resend code
          </button>

          <button onClick={() => { setStep('email'); setError('') }}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              color: TEXT3, fontSize: 12, marginTop: 8, fontFamily: F }}>
            ← Use a different email
          </button>
        </>
      )}

      {/* ── verifying / wallet setup ──────────────────────────────────────── */}
      {(step === 'verifying' || step === 'wallet_setup') && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Loader size={30} color={BLUE} style={{ animation: 'nan-spin 1s linear infinite', marginBottom: 18 }} />
          <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.6 }}>
            {step === 'verifying' ? 'Waiting for verification…' : statusMsg || 'Setting up your wallet…'}
          </p>
          {step === 'wallet_setup' && statusMsg.includes('popup') && (
            <p style={{ fontSize: 12, color: TEXT3, marginTop: 8 }}>
              Complete the steps in the Circle popup to finish.
            </p>
          )}
        </div>
      )}

      {/* ── success ──────────────────────────────────────────────────────── */}
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
