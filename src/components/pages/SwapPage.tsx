import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowUpDown, Loader, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const appKit = new AppKit()

const PW_BG      = '#FFFFFF'
const PW_SURFACE = '#F7F7F8'
const PW_BORDER  = '#E4E4E7'
const PW_TEXT    = '#0D0D0D'
const PW_TEXT_2  = '#5C5C6B'
const PW_BLACK   = '#0D0D0D'
const PW_WHITE   = '#FFFFFF'
const SANS       = 'Inter, sans-serif'

// Supported tokens (no NATIVE on Arc — same asset as USDC)
const TOKENS = ['USDC', 'EURC', 'USDT', 'PYUSD', 'WETH', 'WBTC'] as const
type Token = typeof TOKENS[number]

// Only testnet chain available
const CHAIN = 'Arc_Testnet'
const CHAIN_ID = 5042002

type Phase = 'idle' | 'estimating' | 'reviewed' | 'swapping' | 'done' | 'error'

interface Estimate {
  estimatedOutput: { amount: string; token: string }
  fees: Array<{ type: string; amount: string; token: string }>
}

export function SwapPage() {
  const { connector, isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)

  const [tokenIn,  setTokenIn]  = useState<Token>('USDT')
  const [tokenOut, setTokenOut] = useState<Token>('USDC')
  const [amountIn, setAmountIn] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [reviewedAddress, setReviewedAddress] = useState<string | undefined>()
  const [phase,  setPhase]  = useState<Phase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')

  const sameToken = tokenIn === tokenOut
  const canReview = isConnected && amountIn && parseFloat(amountIn) > 0 && !sameToken

  const getAdapter = async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }

  const reviewSwap = async () => {
    if (!canReview) return
    setPhase('estimating')
    setErrMsg('')
    try {
      const adapter = await getAdapter()
      const est = await appKit.estimateSwap({
        from: { adapter, chain: CHAIN },
        tokenIn,
        tokenOut,
        amountIn,
        config: { slippageBps: 100 },
      })
      setEstimate(est as unknown as Estimate)
      setReviewedAddress(address)
      setPhase('reviewed')
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Estimation failed.')
    }
  }

  const executeSwap = async () => {
    if (!estimate || address !== reviewedAddress) {
      setPhase('error')
      setErrMsg('Wallet changed since estimate. Get a new quote.')
      return
    }
    setPhase('swapping')
    setErrMsg('')
    try {
      const adapter = await getAdapter()
      const result = await appKit.swap({
        from: { adapter, chain: CHAIN },
        tokenIn,
        tokenOut,
        amountIn,
        config: { slippageBps: 100 },
      })
      setTxHash((result as { txHash?: string }).txHash ?? '')
      setExplorerUrl((result as { explorerUrl?: string }).explorerUrl ?? '')
      setPhase('done')
      addActivity({
        type: 'swap',
        description: `Swap ${tokenIn} → ${tokenOut}`,
        amount: parseFloat(amountIn),
        sign: '-',
        status: 'confirmed',
        counterparty: tokenOut,
        txHash: (result as { txHash?: string }).txHash,
      })
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Swap failed.')
    }
  }

  const flipTokens = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setEstimate(null)
    setPhase('idle')
  }

  const reset = () => {
    setAmountIn('')
    setEstimate(null)
    setPhase('idle')
    setErrMsg('')
    setTxHash('')
  }

  if (!isConnected) return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: SANS, color: PW_TEXT_2 }}>
      Connect your wallet to swap tokens
    </div>
  )

  return (
    <div style={{ fontFamily: SANS, maxWidth: 480, margin: '0 auto', padding: '0 0 80px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 24px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpDown size={18} color={PW_TEXT} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: PW_TEXT }}>Swap</div>
          <div style={{ fontSize: 12, color: PW_TEXT_2 }}>Exchange tokens via Circle · Routed by LiFi</div>
        </div>
      </div>

      {/* Swap card */}
      <div style={{ border: `1px solid ${PW_BORDER}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>

        {/* You pay */}
        <div style={{ padding: '16px 16px 12px', background: PW_BG }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>You pay</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amountIn}
              onChange={e => { setAmountIn(e.target.value); setEstimate(null); setPhase('idle') }}
              disabled={phase === 'swapping'}
              style={{ flex: 1, fontSize: 28, fontWeight: 700, color: PW_TEXT, border: 'none', outline: 'none', background: 'transparent', fontFamily: SANS, minWidth: 0 }}
            />
            <select
              value={tokenIn}
              onChange={e => { setTokenIn(e.target.value as Token); setEstimate(null); setPhase('idle') }}
              style={{ padding: '8px 12px', border: `1px solid ${PW_BORDER}`, borderRadius: 10, background: PW_SURFACE, color: PW_TEXT, fontSize: 14, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', appearance: 'none', minWidth: 80 }}
            >
              {TOKENS.filter(t => t !== tokenOut).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Flip button */}
        <div style={{ position: 'relative', height: 0, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
          <button
            onClick={flipTokens}
            style={{ position: 'absolute', top: -18, width: 36, height: 36, borderRadius: '50%', border: `2px solid ${PW_BORDER}`, background: PW_WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
          >
            <ArrowUpDown size={14} color={PW_TEXT_2} />
          </button>
        </div>

        {/* You receive */}
        <div style={{ padding: '20px 16px 16px', background: PW_SURFACE, borderTop: `1px solid ${PW_BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>You receive (est.)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 28, fontWeight: 700, color: estimate ? PW_TEXT : PW_TEXT_2 }}>
              {estimate ? estimate.estimatedOutput.amount : '—'}
            </div>
            <select
              value={tokenOut}
              onChange={e => { setTokenOut(e.target.value as Token); setEstimate(null); setPhase('idle') }}
              style={{ padding: '8px 12px', border: `1px solid ${PW_BORDER}`, borderRadius: 10, background: PW_WHITE, color: PW_TEXT, fontSize: 14, fontWeight: 600, fontFamily: SANS, cursor: 'pointer', appearance: 'none', minWidth: 80 }}
            >
              {TOKENS.filter(t => t !== tokenIn).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Quick amounts */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['1', '5', '10', '25', '50'].map(v => (
          <button key={v} onClick={() => { setAmountIn(v); setEstimate(null); setPhase('idle') }}
            style={{ flex: 1, padding: '7px 0', border: `1px solid ${PW_BORDER}`, borderRadius: 8, background: amountIn === v ? PW_BLACK : PW_SURFACE, color: amountIn === v ? PW_WHITE : PW_TEXT, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: SANS }}>
            {v}
          </button>
        ))}
      </div>

      {/* Fees info (after estimate) */}
      {estimate && (
        <div style={{ background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: PW_TEXT_2 }}>Estimated output</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: PW_TEXT }}>{estimate.estimatedOutput.amount} {estimate.estimatedOutput.token}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: PW_TEXT_2 }}>Slippage tolerance</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: PW_TEXT }}>1%</span>
          </div>
          {estimate.fees.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: PW_TEXT_2 }}>{f.type} fee</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: PW_TEXT }}>{f.amount} {f.token}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11, color: PW_TEXT_2 }}>
            ⚠ Routed via LiFi aggregator. Subject to LiFi's terms of service.
          </div>
        </div>
      )}

      {/* Success */}
      {phase === 'done' && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle size={18} color='#16A34A' />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#15803D' }}>Swap completed</span>
          </div>
          {txHash && (
            <a href={explorerUrl || `https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}>
              {txHash.slice(0, 12)}…{txHash.slice(-6)} <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && errMsg && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991B1B' }}>
          {errMsg}
        </div>
      )}

      {/* Warning */}
      {sameToken && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
          Same token selected — please choose different tokens to swap.
        </div>
      )}

      {/* CTAs */}
      {phase === 'done' ? (
        <button onClick={reset}
          style={{ width: '100%', padding: '15px 0', background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, borderRadius: 14, fontSize: 15, fontWeight: 600, color: PW_TEXT, cursor: 'pointer', fontFamily: SANS }}>
          Swap again
        </button>
      ) : phase === 'reviewed' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setEstimate(null); setPhase('idle') }}
            style={{ flex: 1, padding: '15px 0', background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, borderRadius: 14, fontSize: 15, fontWeight: 600, color: PW_TEXT, cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <RefreshCw size={14} /> New quote
          </button>
          <button onClick={() => void executeSwap()}
            style={{ flex: 2, padding: '15px 0', background: PW_BLACK, border: `1px solid ${PW_BLACK}`, borderRadius: 14, fontSize: 15, fontWeight: 600, color: PW_WHITE, cursor: 'pointer', fontFamily: SANS }}>
            Swap {amountIn} {tokenIn} → {tokenOut}
          </button>
        </div>
      ) : (
        <button
          onClick={() => void reviewSwap()}
          disabled={!canReview || phase === 'estimating' || phase === 'swapping'}
          style={{
            width: '100%', padding: '15px 0',
            background: canReview ? PW_BLACK : PW_SURFACE,
            border: `1px solid ${canReview ? PW_BLACK : PW_BORDER}`,
            borderRadius: 14, fontSize: 15, fontWeight: 600,
            color: canReview ? PW_WHITE : PW_TEXT_2,
            cursor: canReview ? 'pointer' : 'not-allowed', fontFamily: SANS,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
          {phase === 'estimating'
            ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Getting quote…</>
            : 'Get quote'}
        </button>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: PW_TEXT_2, textAlign: 'center' }}>
        Powered by Circle App Kit · Swaps routed via LiFi
      </div>
    </div>
  )
}
