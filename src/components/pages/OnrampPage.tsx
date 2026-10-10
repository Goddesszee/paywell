import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingCart, AlertCircle, Check, X, RefreshCw, Loader2, ArrowLeft } from 'lucide-react'
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
  const { auth, onrampPrefill, setOnrampPrefill } = useAppStore()
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

  // Amount requested via the AI agent ("buy 50 USDC")
  useEffect(() => {
    if (onrampPrefill?.amount && onrampPrefill.amount > 0) {
      setAmount(onrampPrefill.amount)
      setCustom(String(onrampPrefill.amount))
      setOnrampPrefill(null)
    }
  }, [onrampPrefill, setOnrampPrefill])

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
      const res = await fetch('/api/onramp-session', {
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

  // ── Copy address helper ────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false)
  const copyAddress = () => {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F, maxWidth: 480, margin: '0 auto', paddingBottom: 96 }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 0 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,102,255,0.30)' }}>
            <ShoppingCart size={18} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: TEXT, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Buy USDC</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Powered by Circle · Arc Testnet</div>
          </div>
          {/* Testnet badge */}
          <div style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: 'rgba(255,149,0,0.10)', border: '1px solid rgba(255,149,0,0.25)', fontSize: 10, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            Testnet
          </div>
        </div>
      </div>

      {/* ── Not connected ── */}
      {!isReady && (
        <div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(0,102,255,0.06)', borderRadius: 14, border: '1px solid rgba(0,102,255,0.15)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color={BLUE} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: T2, fontSize: 13, margin: 0, lineHeight: 1.5 }}>Connect your wallet on the Home screen to continue.</p>
        </div>
      )}

      {/* ── IDLE / AMOUNT PICKER ── */}
      {(state === 'idle' || state === 'error') && (
        <>
          {/* Destination wallet card */}
          {isReady && address && (
            <div style={{ marginBottom: 12, padding: '14px 16px', background: SURF, borderRadius: 16, border: `1px solid ${BDR}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T3, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 8 }}>Destination</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: 'var(--nan-mono, monospace)', letterSpacing: '0.01em' }}>
                    {address.slice(0, 8)}…{address.slice(-6)}
                  </div>
                  <div style={{ fontSize: 11, color: T3, marginTop: 3 }}>Arc Testnet · USDC · ERC-20</div>
                </div>
                <button onClick={copyAddress}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: copied ? 'rgba(0,200,83,0.10)' : SURF2, border: `1px solid ${copied ? 'rgba(0,200,83,0.25)' : BDR}`, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: copied ? '#00C853' : T2, fontFamily: F, transition: 'all 0.15s', flexShrink: 0 }}>
                  {copied ? <><Check size={11} /> Copied</> : 'Copy'}
                </button>
              </div>
              {/* Full address disclosure */}
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 11, color: T3, cursor: 'pointer', userSelect: 'none' as const }}>Verify full address</summary>
                <div style={{ marginTop: 6, padding: '8px 10px', background: SURF2, borderRadius: 8, fontSize: 11, color: T2, fontFamily: 'var(--nan-mono, monospace)', wordBreak: 'break-all' as const, lineHeight: 1.6 }}>{address}</div>
              </details>
            </div>
          )}

          {/* Amount card */}
          <div style={{ marginBottom: 12, padding: '14px 16px', background: SURF, borderRadius: 16, border: `1px solid ${BDR}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T3, letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 10 }}>Amount (USD)</div>
            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${BDR}`, background: SURF2, marginBottom: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: T2, lineHeight: 1 }}>$</span>
              <input
                type="number" value={custom} min={1}
                onChange={e => onCustom(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 32, fontWeight: 800, color: TEXT, background: 'transparent', fontFamily: 'var(--nan-mono, monospace)', letterSpacing: '-0.02em', minWidth: 0 }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: T2, flexShrink: 0 }}>USD</span>
            </div>
            {/* Preset chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {PRESETS.map(a => (
                <button key={a} onClick={() => setAmt(a)}
                  style={{ height: 44, borderRadius: 10, background: amount === a ? BLUE : SURF2, color: amount === a ? '#fff' : T2, border: `1px solid ${amount === a ? BLUE : BDR}`, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: F, transition: 'all 0.15s', boxShadow: amount === a ? '0 2px 10px rgba(0,102,255,0.25)' : 'none', WebkitTapHighlightColor: 'transparent' }}>
                  ${a}
                </button>
              ))}
            </div>
          </div>

          {/* Purchase summary */}
          <div style={{ marginBottom: 12, padding: '4px 16px', background: SURF, borderRadius: 14, border: `1px solid ${BDR}` }}>
            {[
              { label: 'You pay',             value: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD` },
              { label: 'Est. USDC received',  value: `≈ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`, note: 'Rate provided by Circle at checkout' },
              { label: 'Destination network', value: 'Arc Testnet' },
              { label: 'Provider fees',       value: 'Shown at checkout', note: 'Circle discloses fees before confirmation' },
            ].map(({ label, value, note }, i, arr) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${BDR}` : 'none', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: T2 }}>{label}</div>
                  {note && <div style={{ fontSize: 10, color: T3, marginTop: 1 }}>{note}</div>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, textAlign: 'right' as const, flexShrink: 0 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Testnet disclaimer */}
          <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(255,149,0,0.06)', borderRadius: 12, border: '1px solid rgba(255,149,0,0.18)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={13} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: T2, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              This is <strong style={{ color: TEXT }}>Arc Testnet</strong>. Tokens received are test USDC and have no real-world value.
            </p>
          </div>

          {/* Error */}
          {state === 'error' && error && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(255,68,68,0.07)', borderRadius: 12, border: '1px solid rgba(255,68,68,0.20)', marginBottom: 12 }}>
              <AlertCircle size={15} color="#FF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ color: '#FF4444', fontSize: 13, margin: 0, lineHeight: 1.45 }}>{error}</p>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => { void fetchSession() }}
            disabled={!isReady || amount <= 0}
            style={{ width: '100%', height: 54, borderRadius: 14, background: isReady && amount > 0 ? BLUE : SURF2, color: isReady && amount > 0 ? '#fff' : T2, border: 'none', cursor: isReady && amount > 0 ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 800, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s', boxShadow: isReady && amount > 0 ? '0 4px 16px rgba(0,102,255,0.30)' : 'none', letterSpacing: '-0.01em', WebkitTapHighlightColor: 'transparent' }}>
            {!isReady ? 'Connect wallet to continue' : `Buy $${amount} of USDC`}
          </button>
        </>
      )}

      {/* ── LOADING ── */}
      {state === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(0,102,255,0.10)', border: '1px solid rgba(0,102,255,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={28} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Opening Circle Onramp…</div>
          <div style={{ fontSize: 13, color: T2 }}>Minting a secure session</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── WIDGET (iframe) ── */}
      {state === 'widget' && session?.widgetUrl && (
        <div>
          {/* Back navigation bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: SURF, borderRadius: 14, border: `1px solid ${BDR}` }}>
            <button
              onClick={reset}
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}
            >
              <ArrowLeft size={16} color={BLUE} strokeWidth={2.2} />
              <span style={{ fontSize: 14, fontWeight: 600, color: BLUE }}>Back</span>
            </button>
            <span style={{ fontSize: 13, color: T2, flex: 1, textAlign: 'center' }}>Circle Onramp</span>
            <button
              onClick={reset}
              style={{ width: 28, height: 28, borderRadius: 8, background: SURF2, border: `1px solid ${BDR}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
              <X size={13} color={T2} />
            </button>
          </div>
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: `1px solid ${BDR}`, background: SURF }}>
          <button
            onClick={reset}
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <X size={16} color="#fff" />
          </button>
          {!widgetReady && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: SURF, zIndex: 5, gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(0,102,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Loading Circle Onramp…</div>
              <div style={{ fontSize: 12, color: T2 }}>KYC and compliance handled by Circle</div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={session.widgetUrl}
            title="Circle Onramp"
            allow="camera; microphone; payment; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: '100%', height: 720, border: 'none', display: 'block' }}
          />
        </div>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {state === 'success' && (
        <div style={{ padding: '32px 20px', background: SURF, borderRadius: 18, border: '1px solid rgba(0,200,83,0.20)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(0,200,83,0.10)', border: '2px solid rgba(0,200,83,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Check size={28} color="#00C853" strokeWidth={2} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, color: TEXT, marginBottom: 8, letterSpacing: '-0.03em' }}>
            {depositInfo?.tokenSymbol
              ? `${depositInfo.amount} ${depositInfo.tokenSymbol} incoming`
              : 'Purchase submitted!'}
          </div>
          <div style={{ fontSize: 13, color: T2, marginBottom: 16, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 16px' }}>
            {depositInfo?.settlementExpected === false
              ? 'USDC will arrive in your wallet shortly.'
              : 'Your purchase was submitted. USDC will arrive on Arc Testnet once settled by Circle.'}
          </div>
          {depositInfo?.transactionHash && (
            <div style={{ fontSize: 11, color: T3, fontFamily: 'var(--nan-mono, monospace)', marginBottom: 20, wordBreak: 'break-all', padding: '8px 12px', background: SURF2, borderRadius: 8 }}>
              {depositInfo.transactionHash}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={reset}
              style={{ padding: '12px 28px', borderRadius: 12, background: BLUE, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: F, boxShadow: '0 4px 12px rgba(0,102,255,0.25)' }}>
              Buy more USDC
            </button>
            <button onClick={() => { void fetchSession() }}
              style={{ padding: '12px 16px', borderRadius: 12, background: SURF2, color: T2, border: `1px solid ${BDR}`, cursor: 'pointer', fontSize: 14, fontFamily: F, display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={14} /> New session
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <p style={{ textAlign: 'center', fontSize: 11, color: T3, marginTop: 16, lineHeight: 1.6 }}>
        Powered by Circle · KYC &amp; compliance handled by Circle<br />
        Testnet tokens have no monetary value
      </p>
    </div>
  )
}
