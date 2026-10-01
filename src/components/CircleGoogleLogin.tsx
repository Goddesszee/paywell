/**
 * Circle User-Controlled Wallet — Google social login
 *
 * Prerequisites (Vercel env vars):
 *   CIRCLE_USER_CONTROLLED_API_KEY  — Circle API key
 *   VITE_CIRCLE_APP_ID              — App ID from Circle Console → Wallets → User Controlled → Configurator
 *   VITE_GOOGLE_CLIENT_ID           — Google OAuth client ID
 *
 * Circle Console setup:
 *   Wallets → User Controlled → Configurator → Authentication Methods → Social Logins → Google
 *   Paste your Google Client ID there. Authorized redirect URI must include this app's origin.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { SocialLoginProvider } from '@circle-fin/w3s-pw-web-sdk/dist/src/types'
import { useAppStore } from '../store/appStore'
import { ArrowLeft, Loader } from 'lucide-react'

const F     = "'Inter', -apple-system, sans-serif"
const BLUE  = '#0066FF'
const TEXT  = 'var(--nan-text)'
const TEXT2 = '#8A8F9E'
const TEXT3 = '#50556A'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'

const CIRCLE_APP_ID    = import.meta.env.VITE_CIRCLE_APP_ID     as string | undefined
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID  as string | undefined

interface LoginResult { userToken: string; encryptionKey: string }

type Step = 'idle' | 'waiting' | 'creating' | 'done' | 'error'

interface Props {
  onBack: () => void
  onSuccess: (walletAddress: string, userToken: string, email: string) => void
}

export function CircleGoogleLogin({ onBack, onSuccess }: Props) {
  const { setAuth, profile } = useAppStore()
  const sdkRef     = useRef<W3SSdk | null>(null)
  const loginRes   = useRef<LoginResult | null>(null)

  // Persist device tokens across the OAuth redirect using sessionStorage
  const [step,    setStep]   = useState<Step>('idle')
  const [error,   setError]  = useState('')
  const [loading, setLoading] = useState(false)

  // ── load wallets and finish auth ────────────────────────────────────────────
  const finishAuth = useCallback(async (userToken: string) => {
    try {
      const res  = await fetch('/api/wallet', { headers: { 'x-user-token': userToken } })
      const data = await res.json() as { wallets?: { address: string; id: string }[] }
      const wallet = data.wallets?.[0]
      const addr   = wallet?.address ?? ''
      setAuth({ email: '', sessionToken: userToken, userToken, circleWalletAddress: addr, walletAddress: addr, walletId: wallet?.id ?? '' })
      setStep('done')
      onSuccess(addr, userToken, '')
    } catch {
      setError('Could not load your wallet. Please try again.')
      setStep('error')
    }
  }, [onSuccess, setAuth])

  // ── init Circle Web SDK ────────────────────────────────────────────────────
  useEffect(() => {
    const appId        = CIRCLE_APP_ID    ?? 'pending-configuration'
    const googleId     = GOOGLE_CLIENT_ID ?? ''
    const storedDToken = sessionStorage.getItem('nan_g_deviceToken')        ?? ''
    const storedDKey   = sessionStorage.getItem('nan_g_deviceEncryptionKey') ?? ''

    const onLoginComplete = (err: unknown, result: unknown) => {
      if (err) {
        setError('Google login failed — please try again.')
        setStep('error')
        return
      }
      const r = result as LoginResult
      loginRes.current = r
      setStep('creating')

      void (async () => {
        setLoading(true)
        try {
          const res  = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'initialize', userToken: r.userToken }),
          })
          const data = await res.json() as { challengeId?: string; code?: number; error?: string }

          if (data.code === 155106) {
            await finishAuth(r.userToken)
            return
          }
          if (data.error || !data.challengeId) {
            setError(data.error ?? 'Wallet initialization failed')
            setStep('error')
            return
          }

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

    const sdk = new W3SSdk(
      {
        appSettings: { appId },
        loginConfigs: {
          deviceToken: storedDToken,
          deviceEncryptionKey: storedDKey,
          google: {
            clientId: googleId,
            redirectUri: window.location.origin,
            selectAccountPrompt: true,
          },
        },
      },
      onLoginComplete
    )
    sdkRef.current = sdk

    // ensure deviceId is obtained so the SDK can process the OAuth return
    sdk.getDeviceId()
      .then(id => sessionStorage.setItem('nan_g_deviceId', id))
      .catch(() => setError('Could not initialise Circle SDK'))
  }, [finishAuth])

  // ── start Google login ──────────────────────────────────────────────────────
  const startGoogleLogin = async () => {
    setLoading(true); setError('')
    try {
      const deviceId = sessionStorage.getItem('nan_g_deviceId') ?? ''
      if (!deviceId) throw new Error('SDK not ready — please try again in a moment.')

      // create device token for social login
      const res  = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'device-token', deviceId }),
      })
      const data = await res.json() as { deviceToken?: string; deviceEncryptionKey?: string; error?: string }
      if (data.error || !data.deviceToken) throw new Error(data.error ?? 'Could not create device token')

      sessionStorage.setItem('nan_g_deviceToken',        data.deviceToken)
      sessionStorage.setItem('nan_g_deviceEncryptionKey', data.deviceEncryptionKey ?? '')

      // update SDK configs with the device token
      sdkRef.current?.updateConfigs({
        appSettings: { appId: CIRCLE_APP_ID! },
        loginConfigs: {
          deviceToken: data.deviceToken,
          deviceEncryptionKey: data.deviceEncryptionKey ?? '',
          google: {
            clientId: GOOGLE_CLIENT_ID ?? '',
            redirectUri: window.location.origin,
            selectAccountPrompt: true,
          },
        },
      })

      setStep('waiting')
      sdkRef.current?.performLogin(SocialLoginProvider.GOOGLE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google login failed')
      setLoading(false)
    }
  }

  const notConfigured = !CIRCLE_APP_ID || !GOOGLE_CLIENT_ID

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', fontFamily: F }}>

      {/* Back */}
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
        <ArrowLeft size={14} /> Back
      </button>

      {/* ── idle / ready to start ────────────────────────────────────────────── */}
      {(step === 'idle') && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
            Continue with Google
          </h2>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>
            Sign in with your Google account. Circle will create a non-custodial wallet for you.
          </p>
          {error && <p style={errS}>{error}</p>}
          {notConfigured && (
            <p style={{ fontSize: 12, color: TEXT3, marginBottom: 16, lineHeight: 1.5 }}>
              Add <code>VITE_CIRCLE_APP_ID</code>, <code>VITE_GOOGLE_CLIENT_ID</code>, and{' '}
              <code>CIRCLE_USER_CONTROLLED_API_KEY</code> in Vercel to activate Google login.
            </p>
          )}
          <button onClick={() => void startGoogleLogin()} disabled={loading}
            style={btnS(BLUE, '#fff')}>
            {loading
              ? <Loader size={16} style={{ animation: 'nan-spin 1s linear infinite' }} />
              : <GoogleIcon />}
            {loading ? 'Connecting…' : 'Sign in with Google'}
          </button>
        </>
      )}

      {/* ── waiting for OAuth redirect to return ─────────────────────────────── */}
      {step === 'waiting' && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Loader size={28} style={{ animation: 'nan-spin 1s linear infinite', color: BLUE, marginBottom: 16 }} />
          <p style={{ fontSize: 15, color: TEXT2 }}>Waiting for Google…</p>
          <p style={{ fontSize: 12, color: TEXT3, marginTop: 8 }}>Complete sign-in in the popup.</p>
        </div>
      )}

      {/* ── creating wallet ──────────────────────────────────────────────────── */}
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
          <button onClick={() => { setStep('idle'); setError(''); setLoading(false) }}
            style={{ ...btnS(SURFACE, TEXT, BORDER), marginTop: 16 }}>
            Try again
          </button>
        </>
      )}
    </div>
  )
}

// ── Google colour logo ──────────────────────────────────────────────────────────
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

const errS: React.CSSProperties = { fontSize: 13, color: '#FF3B3B', marginTop: 8 }
