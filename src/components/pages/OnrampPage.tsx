import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingCart, AlertCircle, Check, X, RefreshCw, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

// NAN design tokens
const F     = "'Inter', -apple-system, sans-serif"
const SURF  = 'var(--nan-surface)'
const SURF2 = 'var(--nan-surface2)'
const BDR   = 'var(--nan-bdr)'
const BLUE  = '#0066FF'
const TEXT  = 'var(--nan-text)'
const T2    = 'var(--nan-text2)'
const T3    = 'var(--nan-text3)'

// Widget origins for postMessage security. Sandbox is used with Arc Testnet; production for mainnet.
// Per https://docs.arc.io/app-kit/references/onramp-hosting-requirements the origin must match
// what the server minted the session against, so we also derive it from session.widgetUrl.
const WIDGET_ORIGINS = ['https://onramp-sandbox.arc.io', 'https://onramp.arc.io']
function widgetOriginOf(url?: string): string | null {
  try { return url ? new URL(url).origin : null } catch { return null }
}

// Onramp session response shape
interface OnrampSession {
  sessionId?: string
  sessionToken?: string
  widgetUrl?: string
  expiresAt?: string
}

// Deposit event payload from the widget
interface DepositPayload {
  amount?: number | string
  tokenSymbol?: string
  paymentMethod?: string
  settlementExpected?: boolean
  orderId?: string
  transactionHash?: string
}

type WidgetEvent =
  | 'INITIALIZATION_SUCCESS'
  | 'INITIALIZATION_ERROR'
  | 'DEPOSIT_SUBMITTED'
  | 'DEPOSIT_SETTLED'
  | 'DEPOSIT_NOT_COMPLETED'

type OnrampState = 'idle' | 'loading' | 'widget' | 'success' | 'error'

const PRESETS = [20, 50, 100, 200]

export function OnrampPage() {
  const { address: wagmiAddress, isConnected } = useAccount()
  const { auth } = useAppStore()
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const isReady = isConnected || !!address

  const [amount, setAmount] = useState(100)
  const [custom, setCustom] = useState('100')
  const [state, setState] = useState<OnrampState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<OnrampSession | null>(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [depositInfo, setDepositInfo] = useState<DepositPayload | null>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Dedupe DEPOSIT_SUBMITTED + DEPOSIT_SETTLED
  const credited = useRef(false)

  const setAmt = (v: number) => { setAmount(v); setCustom(String(v)) }
  const onCustom = (v: string) => {
    setCustom(v)
    const n = parseFloat(v)
    if (!isNaN(n) && n > 0) setAmount(n)
  }

  // ── Fetch session from server ──────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    if (!address) return
    setState('loading')
    setError(null)
    setWidgetReady(false)
    credited.current = false

    try {
      const res = await fetch('/api/circle-services?service=onramp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appUserId: address,
          destinationAddress: address,
          amount: String(amount),
        }),
      })

      if (!res.ok) {
        if (res.status === 503) {
          setError('Onramp is not configured: add CIRCLE_STABLECOIN_KIT_API_KEY (sandbox key) to the server environment')
          setState('error')
          return
        }
        // Read as text first so a non-JSON crash page still gives a useful message
        const raw = await res.text().catch(() => '')
        let msg: string | undefined
        try {
          const j = JSON.parse(raw) as { message?: string; error?: string }
          msg = j.message ?? j.error
        } catch { /* non-JSON body */ }
        throw new Error(msg ?? (raw ? `HTTP ${res.status}: ${raw.slice(0, 160)}` : `HTTP ${res.status}`))
      }

      const data = await res.json() as OnrampSession
      if (!data.widgetUrl) throw new Error('No widget URL returned from Circle')

      setSession(data)
      setState('widget')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start onramp')
      setState('error')
    }
  }, [address, amount])

  // ── postMessage listener for widget lifecycle events ───────────────────────
  useEffect(() => {
    if (state !== 'widget') return

    function handleMessage(evt: MessageEvent) {
      // Security: only trust messages from the Circle onramp widget origin
      const sessionOrigin = widgetOriginOf(session?.widgetUrl)
      if (evt.origin !== sessionOrigin && !WIDGET_ORIGINS.includes(evt.origin)) return

      const msg = evt.data as { event?: WidgetEvent; code?: string; payload?: DepositPayload }
      if (!msg?.event) return

      switch (msg.event) {
        case 'INITIALIZATION_SUCCESS':
          setWidgetReady(true)
          break

        case 'INITIALIZATION_ERROR':
          if (msg.code === 'INVALID_SESSION_TOKEN' || msg.code === 'SESSION_TIMEOUT') {
            // Re-mint session
            void fetchSession()
          } else {
            setError('Widget failed to initialize. Please try again.')
            setState('error')
          }
          break

        case 'DEPOSIT_SUBMITTED':
        case 'DEPOSIT_SETTLED': {
          if (credited.current) break
          credited.current = true
          setDepositInfo(msg.payload ?? null)
          setState('success')
          break
        }

        case 'DEPOSIT_NOT_COMPLETED':
          if (msg.code === 'CANCELED_BY_CUSTOMER') {
            setState('idle')
          } else if (msg.code === 'SESSION_TIMEOUT' || msg.code === 'INVALID_SESSION_TOKEN') {
            void fetchSession()
          } else {
            setError(`Purchase not completed: ${msg.code ?? 'unknown reason'}`)
            setState('error')
          }
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [state, fetchSession, session])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setSession(null)
    setWidgetReady(false)
    setDepositInfo(null)
    setError(null)
    credited.current = false
    setState('idle')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F, width: '100%', paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 20px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShoppingCart size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Buy USDC</div>
          <div style={{ fontSize: 12, color: T2 }}>Powered by Circle · lands on Arc Testnet</div>
        </div>
      </div>

      {/* Not connected */}
      {!isReady && (
        <div style={{ marginBottom: 16, padding: 14, background: `rgba(0,102,255,0.06)`, borderRadius: 12, border: `1px solid rgba(0,102,255,0.15)`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: T2, fontSize: 13, margin: 0 }}>Connect your wallet on the Home screen first</p>
        </div>
      )}

      {/* ── IDLE / AMOUNT PICKER ── */}
      {(state === 'idle' || state === 'error') && (
        <>
          {/* Destination */}
          {isReady && address && (
            <div style={{ marginBottom: 16, padding: 14, background: SURF, borderRadius: 12, border: `1px solid ${BDR}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Destination Wallet</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: 'monospace' }}>{address.slice(0, 10)}...{address.slice(-8)}</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>Arc Testnet · USDC</div>
            </div>
          )}

          {/* Amount */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Amount (USD)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 56, borderRadius: 14, border: `1px solid ${BDR}`, background: SURF2 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: T2 }}>$</span>
              <input
                type="number" value={custom}
                onChange={e => onCustom(e.target.value)} min={1}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 24, fontWeight: 700, color: TEXT, background: 'transparent', fontFamily: F }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: T2 }}>USD</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 10 }}>
              {PRESETS.map(a => (
                <button key={a} onClick={() => setAmt(a)}
                  style={{ height: 40, borderRadius: 10, background: amount === a ? BLUE : SURF, color: amount === a ? '#fff' : T2, border: `1px solid ${amount === a ? BLUE : BDR}`, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: F, transition: 'all 0.15s' }}>
                  ${a}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {state === 'error' && error && (
            <div style={{ display: 'flex', gap: 10, padding: 14, background: 'rgba(255,68,68,0.08)', borderRadius: 12, border: '1px solid rgba(255,68,68,0.20)', marginBottom: 16 }}>
              <AlertCircle size={16} color="#FF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ color: '#FF4444', fontSize: 13, margin: 0, lineHeight: 1.4 }}>{error}</p>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => { void fetchSession() }}
            disabled={!isReady}
            style={{ width: '100%', height: 54, borderRadius: 14, background: !isReady ? SURF : BLUE, color: !isReady ? T2 : '#fff', border: 'none', cursor: !isReady ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}>
            Buy ${amount} USDC →
          </button>
        </>
      )}

      {/* ── LOADING ── */}
      {state === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `rgba(0,102,255,0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={26} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>Opening Circle Onramp…</div>
          <div style={{ fontSize: 13, color: T2 }}>Minting a secure session</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── WIDGET (iframe) ── */}
      {state === 'widget' && session?.widgetUrl && (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1px solid ${BDR}`, background: SURF }}>
          {/* Close button */}
          <button
            onClick={reset}
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>

          {/* Branded loading state — hidden once widget fires INITIALIZATION_SUCCESS */}
          {!widgetReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: SURF, zIndex: 5, gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: `rgba(0,102,255,0.1)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={22} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>Loading Circle Onramp…</div>
            </div>
          )}

          {/* The widget iframe — Circle handles KYC, payment, compliance */}
          <iframe
            ref={iframeRef}
            src={session.widgetUrl}
            title="Circle Onramp"
            allow="camera; microphone; payment; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: '100%', height: 720, border: 'none', display: 'block' }}
          />
        </div>
      )}

      {/* ── SUCCESS ── */}
      {state === 'success' && (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: SURF, borderRadius: 16, border: `1px solid rgba(0,200,83,0.20)` }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,200,83,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={26} color="#00C853" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, color: TEXT, marginBottom: 6 }}>
            {depositInfo?.tokenSymbol
              ? `${depositInfo.amount} ${depositInfo.tokenSymbol} incoming`
              : 'Purchase submitted!'}
          </div>
          <div style={{ fontSize: 13, color: T2, marginBottom: 8, lineHeight: 1.5 }}>
            {depositInfo?.settlementExpected === false
              ? 'USDC will arrive in your wallet shortly.'
              : 'Your purchase was submitted. USDC will arrive on Arc Testnet once settled.'}
          </div>
          {depositInfo?.transactionHash && (
            <div style={{ fontSize: 11, color: T3, fontFamily: 'monospace', marginBottom: 20, wordBreak: 'break-all' }}>
              tx: {depositInfo.transactionHash}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{ padding: '11px 24px', borderRadius: 12, background: BLUE, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: F }}>
              Buy more USDC
            </button>
            <button
              onClick={() => { void fetchSession() }}
              style={{ padding: '11px 16px', borderRadius: 12, background: SURF2, color: T2, border: `1px solid ${BDR}`, cursor: 'pointer', fontSize: 14, fontFamily: F, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={14} /> New session
            </button>
          </div>
        </div>
      )}

      <p style={{ textAlign: 'center', fontSize: 12, color: T3, marginTop: 14, lineHeight: 1.5 }}>
        Powered by Circle · KYC &amp; compliance handled by Circle
      </p>
    </div>
  )
}
