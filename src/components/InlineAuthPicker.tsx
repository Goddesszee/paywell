/**
 * InlineAuthPicker — compact auth chooser for public pay pages.
 *
 * Three paths:
 *  1. Connect crypto wallet (MetaMask / WalletConnect via ConnectKit)
 *  2. Email — create a new NAN Circle wallet or sign in to an existing one
 *     (CircleEmailLogin handles both: existing users skip wallet creation)
 *
 * Props:
 *  onWalletConnected — called when a wagmi wallet connects (address available)
 *  onCircleSuccess   — called when Circle email login finishes
 *  onBack            — optional: show a back button at the top
 *  dark              — true = dark background (invoice page), false = light (app)
 */
import React, { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'
import { Mail, Wallet, ArrowLeft, ChevronRight } from 'lucide-react'
import { CircleEmailLogin } from './CircleEmailLogin'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0866F5'

type Mode = 'choose' | 'email'

interface Props {
  onWalletConnected?: (address: string) => void
  onCircleSuccess: (walletAddress: string, userToken: string, email: string, encryptionKey?: string) => void
  onBack?: () => void
  dark?: boolean
}

export function InlineAuthPicker({ onWalletConnected, onCircleSuccess, onBack, dark = true }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const { setOpen } = useModal()
  const { address, isConnected } = useAccount()

  const text     = dark ? '#fff'                    : 'var(--nan-text)'
  const text2    = dark ? 'rgba(255,255,255,0.55)'  : 'var(--nan-text2)'
  const surf     = dark ? 'rgba(255,255,255,0.06)'  : 'var(--nan-surface)'
  const bdr      = dark ? 'rgba(255,255,255,0.12)'  : 'var(--nan-bdr)'
  const bdrHover = dark ? 'rgba(255,255,255,0.20)'  : 'rgba(8,102,245,0.3)'

  // When a wagmi wallet connects while the picker is open, fire the callback
  useEffect(() => {
    if (isConnected && address && onWalletConnected) {
      onWalletConnected(address)
    }
  }, [isConnected, address, onWalletConnected])

  if (mode === 'email') {
    return (
      <div style={{ fontFamily: F }}>
        <button
          onClick={() => setMode('choose')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: text2, fontSize: 12, cursor: 'pointer', fontFamily: F, marginBottom: 18, padding: 0 }}>
          <ArrowLeft size={13} /> Back
        </button>
        <CircleEmailLogin onSuccess={onCircleSuccess} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: F }}>
      {onBack && (
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: text2, fontSize: 12, cursor: 'pointer', fontFamily: F, marginBottom: 14, padding: 0 }}>
          <ArrowLeft size={13} /> Back
        </button>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 4 }}>How would you like to pay?</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.5, marginBottom: 18 }}>
        Connect an existing crypto wallet, or sign in with email to use your NAN wallet.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Option 1 — Connect wallet (MetaMask, WalletConnect, Coinbase, etc.) */}
        <button
          onClick={() => setOpen(true)}
          style={{ width: '100%', minHeight: 60, background: surf, border: `1px solid ${bdr}`, borderRadius: 14, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', textAlign: 'left' }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 10, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 2 }}>Connect wallet</div>
            <div style={{ fontSize: 12, color: text2 }}>MetaMask, WalletConnect, Coinbase Wallet &amp; more</div>
          </div>
          <ChevronRight size={16} color={text2} />
        </button>

        {/* Option 2 — Email: create new wallet or sign in */}
        <button
          onClick={() => setMode('email')}
          style={{ width: '100%', minHeight: 60, background: surf, border: `1px solid ${bdrHover}`, borderRadius: 14, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', textAlign: 'left' }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(8,102,245,0.15)', border: `1px solid rgba(8,102,245,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={18} color={BLUE} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 2 }}>Email — NAN wallet</div>
            <div style={{ fontSize: 12, color: text2 }}>Create a free wallet or sign in to your existing one</div>
          </div>
          <ChevronRight size={16} color={text2} />
        </button>

      </div>

      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: text2 }}>
        Your existing Circle wallet is used if you already have one with this email.
      </div>
    </div>
  )
}
