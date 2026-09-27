import React, { useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'

import { ArrowLeft, ShoppingCart, CreditCard, Building2, Smartphone, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const PW_BG      = '#FFFFFF'
const PW_SURFACE = '#F7F7F8'
const PW_BORDER  = '#E4E4E7'
const PW_TEXT    = '#0D0D0D'
const PW_TEXT_2  = '#5C5C6B'
const PW_BLACK   = '#0D0D0D'
const PW_WHITE   = '#FFFFFF'
const SANS       = 'Inter, sans-serif'

const PRESET_AMOUNTS = [20, 50, 100, 200]
const PAYMENT_METHODS = [
  { id: 'Debit',        label: 'Debit Card',    icon: CreditCard },
  { id: 'ApplePay',     label: 'Apple Pay',     icon: Smartphone },
  { id: 'GooglePay',    label: 'Google Pay',    icon: Smartphone },
  { id: 'BankTransfer', label: 'Bank Transfer', icon: Building2 },
]

export function OnrampPage() {
  const { address, isConnected } = useAccount()
  const setActiveView = useAppStore(s => s.setActiveView)

  const [amount, setAmount] = useState(100)
  const [customAmount, setCustomAmount] = useState('100')
  const [paymentMethod, setPaymentMethod] = useState('Debit')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [widgetMounted, setWidgetMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const appKitRef = useRef<AppKit | null>(null)

  // Init AppKit once
  useEffect(() => {
    appKitRef.current = new AppKit()
  }, [])

  const handleAmountChange = (val: number) => {
    setAmount(val)
    setCustomAmount(String(val))
  }

  const handleCustomAmountChange = (val: string) => {
    setCustomAmount(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) setAmount(num)
  }

  const handleBuy = async () => {
    if (!isConnected || !address) {
      setError('Connect your wallet first')
      return
    }
    if (!containerRef.current) return

    setLoading(true)
    setError(null)

    try {
      const kit = appKitRef.current!

      // Fetch session from our backend
      const sessionRes = await fetch('/api/onramp-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: String(amount),
          currency: 'USD',
          blockchain: 'ARC-TESTNET',
          destinationAddress: address,
          paymentMethod,
        }),
      })

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({ message: `HTTP ${sessionRes.status}` }))
        // If 503 (not configured), show helpful message
        if (sessionRes.status === 503) {
          setError('Add CIRCLE_API_KEY to Vercel environment variables to activate onramp')
          return
        }
        throw new Error((err as { message?: string }).message ?? `Session endpoint returned HTTP ${sessionRes.status}`)
      }

      const session = await sessionRes.json() as { id?: string; token?: string }
      if (!session.id && !session.token) throw new Error('Invalid session response from server')

      // Mount the Circle hosted onramp iframe
      containerRef.current.innerHTML = ''
      setWidgetMounted(true)

      kit.onramp.mountIframe({
        session: session as Parameters<typeof kit.onramp.mountIframe>[0]['session'],
        container: containerRef.current,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch onramp')
      setWidgetMounted(false)
    } finally {
      setLoading(false)
    }
  }

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
        <span style={{ fontWeight: 700, fontSize: 17, color: PW_TEXT }}>Buy USDC</span>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 40px' }}>
        {/* Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: PW_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShoppingCart size={28} color={PW_WHITE} />
          </div>
        </div>

        {/* Destination */}
        {isConnected && address && (
          <div style={{ marginBottom: 20, padding: 14, background: PW_SURFACE, borderRadius: 12, border: `1px solid ${PW_BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Destination Wallet</div>
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

        {/* Amount */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Amount (USD)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 56, borderRadius: 14, border: `1.5px solid ${PW_BORDER}`, background: PW_WHITE }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: PW_TEXT_2 }}>$</span>
            <input
              type="number"
              value={customAmount}
              onChange={e => handleCustomAmountChange(e.target.value)}
              min={1}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 24, fontWeight: 700, color: PW_TEXT, background: 'transparent', fontFamily: SANS }}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: PW_TEXT_2 }}>USD</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
            {PRESET_AMOUNTS.map(a => (
              <button key={a} onClick={() => handleAmountChange(a)} style={{
                height: 40, borderRadius: 10,
                background: amount === a ? PW_BLACK : PW_SURFACE,
                color: amount === a ? PW_WHITE : PW_TEXT,
                border: `1.5px solid ${amount === a ? PW_BLACK : PW_BORDER}`,
                fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SANS,
              }}>
                ${a}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Payment Methods</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setPaymentMethod(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                background: paymentMethod === id ? PW_BLACK : PW_WHITE,
                color: paymentMethod === id ? PW_WHITE : PW_TEXT,
                border: `1.5px solid ${paymentMethod === id ? PW_BLACK : PW_BORDER}`,
                fontWeight: 500, fontSize: 14, cursor: 'pointer', fontFamily: SANS,
              }}>
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', gap: 10, padding: 14, background: '#FEF2F2', borderRadius: 12, border: '1px solid #FCA5A5', marginBottom: 16 }}>
            <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: '#DC2626', fontSize: 14, margin: 0, lineHeight: 1.4 }}>{error}</p>
          </div>
        )}

        {/* Widget container — Circle mounts the iframe here */}
        {widgetMounted && (
          <div ref={containerRef} style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${PW_BORDER}`, marginBottom: 20, minHeight: 200 }} />
        )}
        {!widgetMounted && <div ref={containerRef} style={{ display: 'none' }} />}

        {/* CTA */}
        {!widgetMounted && (
          <button
            onClick={handleBuy}
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
            {loading ? 'Loading…' : `Buy $${amount} USDC →`}
          </button>
        )}

        {/* Info note */}
        <p style={{ textAlign: 'center', fontSize: 12, color: PW_TEXT_2, marginTop: 16, lineHeight: 1.5 }}>
          Powered by Circle · KYC & compliance handled · USDC lands on Arc Testnet
        </p>
      </div>
    </div>
  )
}
