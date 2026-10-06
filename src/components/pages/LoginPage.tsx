import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Wallet, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { CircleEmailLogin } from '../CircleEmailLogin'
import { CircleGoogleLogin } from '../CircleGoogleLogin'
import { CirclePasskeyLogin } from '../CirclePasskeyLogin'


const F       = "'Inter', -apple-system, sans-serif"
const BLUE    = '#0066FF'
const TEXT    = 'var(--nan-text)'
const TEXT2   = '#8A8F9E'
const TEXT3   = '#50556A'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'
const BG      = 'var(--nan-bg)'

type LoginMode = 'choose' | 'email' | 'google' | 'wallet' | 'passkey'

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setActiveView, profile } = useAppStore()
  const [mode, setMode] = useState<LoginMode>('choose')

  // ── wallet connect effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (isConnected && address) {
      // Generate a real base64 session token so community endpoints (support,
      // feedback, notifications) can decode email from it as a fallback.
      // Wallet users have no email — we use the address as the identity key.
      const token = btoa(`${address}:${Date.now()}`)
      setAuth({ email: address, sessionToken: token, walletAddress: address, walletId: address })
      setActiveView(profile.displayName ? 'home' : 'name')
    }
  }, [isConnected, address, profile.displayName, setAuth, setActiveView])

  // ── Circle email auth success ─────────────────────────────────────────────
  // encryptionKey is passed by CircleEmailLogin's onSuccess(addr, userToken, email, encryptionKey)
  const onCircleSuccess = (walletAddress: string, userToken: string, email: string, encryptionKey?: string) => {
    setAuth({ email, sessionToken: userToken, userToken, encryptionKey, walletAddress, walletId: walletAddress, circleWalletAddress: walletAddress })
    setActiveView(profile.displayName ? 'home' : 'name')
  }

  // ── Passkey / modular wallet success ──────────────────────────────────────
  const onPasskeySuccess = (walletAddress: string) => {
    const token = btoa(`passkey:${walletAddress}:${Date.now()}`)
    setAuth({ email: walletAddress, sessionToken: token, walletAddress, walletId: walletAddress, circleWalletAddress: walletAddress, isPasskeyUser: true })
    setActiveView(profile.displayName ? 'home' : 'name')
  }

  // ── shared page wrapper ───────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '24px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 44 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg viewBox="0 0 324 480" width="18" height="25" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.04em', color: TEXT }}>nan</span>
          <p style={{ fontSize: 14, color: TEXT2, marginTop: 6 }}>The intelligent payment layer</p>
        </div>
        {children}
      </div>
      <p style={{ position: 'fixed', bottom: 20, fontSize: 11, color: TEXT3 }}>
        Arc · Circle USDC · Testnet
      </p>
    </div>
  )

  // ── email mode — render Circle email login ────────────────────────────────
  if (mode === 'email') {
    return wrap(
      <CircleEmailLogin
        onBack={() => setMode('choose')}
        onSuccess={onCircleSuccess}
      />
    )
  }

  // ── passkey mode — render Modular Wallet login ───────────────────────────
  if (mode === 'passkey') {
    return wrap(
      <CirclePasskeyLogin
        onBack={() => setMode('choose')}
        onSuccess={onPasskeySuccess}
      />
    )
  }

  // ── google mode — render Circle Google login ──────────────────────────────
  if (mode === 'google') {
    return wrap(
      <CircleGoogleLogin
        onBack={() => setMode('choose')}
        onSuccess={(walletAddress, userToken, email) => onCircleSuccess(walletAddress, userToken, email)}
      />
    )
  }

  // ── wallet mode — show ConnectKit, back button available ──────────────────
  if (mode === 'wallet') {
    return wrap(
      <div>
        <button onClick={() => setMode('choose')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', color: TEXT2, fontSize: 14, marginBottom: 28, padding: 0, fontFamily: F }}>
          <ArrowLeft size={14} /> Back
        </button>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: TEXT }}>
          Connect your wallet
        </h2>
        <p style={{ fontSize: 14, color: TEXT2, marginBottom: 22 }}>
          Use any browser wallet to sign in to Nan.
        </p>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} style={btnS(BLUE, '#fff')}>
              <Wallet size={17} />
              <span>Connect Wallet</span>
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    )
  }

  // ── choose mode — email first, wallet as alternative ─────────────────────
  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Email — primary CTA */}
      <button onClick={() => setMode('email')} style={btnS(BLUE, '#fff')}>
        <MailIcon />
        <span>Continue with Email</span>
      </button>

      {/* Google */}
      <button onClick={() => setMode('google')} style={btnS(SURFACE, TEXT, BORDER)}>
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ fontSize: 12, color: TEXT3, fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {/* Wallet */}
      <button onClick={() => setMode('wallet')} style={btnS(SURFACE, TEXT, BORDER)}>
        <Wallet size={17} />
        <span>Continue with Wallet</span>
      </button>

      {/* Passkey / Modular Wallet */}
      <button onClick={() => setMode('passkey')} style={btnS(SURFACE, TEXT, BORDER)}>
        <PasskeyIcon />
        <span>Continue with Passkey</span>
      </button>

      <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
        New here? We'll create your Circle wallet automatically.
      </p>
    </div>
  )
}

// ── icon helpers ───────────────────────────────────────────────────────────────
function PasskeyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4"/>
      <path d="M5.5 21a8.38 8.38 0 0 1 13 0"/>
      <path d="M17 11l1.5 1.5L21 10"/>
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M2 7l10 7 10-7"/>
    </svg>
  )
}

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
