import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowLeftRight, ArrowRight, CheckCircle, ExternalLink, Loader } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { formatUsdc } from '@/onchain-money'

const appKit = new AppKit()

const PW_BG       = '#FFFFFF'
const PW_SURFACE  = '#F7F7F8'
const PW_BORDER   = '#E4E4E7'
const PW_TEXT     = '#0D0D0D'
const PW_TEXT_2   = '#5C5C6B'
const PW_BLACK    = '#0D0D0D'
const PW_WHITE    = '#FFFFFF'
const SANS        = 'Inter, sans-serif'

interface BridgeChainOption {
  label: string
  kitName: string
  chainId: number
  explorer: string
}

const CHAINS: BridgeChainOption[] = [
  { label: 'Arc Testnet',        kitName: 'Arc_Testnet',        chainId: 5042002, explorer: 'https://testnet.arcscan.app/tx/' },
  { label: 'Base Sepolia',       kitName: 'Base_Sepolia',       chainId: 84532,   explorer: 'https://sepolia.basescan.org/tx/' },
  { label: 'Arbitrum Sepolia',   kitName: 'Arbitrum_Sepolia',   chainId: 421614,  explorer: 'https://sepolia.arbiscan.io/tx/' },
  { label: 'Ethereum Sepolia',   kitName: 'Ethereum_Sepolia',   chainId: 11155111, explorer: 'https://sepolia.etherscan.io/tx/' },
  { label: 'Optimism Sepolia',   kitName: 'Optimism_Sepolia',   chainId: 11155420, explorer: 'https://sepolia-optimism.etherscan.io/tx/' },
]

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
interface StepState { name: StepName; label: string; status: 'idle' | 'active' | 'done' | 'error'; txHash?: string; explorerUrl?: string }

const INITIAL_STEPS: StepState[] = [
  { name: 'approve',          label: 'Approve USDC',         status: 'idle' },
  { name: 'burn',             label: 'Burn on source chain', status: 'idle' },
  { name: 'fetchAttestation', label: 'Circle attestation',   status: 'idle' },
  { name: 'mint',             label: 'Mint on destination',  status: 'idle' },
]

export function BridgePage() {
  const { connector, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)

  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx]     = useState(1)
  const [amount, setAmount]   = useState('')
  const [steps, setSteps]     = useState<StepState[]>(INITIAL_STEPS)
  const [status, setStatus]   = useState<'idle' | 'bridging' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg]   = useState('')

  const fromChain = CHAINS[fromIdx]
  const toChain   = CHAINS[toIdx]

  const updateStep = (name: StepName, patch: Partial<StepState>) =>
    setSteps(prev => prev.map(s => s.name === name ? { ...s, ...patch } : s))

  const handleBridge = async () => {
    if (!connector || !isConnected || !amount) return
    setStatus('bridging')
    setErrMsg('')
    setSteps(INITIAL_STEPS)

    try {
      // Switch to source chain
      if (chainId !== fromChain.chainId) {
        await switchChainAsync({ chainId: fromChain.chainId })
      }

      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter  = await createViemAdapterFromProvider({ provider })

      updateStep('approve', { status: 'active' })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await appKit.bridge({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        from: { adapter, chain: fromChain.kitName as unknown as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to:   { adapter, chain: toChain.kitName as unknown as any },
        amount,
      })

      // Reflect step results
      for (const step of result.steps ?? []) {
        const name = step.name as StepName
        updateStep(name, {
          status: step.state === 'success' ? 'done' : 'error',
          txHash: step.txHash,
          explorerUrl: step.explorerUrl,
        })
      }

      if (result.state === 'success') {
        setStatus('done')
        addActivity({
          type: 'bridge',
          description: `Bridge to ${toChain.label}`,
          amount: parseFloat(amount),
          sign: '-',
          status: 'confirmed',
          counterparty: toChain.label,
          txHash: result.steps?.find(s => s.name === 'mint')?.txHash,
        })
      } else {
        setStatus('error')
        setErrMsg('Bridge returned non-success state.')
      }
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
    }
  }

  const reset = () => { setStatus('idle'); setSteps(INITIAL_STEPS); setAmount('') }

  if (!isConnected) return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: SANS, color: PW_TEXT_2 }}>
      Connect your wallet to bridge USDC
    </div>
  )

  return (
    <div style={{ fontFamily: SANS, maxWidth: 480, margin: '0 auto', padding: '0 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 24px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeftRight size={18} color={PW_TEXT} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: PW_TEXT }}>Bridge USDC</div>
          <div style={{ fontSize: 12, color: PW_TEXT_2 }}>Move USDC across chains via CCTP V2</div>
        </div>
      </div>

      {/* From / To selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 32px 1fr', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {/* From */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</div>
          <select
            value={fromIdx}
            onChange={e => {
              const v = Number(e.target.value)
              setFromIdx(v)
              if (v === toIdx) setToIdx(v === 0 ? 1 : 0)
            }}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${PW_BORDER}`, borderRadius: 10, background: PW_SURFACE, color: PW_TEXT, fontSize: 13, fontWeight: 500, fontFamily: SANS, appearance: 'none', cursor: 'pointer' }}
          >
            {CHAINS.map((c, i) => <option key={c.kitName} value={i}>{c.label}</option>)}
          </select>
        </div>

        {/* Arrow */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <ArrowRight size={16} color={PW_TEXT_2} />
        </div>

        {/* To */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</div>
          <select
            value={toIdx}
            onChange={e => {
              const v = Number(e.target.value)
              setToIdx(v)
              if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0)
            }}
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${PW_BORDER}`, borderRadius: 10, background: PW_SURFACE, color: PW_TEXT, fontSize: 13, fontWeight: 500, fontFamily: SANS, appearance: 'none', cursor: 'pointer' }}
          >
            {CHAINS.map((c, i) => <option key={c.kitName} value={i} disabled={i === fromIdx}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: PW_TEXT_2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={status === 'bridging'}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${PW_BORDER}`, borderRadius: 10, background: PW_BG, color: PW_TEXT, fontSize: 16, fontWeight: 600, fontFamily: SANS, boxSizing: 'border-box', outline: 'none' }}
          />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: PW_TEXT_2 }}>USDC</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['1', '5', '10', '25'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex: 1, padding: '6px 0', border: `1px solid ${PW_BORDER}`, borderRadius: 8, background: amount === v ? PW_BLACK : PW_SURFACE, color: amount === v ? PW_WHITE : PW_TEXT, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: SANS }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Info card */}
      <div style={{ background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: PW_TEXT_2 }}>Protocol</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: PW_TEXT }}>CCTP V2 Fast</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: PW_TEXT_2 }}>Est. time</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: PW_TEXT }}>8–20 seconds</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: PW_TEXT_2 }}>You send</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: PW_TEXT }}>{amount || '0.00'} USDC</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: PW_TEXT_2 }}>You receive</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: PW_TEXT }}>{amount || '0.00'} USDC</div>
        </div>
      </div>

      {/* Steps (during/after bridge) */}
      {status !== 'idle' && (
        <div style={{ border: `1px solid ${PW_BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          {steps.map((step, i) => (
            <div key={step.name} style={{ padding: '12px 16px', borderBottom: i < steps.length - 1 ? `1px solid ${PW_BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.status === 'done' ? PW_BLACK : step.status === 'active' ? PW_SURFACE : PW_SURFACE,
                border: `1px solid ${step.status === 'done' ? PW_BLACK : step.status === 'error' ? '#E53E3E' : PW_BORDER}` }}>
                {step.status === 'done'   && <CheckCircle size={14} color={PW_WHITE} />}
                {step.status === 'active' && <Loader size={14} color={PW_TEXT} style={{ animation: 'spin 1s linear infinite' }} />}
                {step.status === 'idle'   && <span style={{ fontSize: 11, color: PW_TEXT_2 }}>{i + 1}</span>}
                {step.status === 'error'  && <span style={{ fontSize: 11, color: '#E53E3E' }}>!</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: PW_TEXT }}>{step.label}</div>
                {step.txHash && (
                  <a href={`${fromChain.explorer}${step.txHash}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: PW_TEXT_2, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    {step.txHash.slice(0, 10)}…{step.txHash.slice(-6)} <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {status === 'error' && errMsg && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991B1B' }}>
          {errMsg}
        </div>
      )}

      {/* CTA */}
      {status === 'done' ? (
        <button onClick={reset}
          style={{ width: '100%', padding: '15px 0', background: PW_SURFACE, border: `1px solid ${PW_BORDER}`, borderRadius: 14, fontSize: 15, fontWeight: 600, color: PW_TEXT, cursor: 'pointer', fontFamily: SANS }}>
          Bridge again
        </button>
      ) : (
        <button
          onClick={() => void handleBridge()}
          disabled={status === 'bridging' || !amount || parseFloat(amount) <= 0}
          style={{ width: '100%', padding: '15px 0', background: status === 'bridging' || !amount ? PW_SURFACE : PW_BLACK,
            border: `1px solid ${status === 'bridging' || !amount ? PW_BORDER : PW_BLACK}`,
            borderRadius: 14, fontSize: 15, fontWeight: 600,
            color: status === 'bridging' || !amount ? PW_TEXT_2 : PW_WHITE,
            cursor: status === 'bridging' || !amount ? 'not-allowed' : 'pointer', fontFamily: SANS,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {status === 'bridging' ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Bridging…</> : `Bridge ${amount || '0.00'} USDC →`}
        </button>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: PW_TEXT_2, textAlign: 'center' }}>
        Powered by Circle CCTP V2 · Transactions are irreversible
      </div>
    </div>
  )
}
