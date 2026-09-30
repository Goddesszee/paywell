import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowDown, Settings, CheckCircle, ExternalLink, RefreshCw, AlertCircle, X, Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { swapFee, SWAP_FEE_BPS, bpsToPercent, FEE_WALLET } from '../../lib/fees'
import { useNanTheme } from '../../hooks/useNanTheme'

const appKit = new AppKit()

const CHAIN_ID  = 5042002
const CHAIN_KEY = 'Arc_Testnet'

// All tokens supported by Circle App Kit swap
const TOKENS = [
  { symbol: 'USDC',  label: 'USD Coin' },
  { symbol: 'EURC',  label: 'Euro Coin' },
  { symbol: 'USDT',  label: 'Tether USD' },
  { symbol: 'PYUSD', label: 'PayPal USD' },
  { symbol: 'DAI',   label: 'Dai' },
  { symbol: 'USDE',  label: 'Ethena USDe' },
  { symbol: 'WBTC',  label: 'Wrapped Bitcoin' },
  { symbol: 'WETH',  label: 'Wrapped Ether' },
  { symbol: 'WSOL',  label: 'Wrapped SOL' },
  { symbol: 'WAVAX', label: 'Wrapped AVAX' },
  { symbol: 'WPOL',  label: 'Wrapped POL' },
  { symbol: 'NATIVE',label: 'Native Gas' },
] as const

type Token = typeof TOKENS[number]['symbol']
type Phase = 'idle' | 'estimating' | 'reviewed' | 'swapping' | 'done' | 'error'

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: Token
  tokenOut: Token
  amountIn: string
  slippageBps: number
  account: string | undefined
}

// ── Token selector modal ──────────────────────────────────────────────────────
function TokenModal({
  current,
  exclude,
  onSelect,
  onClose,
  c,
}: {
  current: Token
  exclude: Token
  onSelect: (t: Token) => void
  onClose: () => void
  c: ReturnType<typeof useNanTheme>
}) {
  const [query, setQuery] = useState('')
  const filtered = TOKENS.filter(t =>
    t.symbol !== exclude &&
    (t.symbol.toLowerCase().includes(query.toLowerCase()) ||
     t.label.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: c.surf,
          border: `1px solid ${c.bdr2}`,
          borderRadius: '20px 20px 0 0',
          padding: '0 0 32px',
          maxHeight: '75vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 18px 12px',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Select token</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2, padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: c.surf2, border: `1px solid ${c.bdr}`,
            borderRadius: 10, padding: '9px 12px',
          }}>
            <Search size={14} color={c.t3} />
            <input
              autoFocus
              placeholder="Search tokens…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: c.text, fontSize: 14, fontFamily: 'var(--nan-font)',
              }}
            />
          </div>
        </div>

        {/* Token list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(t => (
            <button
              key={t.symbol}
              onClick={() => { onSelect(t.symbol); onClose() }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 18px',
                background: t.symbol === current ? c.blueDim : 'transparent',
                border: 'none', cursor: 'pointer',
                borderBottom: `1px solid ${c.bdr}`,
                transition: 'background 0.1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: t.symbol === current ? c.blueBd : c.surf2,
                  border: `1px solid ${c.bdr2}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: t.symbol === current ? c.blue : c.t2,
                  flexShrink: 0,
                }}>
                  {t.symbol.slice(0, 3)}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.symbol === current ? c.blue : c.text }}>
                    {t.symbol}
                  </div>
                  <div style={{ fontSize: 11, color: c.t3 }}>{t.label}</div>
                </div>
              </div>
              {t.symbol === current && (
                <CheckCircle size={16} color={c.blue} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Slippage settings panel ───────────────────────────────────────────────────
function SlippagePanel({
  slippageBps,
  onChange,
  onClose,
  c,
}: {
  slippageBps: number
  onChange: (bps: number) => void
  onClose: () => void
  c: ReturnType<typeof useNanTheme>
}) {
  const presets = [50, 100, 300]
  const [custom, setCustom] = useState(
    presets.includes(slippageBps) ? '' : (slippageBps / 100).toFixed(1)
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: c.surf,
          border: `1px solid ${c.bdr2}`,
          borderRadius: '20px 20px 0 0',
          padding: '0 20px 40px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: c.bdr2 }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 0 18px',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Slippage tolerance</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t2 }}>
            <X size={18} />
          </button>
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {presets.map(bps => (
            <button
              key={bps}
              onClick={() => { onChange(bps); setCustom('') }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: `1px solid ${slippageBps === bps && !custom ? c.blue : c.bdr2}`,
                background: slippageBps === bps && !custom ? c.blueDim : c.surf2,
                color: slippageBps === bps && !custom ? c.blue : c.t2,
                fontFamily: 'var(--nan-font)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {bps / 100}%
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: c.t3, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Custom
          </div>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: c.surf2, border: `1px solid ${custom ? c.blue : c.bdr}`,
            borderRadius: 10, padding: '10px 14px',
            boxShadow: custom ? `0 0 0 3px ${c.blueDim}` : 'none',
            transition: 'all 0.15s',
          }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.5"
              value={custom}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                setCustom(v)
                const bps = Math.round(parseFloat(v || '0') * 100)
                if (bps > 0 && bps <= 5000) onChange(bps)
              }}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: c.text, fontSize: 15, fontWeight: 700,
                fontFamily: 'var(--nan-font)',
              }}
            />
            <span style={{ fontSize: 14, color: c.t2, fontWeight: 600 }}>%</span>
          </div>
        </div>

        {/* Warning for high slippage */}
        {slippageBps > 200 && (
          <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14 }}>
            <AlertCircle size={13} />
            High slippage — your trade may be front-run or result in a worse price.
          </div>
        )}

        <div style={{ fontSize: 12, color: c.t3, lineHeight: 1.55 }}>
          Current: <strong style={{ color: c.text }}>{(slippageBps / 100).toFixed(2)}%</strong> — tighter slippage protects against price impact but increases the chance of a failed swap.
        </div>
      </div>
    </div>
  )
}

// ── Token pill button ─────────────────────────────────────────────────────────
function TokenPill({ token, onClick, c }: {
  token: Token
  onClick: () => void
  c: ReturnType<typeof useNanTheme>
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px 8px 10px',
        background: c.surf2, border: `1px solid ${c.bdr2}`,
        borderRadius: 100, cursor: 'pointer',
        fontFamily: 'var(--nan-font)', transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{token}</span>
      <span style={{ fontSize: 10, color: c.t3, marginTop: 1 }}>▾</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SwapPage() {
  const c = useNanTheme()
  const { connector, isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)
  const recordFee   = useAppStore(s => s.recordFee)

  const [tokenIn,  setTokenIn]  = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amountIn, setAmountIn] = useState('')
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [errMsg,   setErrMsg]   = useState('')
  const [txHash,   setTxHash]   = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')
  const [slippageBps, setSlippageBps] = useState(100) // default 1%

  // Modals
  const [showSellModal,  setShowSellModal]  = useState(false)
  const [showBuyModal,   setShowBuyModal]   = useState(false)
  const [showSlippage,   setShowSlippage]   = useState(false)

  // Arc: USDC native and USDC ERC-20 are the same asset — block that pair
  const arcNoPair = (tokenIn === 'USDC' && tokenOut === 'NATIVE') || (tokenIn === 'NATIVE' && tokenOut === 'USDC')
  const sameToken = tokenIn === tokenOut
  const invalid   = sameToken || arcNoPair
  const canReview = isConnected && !!amountIn && parseFloat(amountIn) > 0 && !invalid

  const addrShort = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : ''

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  const reviewSwap = async () => {
    if (!canReview) return
    setPhase('estimating'); setErrMsg('')
    try {
      const adapter  = await getAdapter()
      const estimate = await appKit.estimateSwap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn, tokenOut, amountIn,
        config: { slippageBps },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn, slippageBps, account: address })
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Estimation failed.')
    }
  }

  const executeSwap = async () => {
    if (!reviewed) return
    if (address !== reviewed.account) {
      setPhase('error'); setErrMsg('Wallet changed since estimate. Get a new quote.'); return
    }
    setPhase('swapping'); setErrMsg('')
    try {
      const adapter = await getAdapter()
      const result  = await appKit.swap({
        from: { adapter, chain: CHAIN_KEY },
        tokenIn:  reviewed.tokenIn,
        tokenOut: reviewed.tokenOut,
        amountIn: reviewed.amountIn,
        config: { slippageBps: reviewed.slippageBps },
      })
      const rHash = (result as { txHash?: string }).txHash ?? ''
      const rUrl  = (result as { explorerUrl?: string }).explorerUrl ?? ''
      setTxHash(rHash); setExplorerUrl(rUrl); setPhase('done')

      const gross = parseFloat(reviewed.amountIn)
      const fee   = swapFee(gross)
      addActivity({ type: 'swap', description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}`, amount: gross, sign: '-', status: 'confirmed', counterparty: reviewed.tokenOut, txHash: rHash })
      if (fee > 0) recordFee({ source: 'swap', grossAmount: gross, feeAmount: fee, feeWallet: FEE_WALLET, txHash: rHash, description: `Swap ${reviewed.tokenIn} → ${reviewed.tokenOut}` })
    } catch (e: unknown) {
      setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
    }
  }

  const flipTokens = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setReviewed(null); setPhase('idle') }
  const clearQuote = () => { setReviewed(null); setPhase('idle') }
  const reset      = () => { setAmountIn(''); setReviewed(null); setPhase('idle'); setErrMsg(''); setTxHash('') }

  const estimatedOut = reviewed?.estimate?.estimatedOutput

  // ── Success screen ────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>
      <div style={{ textAlign: 'center', padding: '56px 24px 32px' }}>
        <div className="nan-check-circle" style={{ margin: '0 auto 18px' }}>
          <CheckCircle size={28} color={c.green} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: c.text, letterSpacing: '-0.025em', marginBottom: 6 }}>Swap complete</div>
        <div style={{ fontSize: 14, color: c.t2, marginBottom: 28 }}>Your tokens have been exchanged.</div>
        {txHash && (
          <a href={explorerUrl || `https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.blue, textDecoration: 'none', background: c.blueDim, border: `1px solid ${c.blueBd}`, borderRadius: 8, padding: '8px 14px', marginBottom: 28 }}>
            {txHash.slice(0, 14)}… <ExternalLink size={12} />
          </a>
        )}
        <button onClick={reset} className="nan-btn nan-btn-primary nan-btn-full" style={{ borderRadius: 14 }}>Swap again</button>
      </div>
    </div>
  )

  // ── Main swap UI ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 100px', fontFamily: 'var(--nan-font)' }}>

      {/* ── Header: title + gear ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: c.text, letterSpacing: '-0.02em' }}>Swap</span>
        <button
          onClick={() => setShowSlippage(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 9,
            border: `1px solid ${c.bdr}`, background: c.surf,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <Settings size={14} color={c.t2} />
          <span style={{ fontSize: 12, fontWeight: 600, color: c.t2 }}>{(slippageBps / 100).toFixed(2)}%</span>
        </button>
      </div>

      {/* ── Sell panel ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 16, overflow: 'hidden', marginBottom: 2 }}>
        <div style={{ padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Sell</span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.blue, display: 'inline-block' }} />
                {addrShort}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text" inputMode="decimal" placeholder="0"
              value={amountIn}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) { setAmountIn(v); setReviewed(null); setPhase('idle') }
              }}
              disabled={phase === 'swapping'}
              style={{ flex: 1, fontSize: 36, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--nan-mono)', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}
            />
            <TokenPill token={tokenIn} onClick={() => setShowSellModal(true)} c={c} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>
              {amountIn && parseFloat(amountIn) > 0 ? `$${parseFloat(amountIn).toFixed(2)}` : '$0.00'}
            </span>
            {isConnected && <span style={{ fontSize: 12, color: c.t3 }}>Balance: —</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {['20%', '50%', 'MAX'].map(v => (
              <button key={v} style={{ flex: 1, padding: '7px 0', border: `1px solid ${c.bdr2}`, borderRadius: 8, background: c.surf2, color: c.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--nan-font)', transition: 'all 0.12s' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Flip button ── */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-1px 0', zIndex: 2, position: 'relative' }}>
        <button onClick={flipTokens} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${c.bdr2}`, background: c.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', boxShadow: c.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)' }}>
          <ArrowDown size={15} color={c.t2} />
        </button>
      </div>

      {/* ── Buy panel ── */}
      <div style={{ background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 16, overflow: 'hidden', marginTop: 2, marginBottom: 10 }}>
        <div style={{ padding: '16px 16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.t2 }}>Buy</span>
            {isConnected && (
              <span style={{ fontSize: 12, color: c.t3, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.blue, display: 'inline-block' }} />
                {addrShort}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 36, fontWeight: 700, color: estimatedOut ? c.green : c.t3, fontFamily: 'var(--nan-mono)', minWidth: 0, fontVariantNumeric: 'tabular-nums' }}>
              {phase === 'estimating'
                ? <span className="nan-skel" style={{ display: 'inline-block', width: 80, height: 36, borderRadius: 8 }} />
                : estimatedOut ? estimatedOut.amount : '0'}
            </div>
            <TokenPill token={tokenOut} onClick={() => setShowBuyModal(true)} c={c} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13, color: c.t3 }}>$0.00</span>
            {isConnected && <span style={{ fontSize: 12, color: c.t3 }}>Balance: —</span>}
          </div>
        </div>
      </div>

      {/* ── Warnings ── */}
      {(sameToken || arcNoPair) && (
        <div className="nan-warn-box" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <AlertCircle size={14} />
          <span>{arcNoPair ? 'USDC and NATIVE are the same asset on Arc — choose a different pair.' : 'Choose different tokens to swap.'}</span>
        </div>
      )}

      {/* ── Quote details ── */}
      {reviewed && phase === 'reviewed' && (
        <div className="nan-card" style={{ marginBottom: 10 }}>
          <div className="nan-card-inner">
            {([
              ['Estimated output', `${estimatedOut?.amount ?? '—'} ${estimatedOut?.token ?? tokenOut}`],
              ['Slippage tolerance', `${(reviewed.slippageBps / 100).toFixed(2)}%`],
              [`NAN fee (${bpsToPercent(SWAP_FEE_BPS)})`, `${swapFee(parseFloat(reviewed.amountIn) || 0).toFixed(4)} ${reviewed.tokenIn}`],
              ...(reviewed.estimate.fees?.map(f => [`${f.type} fee`, `${f.amount} ${f.token}`]) ?? []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${c.bdr}` }}>
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
          <button onClick={clearQuote} className="nan-btn nan-btn-ghost" style={{ flex: 1, height: 54, borderRadius: 14, gap: 6 }}>
            <RefreshCw size={14} /> New quote
          </button>
          <button onClick={() => void executeSwap()} disabled={phase !== 'reviewed'} className="nan-btn nan-btn-primary" style={{ flex: 2, height: 54, borderRadius: 14 }}>
            Swap {reviewed?.amountIn} {reviewed?.tokenIn} → {reviewed?.tokenOut}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void reviewSwap()}
          disabled={!canReview || phase === 'estimating' || phase === 'swapping'}
          className="nan-btn nan-btn-full"
          style={{ height: 54, borderRadius: 14, background: canReview ? c.blue : c.surf2, color: canReview ? '#fff' : c.t3, border: `1px solid ${canReview ? c.blue : c.bdr}`, fontSize: 15, fontWeight: 700, cursor: canReview ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
        >
          {phase === 'estimating'
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="nan-spinner" />Getting quote…</span>
            : phase === 'swapping'
            ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><span className="nan-spinner" />Swapping…</span>
            : !isConnected ? 'Connect wallet to swap'
            : !amountIn || parseFloat(amountIn) === 0 ? 'Enter an amount'
            : invalid ? 'Select different tokens'
            : 'Get quote'}
        </button>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: c.t3, textAlign: 'center' }}>
        Powered by Circle App Kit · Routed via LiFi
      </div>

      {/* ── Modals ── */}
      {showSellModal && (
        <TokenModal
          current={tokenIn} exclude={tokenOut}
          onSelect={t => { setTokenIn(t); setReviewed(null); setPhase('idle') }}
          onClose={() => setShowSellModal(false)} c={c}
        />
      )}
      {showBuyModal && (
        <TokenModal
          current={tokenOut} exclude={tokenIn}
          onSelect={t => { setTokenOut(t); setReviewed(null); setPhase('idle') }}
          onClose={() => setShowBuyModal(false)} c={c}
        />
      )}
      {showSlippage && (
        <SlippagePanel
          slippageBps={slippageBps}
          onChange={setSlippageBps}
          onClose={() => setShowSlippage(false)} c={c}
        />
      )}
    </div>
  )
}
