/**
 * AgentSwapTab — Swap tokens from the Agent Wallet via Circle / LiFi
 *
 * Routes to /api/agent-wallet (action=swap) which calls the Circle SDK
 * server-side. Circle's Agent Stack supports swapping through LiFi.
 *
 * The backend must have CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET +
 * AGENT_WALLET_ID + AGENT_WALLET_ADDRESS set for real swap execution.
 * Without them the backend returns a clear "not configured" error.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  ArrowUpDown, CheckCircle2, ExternalLink, Loader2,
  AlertCircle, Info, RefreshCw, Zap,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE = '#0066FF'
const GREEN = '#00C853'
const AMBER = '#FF9500'

// Tokens supported by Circle / LiFi on testnet chains
const TOKENS = [
  { symbol: 'USDC',  name: 'USD Coin',       chain: 'Arc Testnet' },
  { symbol: 'USDC',  name: 'USD Coin',       chain: 'Base Sepolia' },
  { symbol: 'USDC',  name: 'USD Coin',       chain: 'Ethereum Sepolia' },
  { symbol: 'USDC',  name: 'USD Coin',       chain: 'Arbitrum Sepolia' },
  { symbol: 'USDT',  name: 'Tether USD',     chain: 'Ethereum Sepolia' },
  { symbol: 'ETH',   name: 'Ether',          chain: 'Ethereum Sepolia' },
  { symbol: 'ETH',   name: 'Ether',          chain: 'Base Sepolia' },
  { symbol: 'WETH',  name: 'Wrapped Ether',  chain: 'Arbitrum Sepolia' },
]

type TokenOption = typeof TOKENS[0]

interface Props {
  C: {
    bg: string; surf: string; surf2: string
    bdr: string; text: string; t2: string; t3: string
  }
}

interface QuoteResult {
  fromAmount: string
  toAmount: string
  rate: string
  fee?: string
  route?: string
  provider: string
}

type SwapStatus = 'idle' | 'quoting' | 'quoted' | 'swapping' | 'done' | 'error'

export function AgentSwapTab({ C }: Props) {
  const { agentWallet, addActivity, addAgentSpend } = useAppStore()

  const [fromToken, setFromToken] = useState<TokenOption>(TOKENS[0])
  const [toToken,   setToToken]   = useState<TokenOption>(TOKENS[4])   // USDT
  const [amount,    setAmount]    = useState('')
  const [quote,     setQuote]     = useState<QuoteResult | null>(null)
  const [status,    setStatus]    = useState<SwapStatus>('idle')
  const [errMsg,    setErrMsg]    = useState('')
  const [txHash,    setTxHash]    = useState('')

  const balance = parseFloat(agentWallet.balance_usdc || '0')
  const gross   = parseFloat(amount) || 0

  // ── Fetch a swap quote from the backend ────────────────────────────────────
  const fetchQuote = useCallback(async () => {
    if (!amount || gross <= 0 || fromToken.symbol === toToken.symbol) return
    setStatus('quoting'); setQuote(null); setErrMsg('')
    try {
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'swap-quote',
          fromToken: fromToken.symbol,
          toToken:   toToken.symbol,
          fromChain: fromToken.chain,
          toChain:   toToken.chain,
          amount,
          agentAddress: agentWallet.address,
        }),
      })
      const d = await r.json() as {
        ok?: boolean; error?: string; not_configured?: boolean
        quote?: QuoteResult
      }
      if (d.not_configured) {
        setStatus('error')
        setErrMsg('Swap is not yet configured for this Agent Wallet. Add CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, and AGENT_WALLET_ADDRESS to your environment variables.')
        return
      }
      if (!r.ok || d.error || !d.quote) throw new Error(d.error ?? 'Quote failed')
      setQuote(d.quote)
      setStatus('quoted')
    } catch (e) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Quote request failed')
    }
  }, [amount, fromToken, toToken, agentWallet.address, gross])

  // Auto-quote when amount + tokens change (debounced 600ms)
  useEffect(() => {
    if (!amount || gross <= 0) { setQuote(null); setStatus('idle'); return }
    const t = setTimeout(() => { void fetchQuote() }, 600)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromToken.symbol, toToken.symbol])

  // ── Execute the swap ───────────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!quote || status !== 'quoted') return
    if (!agentWallet.provisioned) { setErrMsg('Agent Wallet not set up.'); setStatus('error'); return }
    const userToken = agentWallet.userToken
    if (!userToken) { setErrMsg('Agent Wallet session expired. Re-authenticate.'); setStatus('error'); return }

    setStatus('swapping'); setErrMsg('')
    try {
      const r = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
        body: JSON.stringify({
          action: 'swap',
          userToken,
          fromToken: fromToken.symbol,
          toToken:   toToken.symbol,
          fromChain: fromToken.chain,
          toChain:   toToken.chain,
          amount,
          agentAddress: agentWallet.address,
        }),
      })
      const d = await r.json() as {
        ok?: boolean; error?: string; not_configured?: boolean
        txHash?: string; toAmount?: string
      }
      if (d.not_configured) {
        setStatus('error')
        setErrMsg('Swap backend not configured. Set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, and AGENT_WALLET_ADDRESS.')
        return
      }
      if (!r.ok || d.error) throw new Error(d.error ?? 'Swap failed')
      setTxHash(d.txHash ?? '')
      setStatus('done')
      addAgentSpend({
        id: `spend-${Date.now()}`,
        service_id: 'agent-swap',
        service_name: `Swap ${amount} ${fromToken.symbol} → ${toToken.symbol}`,
        amount_usdc: gross,
        txId: d.txHash ?? undefined,
        paid: true,
        timestamp: new Date().toISOString(),
      })
      addActivity({
        type: 'swap',
        description: `Agent Swap: ${amount} ${fromToken.symbol} → ${toToken.symbol}`,
        amount: gross,
        sign: '-',
        status: 'confirmed',
        counterparty: toToken.symbol,
        txHash: d.txHash ?? undefined,
      })
    } catch (e) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Swap failed')
    }
  }

  const reset = () => {
    setStatus('idle'); setQuote(null); setAmount(''); setErrMsg(''); setTxHash('')
  }

  const sameToken = fromToken.symbol === toToken.symbol && fromToken.chain === toToken.chain
  const isSwapping = status === 'swapping'
  const isQuoting  = status === 'quoting'
  const canSwap    = status === 'quoted' && quote !== null && !sameToken && gross > 0 && gross <= balance

  if (!agentWallet.provisioned) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: F }}>
        <AlertCircle size={28} color={C.t3} style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Agent Wallet not set up</div>
        <div style={{ fontSize: 12, color: C.t2 }}>Complete wallet setup first to enable swaps.</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ArrowUpDown size={15} color={BLUE} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Swap Tokens</div>
          <div style={{ fontSize: 11, color: C.t2 }}>Circle / LiFi · from your Agent Wallet</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{ background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.16)', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.t2 }}>Agent Wallet balance</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: MONO }}>{balance.toFixed(4)} USDC</span>
      </div>

      {/* From token */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>From</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select
            value={`${fromToken.symbol}|${fromToken.chain}`}
            onChange={e => { const [sym, chain] = e.target.value.split('|'); setFromToken(TOKENS.find(t => t.symbol === sym && t.chain === chain) ?? TOKENS[0]) }}
            style={{ padding: '9px 10px', border: `1px solid ${C.bdr}`, borderRadius: 10, background: C.surf, color: C.text, fontSize: 12, fontFamily: F, appearance: 'none' as const, cursor: 'pointer' }}
          >
            {TOKENS.map(t => <option key={`${t.symbol}|${t.chain}`} value={`${t.symbol}|${t.chain}`}>{t.symbol} ({t.chain})</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <input
              type="number" min="0" step="0.01" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={status === 'swapping'}
              style={{ width: '100%', padding: '9px 46px 9px 12px', border: `1px solid ${C.bdr}`, borderRadius: 10, background: C.surf2, color: C.text, fontSize: 14, fontWeight: 600, fontFamily: F, boxSizing: 'border-box' as const, outline: 'none' }}
            />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.t2, fontWeight: 600, pointerEvents: 'none' }}>{fromToken.symbol}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {['1', '5', '10'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex: 1, padding: '5px 0', border: `1px solid ${C.bdr}`, borderRadius: 8, background: amount === v ? BLUE : C.surf, color: amount === v ? '#fff' : C.text, fontSize: 12, cursor: 'pointer', fontFamily: F }}>
              {v}
            </button>
          ))}
          <button onClick={() => setAmount(balance > 0 ? balance.toFixed(4) : '')}
            style={{ flex: 1, padding: '5px 0', border: `1px solid ${C.bdr}`, borderRadius: 8, background: C.surf, color: C.t2, fontSize: 12, cursor: 'pointer', fontFamily: F }}>
            Max
          </button>
        </div>
      </div>

      {/* To token */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>To</div>
        <select
          value={`${toToken.symbol}|${toToken.chain}`}
          onChange={e => { const [sym, chain] = e.target.value.split('|'); setToToken(TOKENS.find(t => t.symbol === sym && t.chain === chain) ?? TOKENS[1]) }}
          style={{ width: '100%', padding: '9px 10px', border: `1px solid ${sameToken ? AMBER : C.bdr}`, borderRadius: 10, background: C.surf, color: C.text, fontSize: 12, fontFamily: F, appearance: 'none' as const, cursor: 'pointer' }}
        >
          {TOKENS.map(t => <option key={`${t.symbol}|${t.chain}`} value={`${t.symbol}|${t.chain}`}>{t.symbol} ({t.chain})</option>)}
        </select>
        {sameToken && <div style={{ fontSize: 11, color: AMBER, marginTop: 4 }}>From and To tokens must be different.</div>}
      </div>

      {/* Quote result */}
      {(status === 'quoting' || status === 'quoted') && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Swap quote</div>
          {status === 'quoting' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.t2 }}>
              <Loader2 size={12} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} /> Fetching quote…
            </div>
          ) : quote && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'You send',      value: `${quote.fromAmount} ${fromToken.symbol}` },
                { label: 'You receive',   value: `${quote.toAmount} ${toToken.symbol}` },
                { label: 'Rate',          value: quote.rate },
                ...(quote.fee  ? [{ label: 'Fee', value: quote.fee }] : []),
                ...(quote.route ? [{ label: 'Route', value: quote.route }] : []),
                { label: 'Provider',      value: quote.provider },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.bdr}` }}>
                  <span style={{ fontSize: 11, color: C.t2 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Note */}
      <div style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Info size={13} color={C.t2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
          Swaps use Circle's Agent Stack LiFi integration. The backend signs and broadcasts the transaction using your Agent Wallet. Requires CIRCLE_API_KEY + AGENT_WALLET_ID in Vercel env vars.
        </div>
      </div>

      {/* Error */}
      {status === 'error' && errMsg && (
        <div style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#FF3B3B', lineHeight: 1.5 }}>
          {errMsg}
        </div>
      )}

      {/* Success */}
      {status === 'done' && (
        <div style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} color={GREEN} />
            <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Swap complete</span>
          </div>
          {txHash && (
            <span style={{ fontSize: 11, color: BLUE, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
              {txHash.slice(0, 14)}… <ExternalLink size={9} />
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      {status === 'done' ? (
        <button onClick={reset}
          style={{ width: '100%', height: 46, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, fontSize: 14, fontWeight: 600, color: C.text, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Swap again
        </button>
      ) : (
        <button
          onClick={() => void handleSwap()}
          disabled={!canSwap || isSwapping}
          style={{ width: '100%', height: 46, background: canSwap && !isSwapping ? BLUE : C.surf2, border: `1px solid ${canSwap ? BLUE : C.bdr}`, borderRadius: 14, fontSize: 14, fontWeight: 700, color: canSwap ? '#fff' : C.t3, cursor: canSwap ? 'pointer' : 'not-allowed', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {isSwapping
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Swapping…</>
            : isQuoting
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Getting quote…</>
            : gross > balance && amount
            ? 'Insufficient balance'
            : !amount || gross <= 0
            ? 'Enter an amount'
            : sameToken
            ? 'Select a different token'
            : status === 'quoted' && quote
            ? <><Zap size={14} /> Swap {amount} {fromToken.symbol} → {toToken.symbol}</>
            : 'Enter amount to get quote'}
        </button>
      )}

      <div style={{ fontSize: 11, color: C.t3, textAlign: 'center' }}>Powered by Circle Agent Stack · LiFi · Swaps are irreversible</div>
    </div>
  )
}
