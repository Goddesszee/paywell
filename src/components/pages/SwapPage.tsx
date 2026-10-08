/**
 * SwapPage — Circle App Kit swap for all four NAN login paths.
 *
 * Wallet path strategy:
 *   wagmi   → createViemAdapterFromProvider (browser wallet, keyless, no kitKey)
 *   passkey → getPasskeyAdapter (Circle Modular Wallet EIP-1193 shim)
 *   UCW     → POST /api/wallet { action: 'ucw-swap-estimate' | 'ucw-swap-start' | 'ucw-swap-confirm' }
 *             then executeChallenge(challengeId) via W3S SDK in browser
 *   none    → prompt to connect
 *
 * Arc Testnet only: the sole testnet chain for App Kit is "Arc_Testnet".
 * USDC↔NATIVE is blocked — on Arc they are the same asset.
 */

import { useState, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowUpDown, Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanWallet } from '../../hooks/useNanWallet'
import { getPasskeyAdapter } from '../CirclePasskeyLogin'

// App Kit instance — one per module, not per render
// Kit is typed as AppKit but its adapter generic conflicts with older @circle-fin/adapter-viem-v2
// types in this project. We use an intersection with a loose interface to call through.
interface KitLike {
  estimateSwap(params: { from: { adapter: unknown; chain: string }; tokenIn: string; tokenOut: string; amountIn: string; config?: Record<string, unknown> }): Promise<unknown>
  swap(params: { from: { adapter: unknown; chain: string }; tokenIn: string; tokenOut: string; amountIn: string; config?: Record<string, unknown> }): Promise<unknown>
}
const kit = new AppKit() as unknown as KitLike

// Arc Testnet chain string used by App Kit
const ARC_TESTNET = 'Arc_Testnet'

// Tokens available on Arc Testnet (USDC is the native + ERC-20, EURC is also deployed)
const TOKENS = ['USDC', 'EURC'] as const
type Token = typeof TOKENS[number]

type SwapStatus = 'idle' | 'estimating' | 'reviewed' | 'signing' | 'confirming' | 'success' | 'error'

interface Estimate {
  estimatedOutput: { amount: string; token: string }
  fees: { type: string; amount: string; token: string }[]
}

export function SwapPage() {
  const nan = useNanWallet()
  const { connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const auth = useAppStore((s) => s.auth)
  const addActivity = useAppStore((s) => s.addActivity)

  const clientKey = (import.meta.env.VITE_CLIENT_KEY as string | undefined)?.trim()

  const [tokenIn, setTokenIn] = useState<Token>('EURC')
  const [tokenOut, setTokenOut] = useState<Token>('USDC')
  const [amountIn, setAmountIn] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [status, setStatus] = useState<SwapStatus>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  // ── helpers ────────────────────────────────────────────────────────────────

  function flipTokens() {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setEstimate(null)
    setStatus('idle')
  }

  function isSameAsset(a: Token, b: Token) {
    // On Arc, USDC and NATIVE are the same. Here USDC↔EURC is valid; block USDC↔USDC only.
    return a === b
  }

  const getWagmiAdapter = useCallback(async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (nan.chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id })
    }
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }, [connector, nan.chainId, switchChainAsync])

  const getPasskeyAdapterResolved = useCallback(async () => {
    if (!clientKey) throw new Error('VITE_CLIENT_KEY not set — passkey adapter unavailable')
    return getPasskeyAdapter({ clientKey })
  }, [clientKey])

  // ── estimate ───────────────────────────────────────────────────────────────

  const handleEstimate = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      toast.error('Enter an amount to swap')
      return
    }
    if (isSameAsset(tokenIn, tokenOut)) {
      toast.error('Cannot swap a token with itself')
      return
    }
    if (!nan.isConnected) {
      toast.error('Connect your wallet first')
      return
    }

    setStatus('estimating')
    setError('')
    setEstimate(null)

    try {
      if (nan.isUcw) {
        // UCW path — server estimates
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'ucw-swap-estimate',
            userToken: nan.userToken,
            walletAddress: nan.address,
            walletId: nan.walletId,
            tokenIn,
            tokenOut,
            amountIn,
            slippageBps: '300',
          }),
        })
        const data = await res.json() as { estimate?: Estimate; error?: string }
        if (!res.ok || data.error) throw new Error(data.error ?? 'Estimate failed')
        setEstimate(data.estimate!)
      } else {
        // wagmi or passkey — client-side estimate
        const adapter = nan.isPasskeyUser
          ? await getPasskeyAdapterResolved()
          : await getWagmiAdapter()
        const est = await kit.estimateSwap({
          from: { adapter, chain: ARC_TESTNET },
          tokenIn,
          tokenOut,
          amountIn,
          config: { slippageBps: 300, allowanceStrategy: 'approve' },
        })
        setEstimate(est as Estimate)
      }
      setStatus('reviewed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus('error')
    }
  }, [amountIn, tokenIn, tokenOut, nan, getWagmiAdapter, getPasskeyAdapterResolved])

  // ── execute ────────────────────────────────────────────────────────────────

  const handleSwap = useCallback(async () => {
    if (!estimate) return
    setStatus('signing')
    setError('')

    try {
      if (nan.isUcw) {
        // UCW path: server starts swap → returns challengeId → W3S PIN popup → confirm
        const startRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'ucw-swap-start',
            userToken: nan.userToken,
            walletAddress: nan.address,
            walletId: nan.walletId,
            tokenIn,
            tokenOut,
            amountIn,
            slippageBps: '300',
          }),
        })
        const startData = await startRes.json() as { challengeId?: string; error?: string }
        if (!startRes.ok || startData.error) throw new Error(startData.error ?? 'Swap start failed')

        // Execute W3S PIN challenge in browser
        setStatus('confirming')
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
        const sdk = new W3SSdk()
        sdk.setAppSettings({ appId: import.meta.env.VITE_CIRCLE_APP_ID as string })
        if (auth?.encryptionKey) {
          sdk.setAuthentication({ userToken: nan.userToken!, encryptionKey: auth.encryptionKey })
        }
        await new Promise<void>((resolve, reject) => {
          sdk.execute(startData.challengeId!, (err, res) => {
            if (err || !res) return reject(new Error(err?.message ?? 'Challenge failed'))
            resolve()
          })
        })

        // Poll for completion
        const txId = startData.challengeId! // server uses challengeId as transactionId placeholder
        const confirmRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'ucw-swap-confirm', userToken: nan.userToken, transactionId: txId }),
        })
        const confirmData = await confirmRes.json() as { result?: { txHash: string; explorerUrl: string }; error?: string }
        if (!confirmRes.ok || confirmData.error) throw new Error(confirmData.error ?? 'Swap confirm failed')
        setTxHash(confirmData.result?.txHash ?? '')
      } else {
        // wagmi or passkey — client-side swap
        const adapter = nan.isPasskeyUser
          ? await getPasskeyAdapterResolved()
          : await getWagmiAdapter()

        setStatus('confirming')
        const result = await kit.swap({
          from: { adapter, chain: ARC_TESTNET },
          tokenIn,
          tokenOut,
          amountIn,
          config: { slippageBps: 300, allowanceStrategy: 'approve' },
        })
        setTxHash((result as { txHash?: string }).txHash ?? '')
      }

      setStatus('success')
      addActivity({
        type: 'swap',
        description: `Swapped ${amountIn} ${tokenIn} → ${tokenOut}`,
        amount: parseFloat(amountIn),
        sign: '-',
        status: 'confirmed',
        txHash,
        chain: 'Arc Testnet',
      })
      toast.success(`Swap complete!`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        toast.info('Swap cancelled')
        setStatus('reviewed')
      } else {
        setError(msg)
        setStatus('error')
      }
    }
  }, [estimate, nan, tokenIn, tokenOut, amountIn, auth, addActivity, txHash, getWagmiAdapter, getPasskeyAdapterResolved])

  // ── render ─────────────────────────────────────────────────────────────────

  const busy = status === 'estimating' || status === 'signing' || status === 'confirming'

  return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--nan-text)] tracking-tight">Swap</h1>
          <p className="text-sm text-[var(--nan-text2)] mt-1">
            Swap stablecoins on Arc Testnet via Circle App Kit
          </p>
        </div>

        {/* Wallet required */}
        {!nan.isConnected && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 text-center text-sm text-[var(--nan-text2)]">
            Connect your wallet or log in to swap.
          </div>
        )}

        {nan.isConnected && status !== 'success' && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
            {/* Wallet path badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--nan-text3)]">
                Signing via
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--nan-bdr)] text-[var(--nan-text2)]">
                {nan.type === 'wagmi' ? 'Browser Wallet' : nan.type === 'passkey' ? 'Passkey' : 'Circle UCW'}
              </span>
            </div>

            {/* Token In */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">You pay</label>
              <div className="flex gap-2">
                <select
                  value={tokenIn}
                  onChange={(e) => { setTokenIn(e.target.value as Token); setEstimate(null); setStatus('idle') }}
                  disabled={busy}
                  className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm focus:outline-none"
                >
                  {TOKENS.map(t => <option key={t}>{t}</option>)}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountIn}
                  onChange={(e) => { setAmountIn(e.target.value); setEstimate(null); setStatus('idle') }}
                  placeholder="0.00"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--nan-blue)] tabular-nums"
                />
              </div>
            </div>

            {/* Flip */}
            <div className="flex justify-center">
              <button
                onClick={flipTokens}
                disabled={busy}
                className="w-9 h-9 rounded-full bg-[var(--nan-bg)] border border-[var(--nan-bdr)] flex items-center justify-center text-[var(--nan-text2)] hover:text-[var(--nan-text)] transition-colors"
              >
                <ArrowUpDown size={15} />
              </button>
            </div>

            {/* Token Out */}
            <div className="space-y-1">
              <label className="text-xs text-[var(--nan-text3)] font-medium">You receive</label>
              <div className="flex gap-2">
                <select
                  value={tokenOut}
                  onChange={(e) => { setTokenOut(e.target.value as Token); setEstimate(null); setStatus('idle') }}
                  disabled={busy}
                  className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] text-[var(--nan-text)] px-3 py-2 text-sm focus:outline-none"
                >
                  {TOKENS.map(t => <option key={t}>{t}</option>)}
                </select>
                <div className="flex-1 rounded-xl bg-[var(--nan-bdr)] px-3 py-2 text-sm text-[var(--nan-text2)] tabular-nums">
                  {estimate ? `≈ ${estimate.estimatedOutput.amount} ${estimate.estimatedOutput.token}` : '—'}
                </div>
              </div>
            </div>

            {/* Estimate details */}
            {estimate && status === 'reviewed' && (
              <div className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] p-3 space-y-1 text-xs text-[var(--nan-text2)]">
                <div className="flex justify-between">
                  <span>Estimated output</span>
                  <span className="text-[var(--nan-text)] tabular-nums">{estimate.estimatedOutput.amount} {estimate.estimatedOutput.token}</span>
                </div>
                {estimate.fees.map((f, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{f.type} fee</span>
                    <span className="tabular-nums">{f.amount} {f.token}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-[var(--nan-bdr)]">
                  <span>Slippage</span>
                  <span>3%</span>
                </div>
                <p className="text-[10px] text-[var(--nan-text3)] pt-1">
                  Routed via Circle App Kit (LiFi aggregator). Rates are estimates.
                </p>
              </div>
            )}

            {/* Error */}
            {status === 'error' && error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Status line */}
            {(status === 'signing' || status === 'confirming') && (
              <div className="flex items-center gap-2 text-xs text-[var(--nan-text2)]">
                <Loader2 size={13} className="animate-spin" />
                <span>{status === 'signing' ? 'Waiting for wallet approval…' : 'Confirming on-chain…'}</span>
              </div>
            )}

            {/* Actions */}
            {status !== 'reviewed' ? (
              <button
                onClick={() => void handleEstimate()}
                disabled={busy || !amountIn}
                className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {status === 'estimating' ? <><Loader2 size={15} className="animate-spin" /> Getting quote…</> : 'Get Quote'}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEstimate(null); setStatus('idle') }}
                  disabled={busy}
                  className="flex-1 py-3 rounded-xl bg-[var(--nan-bdr)] text-[var(--nan-text)] font-semibold text-sm disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => void handleSwap()}
                  disabled={busy}
                  className="flex-1 py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                  Swap
                </button>
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 text-center space-y-4">
            <CheckCircle size={40} className="mx-auto text-green-400" />
            <div>
              <p className="font-semibold text-[var(--nan-text)]">Swap complete!</p>
              <p className="text-sm text-[var(--nan-text2)] mt-1">{amountIn} {tokenIn} → {tokenOut}</p>
            </div>
            {txHash && (
              <a
                href={`https://explorer.testnet.arc.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--nan-blue)] hover:underline"
              >
                View on explorer <ExternalLink size={11} />
              </a>
            )}
            <button
              onClick={() => { setStatus('idle'); setEstimate(null); setAmountIn(''); setTxHash('') }}
              className="inline-flex items-center gap-1 text-xs text-[var(--nan-text2)] hover:text-[var(--nan-text)]"
            >
              <RefreshCw size={12} /> Swap again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
