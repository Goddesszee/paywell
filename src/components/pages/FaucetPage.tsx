import React from 'react'
import { ArrowLeft, Zap } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const PW_BG      = 'var(--nan-bg)'
const PW_SURFACE = 'var(--nan-surface)'
const PW_BORDER  = 'var(--nan-bdr)'
const PW_TEXT    = 'var(--nan-text)'
const PW_TEXT_2  = 'var(--nan-text2)'
const PW_BLACK   = 'var(--nan-blue)'
const PW_WHITE   = 'var(--nan-surface2)'
const SANS       = 'Inter, sans-serif'

/**
 * FaucetPage — mainnet variant.
 * The testnet faucet is disabled on mainnet. This page redirects users to
 * the Onramp (Buy USDC) flow as the correct way to fund their wallet.
 */
export function FaucetPage() {
  const setActiveView = useAppStore(s => s.setActiveView)

  return (
    <div style={{ minHeight: '100dvh', background: PW_BG, fontFamily: SANS }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: PW_BG, borderBottom: `1px solid ${PW_BORDER}`,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 56,
      }}>
        <button
          onClick={() => setActiveView('home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
        >
          <ArrowLeft size={20} color={PW_TEXT} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, color: PW_TEXT }}>Add Funds</span>
      </div>

      <div style={{ width: '100%', padding: '40px 16px' }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: PW_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={28} color={PW_WHITE} />
          </div>
        </div>

        <h2 style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: PW_TEXT, marginBottom: 10 }}>
          Buy USDC
        </h2>
        <p style={{ textAlign: 'center', fontSize: 14, color: PW_TEXT_2, marginBottom: 32, lineHeight: 1.6 }}>
          NAN runs on mainnet. Add real USDC to your wallet using a card,
          Apple Pay, Google Pay, or bank transfer.
        </p>

        <div style={{
          padding: 20, background: PW_SURFACE, borderRadius: 16,
          border: `1px solid ${PW_BORDER}`, marginBottom: 20,
        }}>
          <p style={{ fontSize: 13, color: PW_TEXT_2, margin: 0, lineHeight: 1.6 }}>
            The testnet faucet is not available on mainnet. Use <strong style={{ color: PW_TEXT }}>Buy USDC</strong> to
            fund your wallet instantly with a real payment. A 1% platform fee applies.
          </p>
        </div>

        <button
          onClick={() => setActiveView('onramp')}
          style={{
            width: '100%', height: 56, borderRadius: 16,
            background: PW_BLACK, color: PW_WHITE,
            border: 'none', cursor: 'pointer',
            fontSize: 16, fontWeight: 700, fontFamily: SANS,
          }}
        >
          Buy USDC →
        </button>

        <button
          onClick={() => setActiveView('home')}
          style={{
            width: '100%', height: 48, borderRadius: 14, background: 'transparent',
            color: PW_TEXT_2, border: `1.5px solid ${PW_BORDER}`, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: SANS, marginTop: 12,
          }}
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}
