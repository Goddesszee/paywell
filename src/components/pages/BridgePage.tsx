/**
 * BridgePage — Circle App Kit CCTP bridge for all four NAN login paths.
 *
 * Wallet path strategy:
 *   wagmi   → createViemAdapterFromProvider (browser wallet, no kitKey)
 *   passkey → getPasskeyAdapter (Circle Modular Wallet EIP-1193 shim)
 *   UCW     → POST /api/wallet { action: 'ucw-bridge-start' | 'ucw-bridge-confirm' }
 *   none    → prompt to connect
 *
 * Source chain is always Arc Testnet (the app's home chain).
 * Destination chains: Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia.
 * Uses useForwarder: true so Circle handles attestation — no destination wallet needed.
 */

import { useState, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
// arcTestnet used for chain ID constant SOURCE_CHAIN_ID

import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowDown, Loader2, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { useNanWallet } from '../../hooks/useNanWallet'
import { getPasskeyAdapter } from '../CirclePasskeyLogin'

interface KitLike {
  bridge(params: { from: { adapter: unknown; chain: string }; to: { chain: string; recipientAddress?: string; useForwarder?: boolean }; amount: string }): Promise<unknown>
}
const kit = new AppKit() as unknown as KitLike

const SOURCE_CHAIN = 'Arc_Testnet' as const
const SOURCE_CHAIN_ID = 5042002

const DEST_CHAINS = [
  { label: 'Base Sepolia', value: 'Base_Sepolia' },
  { label: 'Ethereum Sepolia', value: 'Eth_Sepolia' },
  { label: 'Arbitrum Sepolia', value: 'Arb_Sepolia' },
] as const

type BridgeStatus = 'idle' | 'signing' | 'approving' | 'burning' | 'attesting' | 'minting' | 'success' | 'error'

const STEP_LABELS: Record<string, string> = {
  approve: 'Approving USDC…',
  burn: 'Burning on Arc Testnet…',
  fetchAttestation: 'Waiting for Circle attestation…',
  mint: 'Minting on destination…',
}

export function BridgePage() {
  const nan = useNanWallet()
  const { connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const auth = useAppStore((s) => s.auth)
  const addActivity = useAppStore((s) => s.addActivity)

  const clientKey = (import.meta.env.VITE_CLIENT_KEY as string | undefined)?.trim()

  const [amount, setAmount] = useState('')
  const [destChain, setDestChain] = useState<string>(DEST_CHAINS[0].value)
  const [recipient, setRecipient] = useState('')
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [currentStep, setCurrentStep] = useState('')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  const getWagmiAdapter = useCallback(async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (nan.chainId !== SOURCE_CHAIN_ID) {
      await switchChainAsync({ chainId: SOURCE_CHAIN_ID })
    }
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }, [connector, nan.chainId, switchChainAsync])

  const getPasskeyAdapterResolved = useCallback(async () => {
    if (!clientKey) throw new Error('VITE_CLIENT_KEY not set')
    return getPasskeyAdapter({ clientKey })
  }, [clientKey])

  const handleBridge = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return }
    if (!nan.isConnected) { toast.error('Connect your wallet first'); return }

    const recipientAddr = (recipient.trim() || nan.address) as string
    if (!recipientAddr || !/^0x[0-9a-fA-F]{40}$/.test(recipientAddr)) {
      toast.error('Enter a valid recipient address')
      return
    }

    setStatus('signing')
    setError('')
    setTxHash('')
    setCurrentStep('')

    try {
      if (nan.isUcw) {
        // UCW path
        setCurrentStep('approve')
        const startRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'ucw-bridge-start',
            userToken: nan.userToken,
            walletAddress: nan.address,
            walletId: nan.walletId,
            destChain,
            amount,
          }),
        })
        const startData = await startRes.json() as { challengeId?: string; error?: string }
        if (!startRes.ok || startData.error) throw new Error(startData.error ?? 'Bridge start failed')

        setCurrentStep('burn')
        setStatus('burning')

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

        setCurrentStep('fetchAttestation')
        setStatus('attesting')
        const confirmRes = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'ucw-bridge-confirm', userToken: nan.userToken, transactionId: startData.challengeId }),
        })
        const confirmData = await confirmRes.json() as { txHash?: string; error?: string }
        if (!confirmRes.ok || confirmData.error) throw new Error(confirmData.error ?? 'Bridge confirm failed')
        setTxHash(confirmData.txHash ?? '')
      } else {
        // wagmi or passkey — client-side bridge with step events
        const adapter = nan.isPasskeyUser
          ? await getPasskeyAdapterResolved()
          : await getWagmiAdapter()

        const result = await kit.bridge({
          from: { adapter, chain: SOURCE_CHAIN },
          to: { chain: destChain, recipientAddress: recipientAddr, useForwarder: true },
          amount,
        })

        // Extract burn tx hash (first completed step with a hash)
        const steps = (result as { steps?: { name: string; txHash?: string }[] }).steps ?? []
        const burnStep = steps.find(s => s.name === 'burn')
        setTxHash(burnStep?.txHash ?? '')
      }

      setStatus('success')
      addActivity({
        type: 'bridge',
        description: `Bridged ${amount} USDC → ${DEST_CHAINS.find(d => d.value === destChain)?.label ?? destChain}`,
        amount: parseFloat(amount),
        sign: '-',
        status: 'confirmed',
        txHash,
        chain: 'Arc Testnet',
      })
      toast.success('Bridge complete!')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('denied')) {
        toast.info('Bridge cancelled')
        setStatus('idle')
      } else {
        setError(msg)
        setStatus('error')
      }
    }
  }, [amount, destChain, recipient, nan, auth, addActivity, txHash, getWagmiAdapter, getPasskeyAdapterResolved])

  const busy = ['signing','approving','burning','attesting','minting'].includes(status)
  const stepLabel = currentStep ? (STEP_LABELS[currentStep] ?? `${currentStep}…`) : 'Processing…'

  return (
    <div className="min-h-dvh bg-[var(--nan-bg)] flex flex-col items-center justify-start pt-6 pb-24 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--nan-text)] tracking-tight">Bridge</h1>
          <p className="text-sm text-[var(--nan-text2)] mt-1">
            Move USDC cross-chain via Circle CCTP
          </p>
        </div>

        {!nan.isConnected && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 text-center text-sm text-[var(--nan-text2)]">
            Connect your wallet or log in to bridge.
          </div>
        )}

        {nan.isConnected && status !== 'success' && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-5 space-y-4">
            {/* Wallet path badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--nan-text3)]">Signing via</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--nan-bdr)] text-[var(--nan-text2)]">
                {nan.type === 'wagmi' ? 'Browser Wallet' : nan.type === 'passkey' ? 'Passkey' : 'Circle UCW'}
              </span>
            </div>

            {/* From */}
            <div className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--nan-text3)]">
                <span>From</span>
                <span className="font-medium text-[var(--nan-text2)]">Arc Testnet</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00 USDC"
                disabled={busy}
                className="w-full bg-transparent text-2xl font-bold text-[var(--nan-text)] placeholder:text-[var(--nan-text3)] focus:outline-none tabular-nums"
              />
            </div>

            <div className="flex justify-center">
              <ArrowDown size={18} className="text-[var(--nan-text3)]" />
            </div>

            {/* To */}
            <div className="rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--nan-text3)]">
                <span>To</span>
                <select
                  value={destChain}
                  onChange={(e) => setDestChain(e.target.value)}
                  disabled={busy}
                  className="bg-transparent text-[var(--nan-text2)] text-xs focus:outline-none"
                >
                  {DEST_CHAINS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={nan.address ?? '0x… recipient address'}
                disabled={busy}
                className="w-full bg-transparent text-sm text-[var(--nan-text)] placeholder:text-[var(--nan-text3)] focus:outline-none font-mono"
              />
              {!recipient && nan.address && (
                <p className="text-[10px] text-[var(--nan-text3)]">Defaults to your own address</p>
              )}
            </div>

            {/* Step progress */}
            {busy && (
              <div className="flex items-center gap-2 rounded-xl bg-[var(--nan-bg)] border border-[var(--nan-bdr)] p-3 text-xs text-[var(--nan-text2)]">
                <Loader2 size={13} className="animate-spin shrink-0" />
                <span>{stepLabel}</span>
              </div>
            )}

            {/* Error */}
            {status === 'error' && error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={() => void handleBridge()}
              disabled={busy || !amount}
              className="w-full py-3 rounded-xl bg-[var(--nan-blue)] text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 size={15} className="animate-spin" /> {stepLabel}</> : 'Bridge USDC'}
            </button>

            <p className="text-[10px] text-center text-[var(--nan-text3)]">
              Powered by Circle CCTP · Forwarding service handles attestation automatically
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-2xl bg-[var(--nan-surface)] border border-[var(--nan-bdr)] p-6 text-center space-y-4">
            <CheckCircle size={40} className="mx-auto text-green-400" />
            <div>
              <p className="font-semibold text-[var(--nan-text)]">Bridge complete!</p>
              <p className="text-sm text-[var(--nan-text2)] mt-1">
                {amount} USDC → {DEST_CHAINS.find(d => d.value === destChain)?.label ?? destChain}
              </p>
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
              onClick={() => { setStatus('idle'); setAmount(''); setTxHash(''); setCurrentStep('') }}
              className="inline-flex items-center gap-1 text-xs text-[var(--nan-text2)] hover:text-[var(--nan-text)]"
            >
              <RefreshCw size={12} /> Bridge again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
