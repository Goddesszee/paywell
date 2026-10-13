import React, { useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Wallet } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F     = "'Inter', -apple-system, sans-serif"
const BLUE  = '#0866F5'
const TEXT  = 'var(--nan-text)'
const TEXT2 = '#8A8F9E'
const TEXT3 = '#50556A'
const BG    = 'var(--nan-bg)'

export function LoginPage() {
  const { address, isConnected } = useAccount()
  const { setAuth, setActiveView, setShowWelcome } = useAppStore()

  // When a wagmi wallet connects, sign in immediately.
  useEffect(() => {
    if (isConnected && address) {
      const token = btoa(`${address}:${Date.now()}`)
      setAuth({ email: address, sessionToken: token, walletAddress: address, walletId: address })
      setShowWelcome(true)
      setActiveView('home')
    }
  }, [isConnected, address, setAuth, setActiveView, setShowWelcome])

  return (
    <div style={{
      minHeight: '100dvh', background: BG, fontFamily: F,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflowY: 'auto',
      padding: 'max(env(safe-area-inset-top,0px),32px) 20px max(env(safe-area-inset-bottom,0px),32px)',
    }}>
      <div style={{ width: '100%', maxWidth: 380, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
        {/* Logo / heading */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1.1 }}>NAN</div>
          <div style={{ fontSize: 13, color: TEXT2, marginTop: 6 }}>Pay with USDC on Arc</div>
        </div>

        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} style={btnS(BLUE, '#fff')}>
              <Wallet size={17} />
              <span>Connect Wallet</span>
            </button>
          )}
        </ConnectKitButton.Custom>

        <p style={{ fontSize: 12, color: TEXT3, textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          Connect MetaMask, Coinbase Wallet, or any browser wallet to get started.
        </p>
      </div>
      <p style={{ fontSize: 11, color: TEXT3, marginTop: 24, textAlign: 'center' }}>
        Arc · Circle USDC
      </p>
    </div>
  )
}

// ── style helper ──────────────────────────────────────────────────────────────
function btnS(bg: string, color: string): React.CSSProperties {
  return {
    width: '100%', padding: '13px 20px',
    background: bg, color, border: 'none',
    borderRadius: 12, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', fontFamily: F,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    transition: 'opacity 0.15s', letterSpacing: '-0.01em',
  }
}
