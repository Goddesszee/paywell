import React, { useState } from 'react'
import { useAccount } from 'wagmi'

import { ArrowLeft, Droplet, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const PW_BG      = '#FFFFFF'
const PW_SURFACE = '#F7F7F8'
const PW_BORDER  = '#E4E4E7'
const PW_TEXT    = '#0D0D0D'
const PW_TEXT_2  = '#5C5C6B'
const PW_BLACK   = '#0D0D0D'
const PW_WHITE   = '#FFFFFF'
const SANS       = 'Inter, sans-serif'

export function FaucetPage() {
  const { address, isConnected } = useAccount()
  const setActiveView = useAppStore(s => s.setActiveView)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cooldownMs, setCooldownMs] = useState<number | null>(null)

  const handleClaim = async () => {
    if (!isConnected || !address) {
      setError('Connect your wallet first')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setCooldownMs(null)

    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      const data = await res.json().catch(() => ({})) as {
        ok?: boolean
        message?: string
        retryAfterMs?: number
      }

      if (!res.ok) {
        if (res.status === 503) {
          setError('Add CIRCLE_DEVELOPER_CONTROLLED_API_KEY to Vercel environment variables to activate the faucet')
          return
        }
        if (res.status === 429) {
          setCooldownMs(data.retryAfterMs ?? null)
          setError(data.message ?? 'This address already claimed testnet funds recently')
          return
        }
        throw new Error(data.message ?? `Faucet returned HTTP ${res.status}`)
      }

      setSuccess(data.message ?? 'Testnet USDC is on its way.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request testnet funds')
    } finally {
      setLoading(false)
    }
  }

  const cooldownLabel = cooldownMs != null
    ? `Try again in ${Math.max(1, Math.ceil(cooldownMs / (60 * 60 * 1000)))}h`
    : null

  return (
    <div style={{ minHeight: '100dvh', background: PW_BG, fontFamily: SANS }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: PW_BG, borderBottom: `1px solid ${PW_BORDER}`,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 56,
      }}>
        <button onClick={() => setActiveView('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
          <ArrowLeft size={20} color={PW_TEXT} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 17, color: PW_TEXT }}>Testnet Faucet</span>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 40px' }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: PW_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Droplet size={28} color={PW_WHITE} />
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 14, color: PW_TEXT_2, marginBottom: 20, lineHeight: 1.5 }}>
          Get free testnet USDC on Arc Testnet — funds both your gas balance and your
          spendable balance, since Arc's gas token is USDC itself.
        </p>

        {/* Destination */}
        {isConnected && address && (
          <div style={{ marginBottom: 20, padding: 14, background: PW_SURFACE, borderRadius: 12, border: `1px solid ${PW_BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Receiving Wallet</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: PW_TEXT, fontFamily: 'monospace' }}>
              {address.slice(0, 10)}...{address.slice(-8)}
            </div>
            <div style={{ fontSize: 12, color: PW_TEXT_2, marginTop: 2 }}>Arc Testnet · USDC</div>
          </div>
        )}

        {!isConnected && (
          <div style={{ marginBottom: 20, padding: 16, background: '#FFF9EC', borderRadius: 12, border: '1px solid #F5D78E', textAlign: 'center' }}>
            <p style={{ color: '#92600A', fontSize: 14, margin: 0 }}>Connect your wallet on the Home screen first</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: 14, background: '#FEF2F2', borderRadius: 12, border: '1px solid #FCA5A5', marginBottom: 16 }}>
            <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ color: '#DC2626', fontSize: 14, margin: 0, lineHeight: 1.4 }}>{error}</p>
              {cooldownLabel && (
                <p style={{ color: '#DC2626', fontSize: 12, margin: '4px 0 0', opacity: 0.8 }}>{cooldownLabel}</p>
              )}
            </div>
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{ textAlign: 'center', padding: '32px 16px', background: PW_SURFACE, borderRadius: 16, marginBottom: 20 }}>
            <CheckCircle2 size={36} color="#16A34A" style={{ marginBottom: 12 }} />
            <p style={{ fontWeight: 700, fontSize: 17, color: PW_TEXT, marginBottom: 6 }}>Request Sent</p>
            <p style={{ fontSize: 14, color: PW_TEXT_2, marginBottom: 0 }}>{success}</p>
          </div>
        )}

        {/* CTA */}
        {!success && (
          <button
            onClick={handleClaim}
            disabled={loading || !isConnected}
            style={{
              width: '100%', height: 56, borderRadius: 16,
              background: loading || !isConnected ? '#E4E4E7' : PW_BLACK,
              color: loading || !isConnected ? PW_TEXT_2 : PW_WHITE,
              border: 'none', cursor: loading || !isConnected ? 'not-allowed' : 'pointer',
              fontSize: 16, fontWeight: 700, fontFamily: SANS,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? 'Requesting…' : 'Claim Testnet USDC →'}
          </button>
        )}

        {success && (
          <button onClick={() => { setSuccess(null); setError(null) }} style={{
            width: '100%', height: 48, borderRadius: 14, background: 'transparent',
            color: PW_TEXT_2, border: `1.5px solid ${PW_BORDER}`, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, fontFamily: SANS, marginTop: 4,
          }}>
            Back
          </button>
        )}

        {/* Info note */}
        <p style={{ textAlign: 'center', fontSize: 12, color: PW_TEXT_2, marginTop: 16, lineHeight: 1.5 }}>
          Powered by Circle's testnet faucet · One claim per wallet every 24 hours
        </p>
      </div>
    </div>
  )
}
