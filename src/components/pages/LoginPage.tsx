import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Wallet, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { CircleEmailLogin } from '../CircleEmailLogin'

const F     = "'Inter', -apple-system, sans-serif"
const BLUE  = '#0866F5'
const TEXT  = 'var(--nan-text)'
const TEXT2 = '#8A8F9E'
const TEXT3 = '#50556A'
const SURFACE = 'var(--nan-surface)'
const BORDER  = 'var(--nan-bdr2)'
const BG    = 'var(--nan-bg)'

type LoginMode = 'choose' | 'email' | 'wallet'

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setActiveView, setShowWelcome } = useAppStore()
  const [mode, setMode] = useState<LoginMode>('choose')

  // Wagmi wallet connect — only fires when user chose 'wallet' mode
  useEffect(() => {
    if (mode !== 'wallet') return
    if (isConnected && address) {
      const token = btoa(`${address}:${Date.now()}`)
      setAuth({ email: address, sessionToken: token, walletAddress: address, walletId: address })
      setShowWelcome(true)
      setActiveView('home')
    }
  }, [mode, isConnected, address, setAuth, setActiveView, setShowWelcome])

  // Circle email auth success
  const onCircleSuccess = (walletAddress: string, userToken: string, email: string, encryptionKey?: string) => {
    const existing = useAppStore.getState().auth
    setAuth({
      ...existing,
      email,
      sessionToken: userToken,
      userToken,
      encryptionKey: encryptionKey ?? existing?.encryptionKey,
      walletAddress,
      walletId: existing?.walletId ?? walletAddress,
      circleWalletAddress: walletAddress,
      circleWalletId: existing?.circleWalletId ?? walletAddress,
    })
    setShowWelcome(true)
    setActiveView('home')
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflowY: 'auto',
      padding: 'max(env(safe-area-inset-top,0px),32px) 20px max(env(safe-area-inset-bottom,0px),32px)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {children}
      </div>
      <p style={{ fontSize: 11, color: TEXT3, marginTop: 24, textAlign: 'center' }}>
        Arc · Circle USDC
      </p>
    </div>
  )

  // Email mode
  if (mode === 'email') {
    return wrap(
      <CircleEmailLogin
        onBack={() => setMode('choose')}
        onSuccess={onCircleSuccess}
      />
    )
  }

  // Wallet mode
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
          Use any browser wallet to sign in to NAN.
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

  // Choose mode — wallet primary, email secondary
  return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Heading */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1.1 }}>NAN</div>
        <div style={{ fontSize: 13, color: TEXT2, marginTop: 6 }}>Pay with USDC on Arc</div>
      </div>

      {/* Wallet — primary CTA */}
      <button onClick={() => setMode('wallet')} style={btnS(BLUE, '#fff')}>
        <Wallet size={17} />
        <span>Connect Wallet</span>
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ fontSize: 12, color: TEXT3, fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      {/* Email — secondary */}
      <button onClick={() => setMode('email')} style={btnS(SURFACE, TEXT, BORDER)}>
        <MailIcon />
        <span>Continue with Email</span>
      </button>

      <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>
        New here? We'll create your Circle wallet automatically.
      </p>
    </div>
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
