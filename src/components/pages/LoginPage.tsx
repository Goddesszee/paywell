import React, { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Wallet, ArrowLeft, Mail, Fingerprint } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { CircleEmailLogin } from '../CircleEmailLogin'
import { CircleGoogleLogin } from '../CircleGoogleLogin'
import { CirclePasskeyLogin } from '../CirclePasskeyLogin'
import { NanLogo } from '../NanLogo'

const F    = "'DM Sans', 'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

type LoginMode = 'choose' | 'email' | 'google' | 'wallet' | 'passkey'

// ── Login options ──────────────────────────────────────────────────────────────
const OPTIONS = [
  {
    id: 'email' as LoginMode,
    label: 'Continue with Email',
    sub: 'One-time code — no password',
    Icon: Mail,
    primary: true,
  },
  {
    id: 'passkey' as LoginMode,
    label: 'Continue with Passkey',
    sub: 'Face ID, Touch ID or device PIN',
    Icon: Fingerprint,
    primary: false,
  },
  {
    id: 'google' as LoginMode,
    label: 'Continue with Google',
    sub: 'Sign in with your Google account',
    Icon: () => (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
        <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
        <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
        <path d="M43.611 20.083H42V20H24v8h11.303a11.966 11.966 0 01-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
      </svg>
    ),
    primary: false,
  },
  {
    id: 'wallet' as LoginMode,
    label: 'Continue with Wallet',
    sub: 'MetaMask, Rabby, Coinbase & more',
    Icon: Wallet,
    primary: false,
  },
]

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setActiveView, profile } = useAppStore()
  const [mode, setMode] = useState<LoginMode>('choose')
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (isConnected && address) {
      const token = btoa(`${address}:${Date.now()}`)
      setAuth({ email: address, sessionToken: token, walletAddress: address, walletId: address })
      setActiveView(profile.displayName ? 'home' : 'name')
    }
  }, [isConnected, address, profile.displayName, setAuth, setActiveView])

  const onCircleSuccess = (walletAddress: string, userToken: string, email: string, encryptionKey?: string) => {
    setAuth({ email, sessionToken: userToken, userToken, encryptionKey, walletAddress, walletId: walletAddress, circleWalletAddress: walletAddress })
    setActiveView(profile.displayName ? 'home' : 'name')
  }

  const onPasskeySuccess = (walletAddress: string) => {
    const token = btoa(`passkey:${walletAddress}:${Date.now()}`)
    setAuth({ email: walletAddress, sessionToken: token, walletAddress, walletId: walletAddress, circleWalletAddress: walletAddress, circleWalletId: walletAddress, isPasskeyUser: true })
    setActiveView(profile.displayName ? 'home' : 'name')
  }

  // ── sub-screen wrapper ────────────────────────────────────────────────────
  const subWrap = (children: React.ReactNode) => (
    <Shell>
      <div style={{ marginBottom: 28 }}>
        <button
          onClick={() => setMode('choose')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: F }}
        >
          <ArrowLeft size={16} color="var(--nan-text2)" />
          <span style={{ fontSize: 14, color: 'var(--nan-text2)', fontWeight: 500 }}>Back</span>
        </button>
      </div>
      {children}
    </Shell>
  )

  if (mode === 'email')   return subWrap(<CircleEmailLogin  onBack={() => setMode('choose')} onSuccess={onCircleSuccess} />)
  if (mode === 'passkey') return subWrap(<CirclePasskeyLogin onBack={() => setMode('choose')} onSuccess={onPasskeySuccess} />)
  if (mode === 'google')  return subWrap(<CircleGoogleLogin  onBack={() => setMode('choose')} onSuccess={(a, t, e) => onCircleSuccess(a, t, e)} />)

  if (mode === 'wallet') {
    return subWrap(
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', marginBottom: 6, color: 'var(--nan-text)', fontFamily: F }}>Connect wallet</h2>
        <p style={{ fontSize: 14, color: 'var(--nan-text2)', marginBottom: 24, lineHeight: 1.5 }}>Use MetaMask, Rabby, Coinbase Wallet, or any EIP-1193 browser wallet.</p>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <OptionRow
              label="Open wallet picker"
              sub="Choose from installed wallets"
              Icon={Wallet}
              primary
              hovered={hovered === 'ck'}
              onHover={v => setHovered(v ? 'ck' : null)}
              onClick={() => show?.()}
            />
          )}
        </ConnectKitButton.Custom>
      </div>
    )
  }

  // ── choose screen ──────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <LogoMark />
        </div>
        <h1 style={{
          fontFamily: "'Space Grotesk', 'DM Sans', sans-serif",
          fontSize: 30, fontWeight: 800,
          letterSpacing: '-0.035em',
          color: 'var(--nan-text)',
          margin: '0 0 8px',
        }}>
          Welcome to NAN
        </h1>
        <p style={{ fontSize: 14, color: 'var(--nan-text2)', margin: 0, lineHeight: 1.6 }}>
          The intelligent payment layer.<br />Powered by Circle USDC on Arc.
        </p>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {OPTIONS.map(({ id, label, sub, Icon, primary }) => (
          <OptionRow
            key={id}
            label={label}
            sub={sub}
            Icon={Icon}
            primary={primary}
            hovered={hovered === id}
            onHover={v => setHovered(v ? id : null)}
            onClick={() => setMode(id)}
          />
        ))}
      </div>

      {/* Footer */}
      <p style={{ fontSize: 11, color: 'var(--nan-text3)', textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
        New here? Your wallet is created automatically.<br />
        Arc · Circle USDC · Testnet
      </p>
    </Shell>
  )
}

// ── Shell — full-page centering wrapper ────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--nan-bg)',
      fontFamily: F,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'max(env(safe-area-inset-top,0px),24px) 20px max(env(safe-area-inset-bottom,0px),32px)',
      boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {children}
      </div>
    </div>
  )
}

// ── LogoMark — NanLogo with glow ring ─────────────────────────────────────────
function LogoMark() {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* outer glow ring */}
      <div style={{
        position: 'absolute',
        width: 80, height: 80,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,102,255,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* subtle ring border */}
      <div style={{
        position: 'absolute',
        width: 64, height: 64,
        borderRadius: '50%',
        border: '1px solid rgba(0,102,255,0.20)',
        pointerEvents: 'none',
      }} />
      <NanLogo height={48} />
    </div>
  )
}

// ── OptionRow ─────────────────────────────────────────────────────────────────
function OptionRow({
  label, sub, Icon, primary, hovered, onHover, onClick,
}: {
  label: string
  sub: string
  Icon: React.ElementType
  primary: boolean
  hovered: boolean
  onHover: (v: boolean) => void
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 16px',
        borderRadius: 14,
        border: primary
          ? 'none'
          : `1px solid ${hovered ? 'rgba(0,102,255,0.30)' : 'var(--nan-bdr2)'}`,
        background: primary
          ? hovered ? '#0052CC' : BLUE
          : hovered ? 'rgba(0,102,255,0.05)' : 'var(--nan-surface)',
        cursor: 'pointer',
        fontFamily: F,
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: primary ? '0 4px 18px rgba(0,102,255,0.28)' : 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Icon pill */}
      <div style={{
        width: 38, height: 38,
        borderRadius: 10,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: primary ? 'rgba(255,255,255,0.18)' : 'rgba(0,102,255,0.08)',
      }}>
        <Icon size={18} color={primary ? '#fff' : BLUE} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: primary ? '#fff' : 'var(--nan-text)', lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 11, color: primary ? 'rgba(255,255,255,0.70)' : 'var(--nan-text3)', marginTop: 2, lineHeight: 1.3 }}>{sub}</div>
      </div>

      {/* Arrow */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: primary ? 0.7 : 0.4 }}>
        <path d="M3 7h8M7 3l4 4-4 4" stroke={primary ? '#fff' : 'var(--nan-text2)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
