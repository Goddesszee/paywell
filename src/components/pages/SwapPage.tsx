import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowDown, Settings, ChevronDown, CheckCircle, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { swapFee, SWAP_FEE_BPS, bpsToPercent, FEE_WALLET } from '../../lib/fees'
import { useNanTheme } from '../../hooks/useNanTheme'

const appKit = new AppKit()

const CHAIN_ID = 5042002
const CHAIN_KEY = 'Arc_Testnet'

const TOKENS = ['USDC', 'EURC', 'USDT', 'PYUSD', 'WETH', 'WBTC'] as const
type Token = typeof TOKENS[number]

type Phase = 'idle' | 'estimating' | 'reviewed' | 'swapping' | 'done' | 'error'

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: Token
  tokenOut: Token
  amountIn: string
  account: string | undefined
}

// ── Token icon pill ───────────────────────────────────────────────────────────
function TokenPill({
  token,
  onChange,
  exclude,
  c,
}: {
  token: Token
  onChange: (t: Token) => void
  exclude: Token
  c: ReturnType<typeof useNanTheme>
}) {
  const [open, setOpen] = useState(false)
  const available = TOKENS.filter(t => t !== exclude)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 12px 8px 10px',
          background: c.surf2, border: `1px solid ${c.bdr2}`,
          borderRadius: 100, cursor: 'pointer',
          fontFamily: 'var(--nan-font)', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{token}</span>
        <ChevronDown size={13} color={c.t2} />
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            background: c.surf2, border: `1px solid ${c.bdr2}`,
            borderRadius: 12, overflow: 'hidden', minWidth: 130,
            boxShadow: c.isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            {available.map(t => (
              <button
                key={t}
                onClick={() => { onChange(t); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', padding: '10px 14px',
                  textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: t === token ? c.blueDim : 'transparent',
                  color: t === token ? c.blue : c.text,
                  fontFamily: 'var(--nan-font)', fontSize: 14, fontWeight: 600,
                  transition: 'background 0.1s',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SwapPage() {
  const c = useNanTheme()
  const { connector, isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)
  const recordFee = useAppStore(s => s.recordFee)

  const [tab, setTab] = useState<'swap' | 'buy'>('swap')
  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amountIn, setAmountIn] = useState('')
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')

  const sameToken = tokenIn === tokenOut
  // Arc: USDC ↔ EURC is fine; but USDC ↔ NATIVE is a no-op — block same-asset pairs
  const canReview = isConnected && !!amountIn && parseFloat(amountIn) > 0 && !sameToken

  const addrShort = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : ''

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const reviewSwap = async () => {
    if (!canReview) return
    setPhase('estimating')
    setErrMsg('')
    try {
      const adapter = await getAdapter()
      const estimate = await appKit.estimateSwap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn,
        tokenOut,
        amountIn,
        config: { slippageBps: 100 },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn, account: address })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Estimation failed.')
    }
  }

  const executeSwap = async () => {
    if (!reviewed) return
    if (address !== reviewed.account) {
      setPhase('error')
      setErrMsg('Wallet changed since estimate. Get a new quote.')
      return
    }
    setPhase('swapping')
    setErrMsg('')
    try {
      const adapter = await getAdapter()
      const result = await appKit.swap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn: reviewed.tokenIn,
        tokenOut: reviewed.tokenOut,
        amountIn: reviewed.amountIn,
        config: { slippageBps: 100 },
      })
      const rHash = (result as { txHash?: string }).txHash ?? ''
      const rUrl = (result as { explorerUrl?: string }).explorerUrl ?? ''
      setTxHash(rHash)
      setExplorerUrl(rUrl)
      setPhase('done')

      const gross = parseFloat(reviewed.amountIn)
      const fee = swapFee(gross)
      addActivity({
        type: 'swap',
        description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`,
        amount: gross,
        sign: '-',
        status: 'confirmed',
        counterparty: reviewed.tokenOut,
        txHash: rHash,
      })
      if (fee > 0) {
        recordFee({
          source: 'swap',
          grossAmount: gross,
          feeAmount: fee,
          feeWallet: FEE_WALLET,
          txHash: rHash,
          description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`,
        })
      }
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
    }
  }

  const flipTokens = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setReviewed(null)
    setPhase('idle')
  }

  const reset = () => {
    setAmountIn('')
    setReviewed(null)
    setPhase('idle')
    setErrMsg('')
    setTxHash('')
  }

  const clearQuote = () => {
    setReviewed(null)
    setPhase('idle')
  }

  const estimatedOut = reviewed?.estimate?.estimatedOutput

  // ── Success screen ────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>
      <div style={{ textAlign: 'center', padding: '56px 24px 32px' }}>
        <div className="nan-check-circle" style={{ margin: '0 auto 18px' }}>
          <CheckCircle size={28} color={c.green} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: c.text, letterSpacing: '-0.025em', marginBottom: 6 }}>
          Swap complete
        </div>
        <div style={{ fontSize: 14, color: c.t2, marginBottom: 28 }}>
          Your tokens have been exchanged.
        </div>
        {txHash && (
          <a
            href={explorerUrl || `https://explorer.testnet.arc.io/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: c.blue, textDecoration: 'none',
              background: c.blueDim, border: `1px solid ${c.blueBd}`,
              borderRadius: 8, padding: '8px 14px', marginBottom: 28,
            }}
          >
            {txHash.slice(0, 14)}… <ExternalLink size={12} />
          </a>
        )}
        <button
          onClick={reset}
          className="nan-btn nan-btn-primary nan-btn-full"
          style={{ borderRadius: 14 }}
        >
          Swap again
        </button>
      </div>
    </div>
  )

  // ── Main swap UI ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>

      {/* ── Tab bar + settings ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <div style={{ display: 'flex', background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 10, padding: 3, gap: 2 }}>
          {(['swap', 'buy'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: tab === t ? (c.isDark ? c.surf2 : '#fff') : 'transparent',
                color: tab === t ? c.text : c.t2,
                fontFamily: 'var(--nan-font)', fontSize: 14,
                fontWeight: tab === t ? 700 : 500,
                boxShadow: tab === t ? (c.isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.10)') : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button
          style={{
            width: 36, height: 36, borderRadius: 9, border: `1px solid ${c.bdr}`,
            background: c.surf, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <Settings size={15} color={c.t2} />
        </button>
      </div>

      {/* ── Sell panel ── */}
      <div style={{
        background: c.surf, border: `1px solid ${c.bdr}`,
        borderRadius: 16, overflow: 'hidden', marginBottom: 2,
      }}>
        <div style={{ padding: '16px 16px 12px' }}>
          {/* Label + wallet */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Sell</span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.blue, display: 'inline-block' }} />
                {addrShort}
              </span>
            )}
          </div>

          {/* Amount + token */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amountIn}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) {
                  setAmountIn(v)
                  setReviewed(null)
                  setPhase('idle')
                }
              }}
              disabled={phase === 'swapping'}
              style={{
                flex: 1, fontSize: 36, fontWeight: 700, color: c.text,
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--nan-mono)', minWidth: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <TokenPill token={tokenIn} onChange={t => { setTokenIn(t); setReviewed(null); setPhase('idle') }} exclude={tokenOut} c={c} />
          </div>

          {/* USD value + balance */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>
              {amountIn && parseFloat(amountIn) > 0 ? `$${parseFloat(amountIn).toFixed(2)}` : '$0.00'}
            </span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3 }}>Balance: —</span>
            )}
          </div>

          {/* Quick % chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {['20%', '50%', 'MAX'].map(v => (
              <button
                key={v}
                style={{
                  flex: 1, padding: '6px 0', border: `1px solid ${c.bdr2}`,
                  borderRadius: 7, background: c.surf2, color: c.t2,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--nan-font)', transition: 'all 0.12s',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Flip button ── */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-1px 0', zIndex: 2, position: 'relative' }}>
        <button
          onClick={flipTokens}
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: `1px solid ${c.bdr2}`, background: c.surf2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: c.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <ArrowDown size={15} color={c.t2} />
        </button>
      </div>

      {/* ── Buy panel ── */}
      <div style={{
        background: c.surf, border: `1px solid ${c.bdr}`,
        borderRadius: 16, overflow: 'hidden', marginTop: 2, marginBottom: 10,
      }}>
        <div style={{ padding: '16px 16px 18px' }}>
          {/* Label + wallet */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Buy</span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.blue, display: 'inline-block' }} />
                {addrShort}
              </span>
            )}
          </div>

          {/* Amount + token */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, fontSize: 36, fontWeight: 700,
              color: estimatedOut ? c.green : c.t3,
              fontFamily: 'var(--nan-mono)', minWidth: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {phase === 'estimating'
                ? <span className="nan-skel" style={{ display: 'inline-block', width: 80, height: 36, borderRadius: 8 }} />
                : estimatedOut ? estimatedOut.amount : '0'}
            </div>
            <TokenPill token={tokenOut} onChange={t => { setTokenOut(t); setReviewed(null); setPhase('idle') }} exclude={tokenIn} c={c} />
          </div>

          {/* USD + balance */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>$0.00</span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3 }}>Balance: —</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Warning: same token ── */}
      {sameToken && (
        <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <AlertCircle size={14} />
          <span>Choose different tokens to swap.</span>
        </div>
      )}

      {/* ── Quote details ── */}
      {reviewed && phase === 'reviewed' && (
        <div className="nan-card" style={{ marginBottom: 10 }}>
          <div className="nan-card-inner">
            {[
              ['Estimated output', `${estimatedOut?.amount ?? '—'} ${estimatedOut?.token ?? tokenOut}`],
              ['Slippage tolerance', '1%'],
              [`NAN fee (${bpsToPercent(SWAP_FEE_BPS)})`, `${swapFee(parseFloat(reviewed.amountIn) || 0).toFixed(4)} ${reviewed.tokenIn}`],
              ...(reviewed.estimate.fees?.map(f => [`${f.type} fee`, `${f.amount} ${f.token}`]) ?? []),
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: `1px solid ${c.bdr}`,
              }}>
                <span style={{ fontSize: 12, color: c.t2 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{value}</span>
              </div>
            ))}
            <div style={{ paddingTop: 8, fontSize: 11, color: c.t3 }}>
              Routed via LiFi aggregator. Amounts may vary at execution.
            </div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && errMsg && (
        <div className="nan-error-box" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{errMsg}</span>
        </div>
      )}

      {/* ── CTA ── */}
      {phase === 'reviewed' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={clearQuote}
            className="nan-btn nan-btn-ghost"
            style={{ flex: 1, height: 54, borderRadius: 14, gap: 6 }}
          >
            <RefreshCw size={14} /> New quote
          </button>
          <button
            onClick={() => void executeSwap()}
            disabled={phase !== 'reviewed'}
            className="nan-btn nan-btn-primary"
            style={{ flex: 2, height: 54, borderRadius: 14 }}
          >
            Swap {reviewed?.amountIn} {reviewed?.tokenIn} → {reviewed?.tokenOut}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void reviewSwap()}
          disabled={!canReview || phase === 'estimating' || phase === 'swapping'}
          className="nan-btn nan-btn-full"
          style={{
            height: 54, borderRadius: 14,
            background: canReview ? c.blue : c.surf2,
            color: canReview ? '#fff' : c.t3,
            border: `1px solid ${canReview ? c.blue : c.bdr}`,
            fontSize: 15, fontWeight: 700,
            cursor: canReview ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {phase === 'estimating' ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="nan-spinner" />
              Getting quote…
            </span>
          ) : phase === 'swapping' ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="nan-spinner" />
              Swapping…
            </span>
          ) : !isConnected ? 'Connect wallet to swap'
            : !amountIn || parseFloat(amountIn) === 0 ? 'Enter an amount'
            : sameToken ? 'Select different tokens'
            : 'Get quote'}
        </button>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: c.t3, textAlign: 'center' }}>
        Powered by Circle App Kit · Routed via LiFi · 1% slippage
      </div>
    </div>
  )
}
