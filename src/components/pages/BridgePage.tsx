/**
 * BridgePage — compact premium redesign.
 *
 * ALL transaction logic, adapters (wagmi, UCW, passkey), CCTP V2 step
 * tracking, live fee fetching, error handling, and activity recording
 * are preserved verbatim from the previous version.
 *
 * Layout changes only:
 * - Replaced hard-coded hex strings with useNanTheme() tokens so the
 *   page responds to dark/light mode identically to SwapPage.
 * - Combined From/To chain selectors into a single compact card.
 * - Amount + quick-chips tightened into the same card as the selectors.
 * - Fee summary collapsed into a compact 2-col grid instead of four
 *   full-width rows.
 * - Step tracker dots replaced with a slim numbered progress strip.
 * - "Bridge again" success state matches SwapPage success screen.
 * - inCard padding tokens brought in line with SwapPage (14 px side gutter).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import {
  ArrowDownUp, CheckCircle, ExternalLink, AlertCircle,
  Info, X, ChevronDown,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { safeJson } from '../../lib/safe-json'
import { confirmWithRetry } from '../../lib/poll-confirm'
import { bridgeCustomFee, feeCollectionActive } from '../../lib/fee-config'
import { useAppStore } from '../../store/appStore'
import { executeWithGuard } from '../../lib/circle-execute'
import { getPasskeyAdapter } from '../CirclePasskeyLogin'
import { bridgeFee, BRIDGE_FEE_BPS, bpsToPercent } from '../../lib/fees'
import { getClientKey, ensureCircleCreds, getChallengeTransactionId, SESSION_EXPIRED_MSG } from '../../lib/circle-session'
import { useNanTheme } from '../../hooks/useNanTheme'

// ── Typed wrappers for App Kit bridge result ──────────────────────────────────
interface BridgeStep { name: string; state: string; txHash?: string; explorerUrl?: string; error?: string; message?: string; reason?: string }
interface BridgeResult { steps?: BridgeStep[]; state?: string }
type AppKitChain = Parameters<InstanceType<typeof AppKit>['bridge']>[0]['from']['chain']

// ── CCTP V2 live fee endpoint ─────────────────────────────────────────────────
const CCTP_FEE_API = 'https://iris-api.circle.com/v2/burn/USDC/fees'

interface BridgeChain {
  label: string
  kitName: string
  chainId: number
  cctpDomain: number
  explorer: string
  gasToken: string
  gasIsUsdc: boolean
  paymasterSupported: boolean
  paymasterNote?: string
}

// Circle blockchain ids for creating an email/Google (UCW) wallet on another chain.
const UCW_CHAIN_ENUM: Record<number, string> = { 1: 'ETH', 8453: 'BASE', 42161: 'ARB', 10: 'OP', 137: 'MATIC', 43114: 'AVAX', 130: 'UNI' }

// CCTP V2 supported mainnets — identical to original.
const CHAINS: BridgeChain[] = [
  { label:'Arc',          kitName:'Arc',              chainId:5042,    cctpDomain:26, explorer:'https://explorer.arc.io/tx/',                       gasToken:'USDC', gasIsUsdc:true,  paymasterSupported:false },
  { label:'Ethereum',     kitName:'Ethereum',         chainId:1,       cctpDomain:0,  explorer:'https://etherscan.io/tx/',                           gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Base',         kitName:'Base',             chainId:8453,    cctpDomain:6,  explorer:'https://basescan.org/tx/',                           gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.7 + v0.8 — pay gas in USDC (10% surcharge, ERC-4337 required)' },
  { label:'Arbitrum One', kitName:'Arbitrum',         chainId:42161,   cctpDomain:3,  explorer:'https://arbiscan.io/tx/',                            gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.7 + v0.8 — pay gas in USDC (10% surcharge, ERC-4337 required)' },
  { label:'OP Mainnet',   kitName:'Optimism',         chainId:10,      cctpDomain:2,  explorer:'https://optimistic.etherscan.io/tx/',                gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Polygon',      kitName:'Polygon',          chainId:137,     cctpDomain:7,  explorer:'https://polygonscan.com/tx/',                        gasToken:'POL',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Avalanche',    kitName:'Avalanche',        chainId:43114,   cctpDomain:1,  explorer:'https://snowtrace.io/tx/',                           gasToken:'AVAX', gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Unichain',     kitName:'Unichain',         chainId:130,     cctpDomain:10, explorer:'https://uniscan.xyz/tx/',                            gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Linea',        kitName:'Linea',            chainId:59144,   cctpDomain:11, explorer:'https://lineascan.build/tx/',                        gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:false },
  { label:'Sei',          kitName:'Sei',              chainId:1329,    cctpDomain:16, explorer:'https://seistream.app/tx/',                          gasToken:'SEI',  gasIsUsdc:false, paymasterSupported:false },
  { label:'World Chain',  kitName:'World_Chain',      chainId:480,     cctpDomain:14, explorer:'https://worldchain-mainnet.explorer.alchemy.com/tx/',gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:false },
]

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
interface StepState { name: StepName; label: string; status: 'idle'|'active'|'done'|'error'; txHash?: string; explorerUrl?: string }

const INITIAL_STEPS: StepState[] = [
  { name:'approve',          label:'Approve USDC',         status:'idle' },
  { name:'burn',             label:'Burn on source',       status:'idle' },
  { name:'fetchAttestation', label:'Attestation',          status:'idle' },
  { name:'mint',             label:'Mint on dest',         status:'idle' },
]

interface LiveFee { bps: number; label: string; fetched: boolean }

// ── Chain selector dropdown ───────────────────────────────────────────────────
function ChainSelect({ value, onChange, exclude, label: fieldLabel, c }: {
  value: number
  onChange: (i: number) => void
  exclude?: number
  label: string
  c: ReturnType<typeof useNanTheme>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const F = 'var(--nan-font)'

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = CHAINS[value]
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 5 }}>
        {fieldLabel}
      </div>
      <div ref={ref} style={{ position: 'relative' as const, zIndex: open ? 100 : 1 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={`Select ${fieldLabel} chain`}
          aria-expanded={open}
          style={{
            width: '100%', padding: '9px 11px',
            border: `1px solid ${open ? c.blue : c.bdr2}`,
            borderRadius: 11,
            background: c.surf,
            color: c.text, fontSize: 13, fontWeight: 700, fontFamily: F,
            cursor: 'pointer', outline: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            textAlign: 'left' as const,
            WebkitTapHighlightColor: 'transparent',
            transition: 'border-color 0.15s',
            boxShadow: open ? `0 0 0 3px ${c.blueDim}` : 'none',
          }}
        >
          <span>{selected.label}</span>
          <ChevronDown
            size={13}
            color={c.t3}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
          />
        </button>
        {open && (
          <div style={{
            position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: c.surf, border: `1px solid ${c.bdr2}`,
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            maxHeight: 256, overflowY: 'auto' as const, zIndex: 200,
          }}>
            {CHAINS.map((ch, i) => {
              const disabled = ch.cctpDomain < 0 || i === exclude
              const isSelected = i === value
              return (
                <button
                  key={ch.kitName}
                  type="button"
                  disabled={disabled}
                  onClick={() => { if (!disabled) { onChange(i); setOpen(false) } }}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: isSelected ? c.blueDim : 'transparent',
                    color: disabled ? c.t3 : isSelected ? c.blue : c.text,
                    fontSize: 12, fontWeight: isSelected ? 700 : 500,
                    fontFamily: F, border: 'none',
                    borderBottom: `1px solid ${c.bdr}`,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left' as const,
                    opacity: disabled ? 0.4 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span>{ch.label}{ch.cctpDomain < 0 ? ' (no CCTP)' : ''}</span>
                  {isSelected && <CheckCircle size={12} color={c.blue} />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step progress strip ───────────────────────────────────────────────────────
function StepStrip({ steps, fromExplorer, toExplorer, c }: {
  steps: StepState[]
  fromExplorer: string
  toExplorer: string
  c: ReturnType<typeof useNanTheme>
}) {
  const F = 'var(--nan-font)'
  return (
    <div style={{
      background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 12,
      padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 0,
    }}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const dotColor =
          step.status === 'done'   ? c.green :
          step.status === 'error'  ? c.red   :
          step.status === 'active' ? c.blue  : c.t3

        const labelColor =
          step.status === 'done'   ? c.t2   :
          step.status === 'active' ? c.text :
          step.status === 'error'  ? c.red  : c.t3

        const explorerBase = step.name === 'mint' ? toExplorer : fromExplorer

        return (
          <div key={step.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              {/* Step indicator */}
              <div style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background:
                  step.status === 'done'   ? 'rgba(16,185,129,0.12)' :
                  step.status === 'active' ? c.blueDim :
                  step.status === 'error'  ? 'rgba(239,68,68,0.10)' :
                  c.surf3,
                border: `1.5px solid ${
                  step.status === 'done'   ? 'rgba(16,185,129,0.30)' :
                  step.status === 'active' ? c.blueBd :
                  step.status === 'error'  ? 'rgba(239,68,68,0.35)' :
                  c.bdr
                }`,
              }}>
                {step.status === 'done'  && <CheckCircle size={11} color={dotColor} strokeWidth={2.5} />}
                {step.status === 'error' && <X size={11} color={dotColor} strokeWidth={2.5} />}
                {step.status === 'active' && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.blue, display: 'inline-block', animation: 'nan-pulse 1s ease-in-out infinite' }} />
                )}
                {step.status === 'idle' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, fontFamily: F }}>{i + 1}</span>
                )}
              </div>

              {/* Step label + status text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: step.status === 'active' ? 700 : 500, color: labelColor }}>
                    {step.label}
                  </span>
                  {step.status === 'active' && (
                    <span style={{ fontSize: 10, color: c.blue, fontWeight: 600 }}>In progress…</span>
                  )}
                  {step.status === 'done' && (
                    <span style={{ fontSize: 10, color: c.green, fontWeight: 600 }}>Done</span>
                  )}
                  {step.status === 'error' && (
                    <span style={{ fontSize: 10, color: c.red, fontWeight: 600 }}>Failed</span>
                  )}
                </div>
                {step.txHash && (
                  <a
                    href={`${explorerBase}${step.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 10, color: c.blue, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 1, textDecoration: 'none', fontFamily: 'var(--nan-mono)' }}
                  >
                    {step.txHash.slice(0, 10)}…{step.txHash.slice(-6)} <ExternalLink size={8} />
                  </a>
                )}
              </div>
            </div>

            {/* Connector line between steps */}
            {!isLast && (
              <div style={{ width: 1.5, height: 8, background: c.bdr, marginLeft: 10 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
// ── RecoverBridge — re-mint stuck CCTP transfers ──────────────────────────────
const IRIS_API = 'https://iris-api.circle.com/v2'
const MSG_TRANSMITTER: Record<number, `0x${string}`> = {
  1:     '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81',
  8453:  '0xAD09780d193884d503182aD4588450C416D6F9D',
  42161: '0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca',
  10:    '0x4d41f22c5a0e5c74090899e5a8Fb597a8842b3e8',
  137:   '0xF3be9355363857F3e001be68856A2f96b4C39Ba9',
  43114: '0x8186359aF5F57FbB40c6b14A588d2A59C0C29880',
  5042:  '0x5C3D9E9eA2aCe0FBCf80cF23Cf2e9dcCDCf4b38A',
  130:   '0x5C3D9E9eA2aCe0FBCf80cF23Cf2e9dcCDCf4b38A',
}
const RECEIVE_ABI = [{
  name: 'receiveMessage',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'message', type: 'bytes' }, { name: 'attestation', type: 'bytes' }],
  outputs: [{ name: 'success', type: 'bool' }],
}] as const

function RecoverBridge({ c }: { c: ReturnType<typeof useNanTheme> }) {
  const { address, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const chainId = useChainId()
  const [open, setOpen]         = useState(false)
  const [txHash, setTxHash]     = useState('')
  const [srcIdx, setSrcIdx]     = useState(0)
  const [status, setStatus]     = useState<'idle'|'fetching'|'ready'|'minting'|'done'|'error'>('idle')
  const [msg, setMsg]           = useState<{ message: string; attestation: string; destDomain: number } | null>(null)
  const [errText, setErrText]   = useState('')
  const F = 'var(--nan-font)'

  const srcChain = CHAINS[srcIdx]

  const fetchAttestation = useCallback(async () => {
    const hash = txHash.trim()
    if (!hash.startsWith('0x')) { setErrText('Paste a valid 0x... transaction hash'); return }
    setStatus('fetching'); setErrText(''); setMsg(null)
    try {
      const url = `${IRIS_API}/messages/${srcChain.cctpDomain}?transactionHash=${hash}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Iris API ${res.status}`)
      const data = await res.json() as { messages?: { message: string; attestation: string; eventNonce: string; status: string; sourceDomain: number; destinationDomain: number }[] }
      const m = data.messages?.[0]
      if (!m) throw new Error('No messages found for this TX. Check the source chain and hash.')
      if (m.status !== 'complete') throw new Error(`Attestation not ready yet (status: ${m.status}). Wait a few minutes and try again.`)
      setMsg({ message: m.message, attestation: m.attestation, destDomain: m.destinationDomain })
      setStatus('ready')
    } catch (e) {
      setErrText(e instanceof Error ? e.message : 'Could not fetch attestation')
      setStatus('error')
    }
  }, [txHash, srcChain.cctpDomain])

  const submitMint = useCallback(async () => {
    if (!msg || !isConnected || !address) return
    // Find destination chain by CCTP domain
    const destChain = CHAINS.find(ch => ch.cctpDomain === msg.destDomain)
    if (!destChain) { setErrText('Unknown destination chain domain: ' + msg.destDomain); return }
    const transmitter = MSG_TRANSMITTER[destChain.chainId]
    if (!transmitter) { setErrText('No MessageTransmitter address for ' + destChain.label); return }
    setStatus('minting'); setErrText('')
    try {
      // Switch to destination chain if needed
      if (chainId !== destChain.chainId) {
        switchChain({ chainId: destChain.chainId })
        await new Promise(r => setTimeout(r, 1500))
      }
      const { createWalletClient, custom, publicActions } = await import('viem')
      const chainModule = await import('viem/chains')
      const allChains = Object.values(chainModule) as { id?: number }[]
      const viemChain = allChains.find(ch => ch && typeof ch === 'object' && ch.id === destChain.chainId) as { id: number; name: string; rpcUrls: { default: { http: string[] } }; nativeCurrency: { name: string; symbol: string; decimals: number } } | undefined
      if (!viemChain) throw new Error('Could not find viem chain for ' + destChain.label)
      const provider = (window as unknown as { ethereum?: EIP1193Provider }).ethereum
      if (!provider) throw new Error('No injected wallet found. Please connect MetaMask or similar.')
      const client = createWalletClient({ account: address, chain: viemChain, transport: custom(provider) }).extend(publicActions)
      const hash = await client.writeContract({
        address: transmitter,
        abi: RECEIVE_ABI,
        functionName: 'receiveMessage',
        args: [msg.message as `0x${string}`, msg.attestation as `0x${string}`],
      })
      await client.waitForTransactionReceipt({ hash })
      setStatus('done')
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Mint failed'
      setErrText(m.includes('already') || m.includes('Used nonce') ? 'This transfer was already minted — check your destination wallet balance.' : m.slice(0, 200))
      setStatus('error')
    }
  }, [msg, isConnected, address, chainId, switchChain])

  if (!open) return (
    <button onClick={() => setOpen(true)}
      style={{ background: 'none', border: 'none', color: c.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, padding: '6px 0', textDecoration: 'underline', width: '100%', textAlign: 'center' as const }}>
      Stuck USDC? Recover a failed bridge →
    </button>
  )

  return (
    <div style={{ background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: c.text, letterSpacing: '-0.02em' }}>Recover stuck USDC</div>
          <div style={{ fontSize: 11, color: c.t3, marginTop: 1 }}>Re-mint a USDC transfer that burned but never arrived</div>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.t3, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {status === 'done' ? (
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '16px', textAlign: 'center' as const }}>
          <CheckCircle size={28} color="#10B981" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>USDC recovered!</div>
          <div style={{ fontSize: 12, color: c.t3 }}>Your USDC has been minted on the destination chain. Check your wallet.</div>
          <button onClick={() => { setStatus('idle'); setTxHash(''); setMsg(null) }}
            style={{ marginTop: 12, padding: '8px 20px', borderRadius: 10, background: '#10B981', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F }}>
            Recover another
          </button>
        </div>
      ) : (
        <>
          {/* Source chain */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 5 }}>Source chain (where the USDC burned)</div>
            <ChainSelect value={srcIdx} onChange={setSrcIdx} label="Source chain" c={c} />
          </div>

          {/* TX hash input */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 5 }}>Burn transaction hash</div>
            <input
              value={txHash}
              onChange={e => { setTxHash(e.target.value); setStatus('idle'); setMsg(null); setErrText('') }}
              placeholder="0x..."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: c.surf, border: `1px solid ${errText ? '#EF4444' : c.bdr2}`, color: c.text, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* No TX hash help */}
          {!txHash.trim() && (
            <div style={{ background: c.surf, border: `1px solid ${c.bdr}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.t2, marginBottom: 6 }}>Don't have the transaction hash?</div>
              <div style={{ fontSize: 11, color: c.t3, lineHeight: 1.6 }}>
                Find it on the source chain explorer in your wallet's transaction history. Look for a transaction to the CCTP TokenMessenger contract around the time you tried to bridge.
              </div>
              <a
                href={`${srcChain.explorer}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11, color: c.blue, textDecoration: 'none', fontWeight: 600 }}>
                Open {srcChain.label} explorer <ExternalLink size={10} />
              </a>
            </div>
          )}

          {/* Error */}
          {errText && (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: '#EF4444', lineHeight: 1.5 }}>{errText}</span>
            </div>
          )}

          {/* Attestation ready info */}
          {msg && status === 'ready' && (
            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle size={14} color="#10B981" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Attestation confirmed — ready to mint on {CHAINS.find(ch => ch.cctpDomain === msg.destDomain)?.label ?? 'destination chain'}</span>
            </div>
          )}

          {/* CTA */}
          {(status === 'idle' || status === 'fetching' || status === 'error') && (
            <button
              onClick={() => { void fetchAttestation() }}
              disabled={status === 'fetching' || !txHash.trim()}
              style={{ width: '100%', height: 44, borderRadius: 12, background: txHash.trim() ? c.blue : c.surf, border: `1px solid ${txHash.trim() ? c.blue : c.bdr}`, color: txHash.trim() ? '#fff' : c.t3, fontSize: 14, fontWeight: 700, cursor: txHash.trim() ? 'pointer' : 'not-allowed', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {status === 'fetching' ? <><span className="nan-spinner" />Fetching attestation…</> : 'Check transfer status'}
            </button>
          )}
          {(status === 'ready' || status === 'minting') && (
            <button
              onClick={() => { void submitMint() }}
              disabled={status === 'minting' || !isConnected}
              style={{ width: '100%', height: 44, borderRadius: 12, background: '#10B981', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 18px rgba(16,185,129,0.3)' }}>
              {status === 'minting' ? <><span className="nan-spinner" />Minting USDC…</> : 'Recover USDC →'}
            </button>
          )}

          {!isConnected && (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
              <ConnectKitButton />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function BridgePage({ inCard = false }: { inCard?: boolean }) {
  const c = useNanTheme()
  const F = 'var(--nan-font)'
  const MONO = 'var(--nan-mono)'

  const { connector, isConnected, address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const isPasskeyUser = !wagmiAddress && !!auth?.isPasskeyUser
  const isCircleUser  = !wagmiAddress && !!auth?.circleWalletAddress && !isPasskeyUser
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)

  const [appKit] = useState<AppKit>(() => new AppKit())

  const bridgePrefill    = useAppStore(s => s.bridgePrefill)
  const setBridgePrefill = useAppStore(s => s.setBridgePrefill)

  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx,   setToIdx]   = useState(1)
  const [amount,  setAmount]  = useState('')

  useEffect(() => {
    if (!bridgePrefill) return
    if (bridgePrefill.amount) setAmount(bridgePrefill.amount)
    if (bridgePrefill.toChain) {
      const want = bridgePrefill.toChain.toLowerCase()
      const idx  = CHAINS.findIndex(ch => ch.label.toLowerCase() === want)
      if (idx > 0) setToIdx(idx)
    }
    setBridgePrefill(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [steps,      setSteps]      = useState<StepState[]>(INITIAL_STEPS)
  const [status,     setStatus]     = useState<'idle'|'bridging'|'done'|'error'>('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const [liveFee,    setLiveFee]    = useState<LiveFee>({ bps: 0, label: '—', fetched: false })
  const [feeLoading, setFeeLoading] = useState(false)

  const fromChain = CHAINS[fromIdx]
  const toChain   = CHAINS[toIdx]

  // ── Live CCTP fee fetch ───────────────────────────────────────────────────
  const fetchLiveFee = useCallback(async () => {
    const src = fromChain.cctpDomain
    const dst = toChain.cctpDomain
    if (src < 0 || dst < 0 || src === dst) {
      setLiveFee({ bps: 0, label: 'Standard (free)', fetched: true })
      return
    }
    setFeeLoading(true)
    try {
      const res = await fetch(`${CCTP_FEE_API}/${src}/${dst}`)
      if (!res.ok) throw new Error('fee API error')
      type FeeEntry = { finalityThreshold?: number; transferType?: string; minimumFee?: number }
      const data = await res.json() as FeeEntry[]
      const fast = Array.isArray(data) ? data.find(f => f.finalityThreshold === 1000 || f.transferType === 'fast') : null
      if (fast && typeof fast.minimumFee === 'number') {
        const bps = fast.minimumFee
        setLiveFee({ bps, label: `${bps} bps (${(bps / 100).toFixed(3)}%)`, fetched: true })
      } else {
        setLiveFee({ bps: 0, label: 'Standard (free)', fetched: true })
      }
    } catch {
      setLiveFee({ bps: 0, label: 'Unable to fetch', fetched: false })
    } finally {
      setFeeLoading(false)
    }
  }, [fromChain.cctpDomain, toChain.cctpDomain])

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchLiveFee() }, [fetchLiveFee])

  const updateStep = (name: StepName, patch: Partial<StepState>) =>
    setSteps(prev => prev.map(s => s.name === name ? { ...s, ...patch } : s))

  // ── Computed fee values ───────────────────────────────────────────────────
  const gross          = parseFloat(amount) || 0
  // Only shown when a fee wallet is configured (otherwise nothing is charged)
  const platformFee    = gross > 0 && feeCollectionActive() ? bridgeFee(gross) : 0
  const cctpProtocolFee = gross > 0 && liveFee.bps > 0
    ? parseFloat((gross * liveFee.bps / 10000).toFixed(6))
    : 0
  const maxFeeUsdc = gross > 0 && liveFee.bps > 0
    ? parseFloat((cctpProtocolFee * 1.2).toFixed(6))
    : 0
  // The platform fee is added ON TOP of the amount (wallet pays amount + fee); only the CCTP protocol
  // fee comes out of the amount being bridged.
  const netReceived = Math.max(0, gross - cctpProtocolFee)
  const totalFromWallet = gross + platformFee

  // ── Bridge handler — ALL original logic preserved exactly ─────────────────
  const handleBridge = async () => {
    if (!amount) return
    setStatus('bridging')
    setErrMsg('')
    setSteps(INITIAL_STEPS)

    // Circle UCW (email / Google) path
    if (isCircleUser && wagmiAddress === undefined) {
      const authState = useAppStore.getState().auth
      if (!authState?.userToken) { setErrMsg('Session expired — please log in again.'); setStatus('error'); return }

      let resolvedWalletId  = authState.circleWalletId
      let resolvedAddress   = authState.circleWalletAddress
      if (!resolvedWalletId || !resolvedAddress) {
        try {
          const wr = await fetch('/api/wallet', { headers: { 'x-user-token': authState.userToken } })
          const wd = await safeJson<{ wallets?: { id: string; address: string }[]; error?: string }>(wr)
          const w  = wd.wallets?.[0]
          resolvedWalletId = w?.id
          resolvedAddress  = w?.address
          if (resolvedWalletId && resolvedAddress) {
            useAppStore.getState().setAuth({ ...authState, circleWalletId: resolvedWalletId, circleWalletAddress: resolvedAddress, walletAddress: resolvedAddress, walletId: resolvedWalletId })
          }
        } catch { /* ignore */ }
      }
      let userAddress = resolvedAddress
      let walletId    = resolvedWalletId
      const arcAddress = resolvedAddress
      if (!userAddress || !walletId) { setErrMsg('Could not load Circle wallet — please log out and log in again.'); setStatus('error'); return }

      // Bridging FROM another chain: the email wallet needs its own wallet on that chain (Circle creates one per
      // blockchain). Create it on demand (PIN), then the user funds it and taps Bridge again.
      if (fromChain.chainId !== 5042) {
        const bc = UCW_CHAIN_ENUM[fromChain.chainId]
        if (!bc) { setErrMsg(`Bridging from ${fromChain.label} with an email wallet isn't supported yet. Connect MetaMask or another browser wallet instead.`); setStatus('error'); return }
        try {
          const creds = await ensureCircleCreds()
          const tok = creds.userToken ?? authState.userToken
          const list = async () => {
            const r = await fetch('/api/wallet', { headers: { 'x-user-token': tok } })
            const d = await safeJson<{ wallets?: { id: string; address: string; blockchain?: string }[]; error?: string }>(r)
            return d.wallets ?? []
          }
          let w = (await list()).find(x => x.blockchain === bc)
          if (!w) {
            if (!creds.encryptionKey) throw new Error(SESSION_EXPIRED_MSG)
            const cr = await fetch('/api/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ucw-create-wallet', userToken: tok, blockchain: bc }) })
            const cd = await safeJson<{ challengeId?: string; error?: string }>(cr)
            if (!cr.ok || cd.error || !cd.challengeId) throw new Error(cd.error ?? 'Could not start wallet creation')
            const sdk0 = new W3SSdk({ appSettings: { appId: (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? '' } })
            sdk0.setAuthentication({ userToken: tok, encryptionKey: creds.encryptionKey })
            await new Promise<void>((resolve, reject) => {
              executeWithGuard(sdk0, cd.challengeId!, (err) => { err ? reject(new Error(err instanceof Error ? err.message : 'PIN approval failed')) : resolve() })
            })
            for (let i = 0; i < 8 && !w; i++) { await new Promise(r => setTimeout(r, 1500)); w = (await list()).find(x => x.blockchain === bc) }
            if (!w) throw new Error('Your wallet is being created — wait a few seconds and tap Bridge again.')
            setErrMsg(`Your ${fromChain.label} wallet is ready: ${w.address}. Send USDC to this address on ${fromChain.label} (plus a little for gas), then tap Bridge again.`)
            setStatus('error'); updateStep('approve', { status: 'idle' }); return
          }
          walletId = w.id; userAddress = w.address
        } catch (e) {
          setErrMsg(e instanceof Error ? e.message : 'Could not prepare your wallet.'); setStatus('error'); return
        }
      }

      try {
        updateStep('approve', { status: 'active' })
        const startResp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ucw-bridge-start', userToken: authState.userToken, walletAddress: userAddress, walletId, fromChain: fromChain.kitName, destChain: toChain.kitName, amount, recipientAddress: arcAddress }),
        })
        const startData = await safeJson<{ challengeId?: string; error?: string }>(startResp)
        if (!startResp.ok || startData.error || !startData.challengeId) throw new Error(startData.error ?? 'Bridge start failed')

        updateStep('approve', { status: 'done' })
        updateStep('burn',    { status: 'active' })

        const appId = (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? ''
        const sdk = new W3SSdk({ appSettings: { appId } })
        // The session key is memory/sessionStorage only — restore it (via the login refreshToken) or
        // tell the user plainly, instead of opening Circle's popup with an empty key.
        const creds = await ensureCircleCreds()
        if (!creds.encryptionKey) throw new Error(SESSION_EXPIRED_MSG)
        sdk.setAuthentication({ userToken: creds.userToken ?? authState.userToken, encryptionKey: creds.encryptionKey })

        let txId = await new Promise<string>((resolve, reject) => {
          executeWithGuard(sdk, startData.challengeId!, (err, result) => {
            if (err) { reject(new Error(err instanceof Error ? err.message : 'PIN approval failed')); return }
            const r = result as { data?: { transactionHash?: string; transactionId?: string } }
            resolve(r?.data?.transactionHash ?? r?.data?.transactionId ?? '')
          })
        })
        if (!txId) {
          // Circle exposes the transaction id as challenge.correlationIds[0]; it can lag the approval a moment.
          const c = await getChallengeTransactionId(creds.userToken ?? authState.userToken, startData.challengeId)
          txId = c.transactionId ?? ''
          if (!txId) throw new Error(c.status === 'FAILED' ? `Circle rejected the bridge${c.errorMessage ? `: ${c.errorMessage}` : ''}` : 'Circle did not return a transaction id yet — check your balance before retrying.')
        }

        updateStep('burn', { status: 'done', txHash: txId })
        updateStep('fetchAttestation', { status: 'active' })

        if (txId) {
          const confirmData = await confirmWithRetry<{ success?: boolean; txHash?: string; error?: string; pending?: boolean }>({ action: 'ucw-bridge-confirm', userToken: authState.userToken, transactionId: txId })
          if (confirmData.error) throw new Error(confirmData.error)
          updateStep('fetchAttestation', { status: 'done' })
          updateStep('mint', { status: 'done', txHash: confirmData.txHash })
        } else {
          updateStep('fetchAttestation', { status: 'done' })
          updateStep('mint', { status: 'done' })
        }

        setStatus('done')
        addActivity({ type: 'bridge', description: `Bridge to ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label })
      } catch (e: unknown) {
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
      }
      return
    }

    // Passkey (MSCA) path
    const clientKey = getClientKey()
    if (isPasskeyUser) {
      if (!clientKey) { setErrMsg('Modular Wallets not configured (VITE_CLIENT_KEY missing)'); setStatus('error'); return }
      if (fromChain.chainId !== 5042) { setErrMsg('Passkey wallet bridge is only supported from Arc currently.'); setStatus('error'); return }
      try {
        updateStep('approve', { status: 'active' })
        const adapter = await getPasskeyAdapter({ clientKey })
        const result  = await appKit.bridge({
          from: { adapter, chain: fromChain.kitName as AppKitChain },
          to:   { adapter, chain: toChain.kitName as AppKitChain },
          amount,
          config: { ...bridgeCustomFee(parseFloat(amount)) },
        }) as BridgeResult
        console.log('[bridge/passkey] result:', JSON.stringify({ state: result.state, steps: result.steps?.map(s => ({ name: s.name, state: s.state, error: s.error, message: s.message })) }))
        for (const step of result.steps ?? []) {
          updateStep(step.name as StepName, {
            status: step.state === 'success' ? 'done' : step.state === 'error' ? 'error' : 'idle',
            txHash: step.txHash,
          })
          if (step.state === 'error') setErrMsg(String(step.error ?? step.message ?? step.name + ' failed').slice(0, 300))
        }
        const topState     = result.state
        const allStepsDone = (result.steps ?? []).filter(s => s.name !== 'mint').every(s => s.state === 'success')
        if (topState === 'success' || topState === 'pending' || allStepsDone) {
          setStatus('done')
          addActivity({ type: 'bridge', description: `Bridge to ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label })
        } else {
          setStatus('error')
          const failedStep = result.steps?.find(s => s.state === 'error')
          const detail = failedStep
            ? String(failedStep.error ?? failedStep.message ?? failedStep.reason ?? failedStep.name + ' step failed').slice(0, 300)
            : `Bridge state: ${String(result.state ?? 'unknown')}. Check your passkey wallet has enough USDC and gas.`
          setErrMsg(detail)
        }
      } catch (e: unknown) {
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
      }
      return
    }

    // Wagmi browser wallet path
    if (!connector || !isConnected) return
    try {
      if (chainId !== fromChain.chainId) {
        try {
          await switchChainAsync({ chainId: fromChain.chainId })
        } catch {
          setErrMsg(`Please switch your wallet to ${fromChain.label} and try again.`)
          setStatus('error')
          return
        }
      }
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter  = await createViemAdapterFromProvider({ provider })

      // Live step events — update progress strip in real time
      appKit.on('bridge.approve',          () => { updateStep('approve',          { status: 'active' }) })
      appKit.on('bridge.burn',             () => { updateStep('approve', { status: 'done' }); updateStep('burn', { status: 'active' }) })
      appKit.on('bridge.fetchAttestation', () => { updateStep('burn', { status: 'done' }); updateStep('fetchAttestation', { status: 'active' }) })
      appKit.on('bridge.mint',             () => { updateStep('fetchAttestation', { status: 'done' }); updateStep('mint', { status: 'active' }) })

      updateStep('approve', { status: 'active' })

      const bridgeParams = {
        from: { adapter, chain: fromChain.kitName as AppKitChain },
        to:   { adapter, chain: toChain.kitName as AppKitChain },
        amount,
        config: { ...bridgeCustomFee(parseFloat(amount)) },
      }
      const result = await appKit.bridge(bridgeParams) as BridgeResult


      for (const step of result.steps ?? []) {
        const name      = step.name as StepName
        const errDetail = step.error ?? step.message ?? step.reason
        updateStep(name, {
          status:      step.state === 'success' ? 'done' : step.state === 'error' ? 'error' : 'idle',
          txHash:      step.txHash,
          explorerUrl: step.explorerUrl,
        })
        if (step.state === 'error' && errDetail) setErrMsg(String(errDetail).slice(0, 200))
      }

      const topState     = result.state
      const allStepsDone = (result.steps ?? []).filter(s => s.name !== 'mint').every(s => s.state === 'success')
      if (topState === 'success' || allStepsDone) {
        setStatus('done')
        const mintHash = result.steps?.find(s => s.name === 'mint')?.txHash
        addActivity({ type:'bridge', description:`Bridge to ${toChain.label}`, amount:gross, sign:'-', status:'confirmed', counterparty:toChain.label, txHash:mintHash })
      } else if (topState === 'pending') {
        setStatus('done')
        addActivity({ type:'bridge', description:`Bridge to ${toChain.label}`, amount:gross, sign:'-', status:'confirmed', counterparty:toChain.label })
      } else {
        const failedStep = result.steps?.find(s => s.state === 'error')
        const stepErr    = failedStep ? (failedStep.error ?? failedStep.message ?? failedStep.name + ' step failed') : 'Bridge returned non-success state.'
        setStatus('error')
        setErrMsg(String(stepErr).slice(0, 200))
      }
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
    }
  }

  const reset    = () => { setStatus('idle'); setSteps(INITIAL_STEPS); setAmount('') }
  const canBridge = !!amount && parseFloat(amount) > 0 && status !== 'bridging'

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected && !isCircleUser && !isPasskeyUser) return (
    <div style={{ padding: '48px 20px', textAlign: 'center' as const, fontFamily: F }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: c.surf2, border: `1px solid ${c.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <ArrowDownUp size={22} color={c.t2} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c.text, marginBottom: 6, letterSpacing: '-0.02em' }}>Connect your wallet</div>
      <div style={{ fontSize: 12, color: c.t2, marginBottom: 24, lineHeight: 1.65, maxWidth: 280, margin: '0 auto 24px' }}>
        Connect a browser wallet or log in with your NAN account to bridge USDC across chains via CCTP V2.
      </div>
      <ConnectKitButton />
    </div>
  )

  // ── Success screen ────────────────────────────────────────────────────────
  if (status === 'done') {
    const mintStep   = steps.find(s => s.name === 'mint')
    const burnStep   = steps.find(s => s.name === 'burn')
    const mintTxHash = mintStep?.txHash
    const burnTxHash = burnStep?.txHash
    return (
      <div style={{ padding: inCard ? '20px 16px 24px' : '0 16px 80px', fontFamily: F }}>
        <div style={{ textAlign: 'center' as const, padding: '20px 0 12px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(16,185,129,0.10)', border: '1.5px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <CheckCircle size={22} color={c.green} strokeWidth={1.6} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', marginBottom: 4 }}>Bridge submitted</div>
          <div style={{ fontSize: 12, color: c.t2, marginBottom: 16, lineHeight: 1.6 }}>
            USDC is being minted on <strong style={{ color: c.text }}>{toChain.label}</strong> via CCTP V2.
          </div>

          {/* Tx links */}
          {(burnTxHash || mintTxHash) && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 16 }}>
              {burnTxHash && (
                <a href={`${fromChain.explorer}${burnTxHash}`} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: c.blue, textDecoration: 'none', background: c.blueDim, border: `1px solid ${c.blueBd}`, borderRadius: 8, padding: '5px 12px', fontFamily: MONO }}>
                  Burn: {burnTxHash.slice(0, 12)}… <ExternalLink size={9} />
                </a>
              )}
              {mintTxHash && (
                <a href={`${toChain.explorer}${mintTxHash}`} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, color: c.green, textDecoration: 'none', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.20)', borderRadius: 8, padding: '5px 12px', fontFamily: MONO }}>
                  Mint: {mintTxHash.slice(0, 12)}… <ExternalLink size={9} />
                </a>
              )}
            </div>
          )}

          <button
            onClick={reset}
            style={{ width: '100%', height: 46, background: c.surf, border: `1px solid ${c.bdr2}`, borderRadius: 13, fontSize: 14, fontWeight: 700, color: c.text, cursor: 'pointer', fontFamily: F }}>
            Bridge again
          </button>
        </div>
      </div>
    )
  }

  // ── Main bridge UI ────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: F, padding: inCard ? '0 0 2px' : '0 16px 80px' }}>

      {/* Standalone header (not inside TradePage card) */}
      {!inCard && (
        <div style={{ padding: '14px 0 12px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: c.text, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Bridge USDC</div>
          <div style={{ fontSize: 11, color: c.t3, marginTop: 2 }}>Circle CCTP V2 · cross-chain in seconds</div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          NETWORK + AMOUNT CARD
          From / To selectors + amount input all in one surface
          so they read as a single cohesive form.
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        background: c.surf2, border: `1px solid ${c.bdr}`,
        borderRadius: 14,
        margin: inCard ? '10px 14px 0' : '0 0 10px',
        overflow: 'hidden',
      }}>
        {/* From / Swap arrow / To — one compact row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px 12px 10px' }}>
          <ChainSelect
            value={fromIdx}
            onChange={v => { setFromIdx(v); if (v === toIdx) setToIdx(v === 0 ? 1 : 0) }}
            label="From"
            c={c}
          />

          {/* Swap chains button */}
          <button
            onClick={() => { const f = fromIdx, t = toIdx; setFromIdx(t); setToIdx(f) }}
            aria-label="Swap source and destination chains"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: c.surf, border: `1px solid ${c.bdr2}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              marginBottom: 0, alignSelf: 'flex-end',
              transition: 'border-color 0.15s',
            }}>
            <ArrowDownUp size={14} color={c.blue} strokeWidth={2.5} />
          </button>

          <ChainSelect
            value={toIdx}
            onChange={v => { setToIdx(v); if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0) }}
            label="To"
            c={c}
          />
        </div>

        {/* UCW hint — shown when email user picks non-Arc source */}
        {isCircleUser && fromChain.chainId !== 5042 && (
          <div style={{ margin: '0 12px 8px', padding: '8px 10px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: 11, color: '#F59E0B', lineHeight: 1.5 }}>
            {UCW_CHAIN_ENUM[fromChain.chainId]
              ? `To bridge from ${fromChain.label}, NAN creates a ${fromChain.label} wallet for you (one PIN approval), then you send USDC to it and bridge. Gas on ${fromChain.label} is needed.`
              : `Email wallets can't bridge from ${fromChain.label} yet — connect MetaMask or a browser wallet instead.`}
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: c.bdr, margin: '0 12px' }} />

        {/* Amount input */}
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 7 }}>
            Amount (USDC)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              aria-label="USDC amount to bridge"
              onChange={e => setAmount(e.target.value)}
              disabled={status === 'bridging'}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                color: c.text, fontSize: 26, fontWeight: 800,
                fontFamily: MONO, outline: 'none',
                letterSpacing: '-0.02em', minWidth: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: c.t2, flexShrink: 0 }}>USDC</span>
          </div>
          {/* Quick-fill chips */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {['1', '5', '10', '25'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                aria-label={`Set amount to ${v} USDC`}
                style={{
                  flex: 1, padding: '7px 0',
                  border: `1px solid ${amount === v ? c.blue : c.bdr2}`,
                  borderRadius: 9,
                  background: amount === v ? c.blueDim : c.surf,
                  color: amount === v ? c.blue : c.t2,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: F, transition: 'all 0.12s',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          COMPACT FEE SUMMARY
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 12,
        margin: inCard ? '8px 14px 0' : '0 0 8px',
        padding: '9px 12px',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: c.t3, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
            Fee summary
          </span>
          <span style={{ fontSize: 10, color: c.t3 }}>CCTP V2 · ~8–20s</span>
        </div>

        {/* 2-col grid for the four fee rows */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
          {[
            { label: 'You send',                                          value: `${amount || '0.00'} USDC`,                                 highlight: false },
            { label: `CCTP fee${feeLoading ? ' …' : ''}`,                value: cctpProtocolFee > 0 ? `${cctpProtocolFee.toFixed(4)} USDC` : liveFee.label, highlight: false },
            { label: `Platform fee (${bpsToPercent(BRIDGE_FEE_BPS)}, added)`, value: platformFee > 0 ? `${platformFee.toFixed(4)} USDC` : '—',   highlight: false },
            { label: 'You receive (est.)',                                value: netReceived > 0 ? `${netReceived.toFixed(4)} USDC` : '0.00 USDC', highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: c.t3, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: highlight ? 800 : 600, color: highlight ? c.text : c.t2 }}>{value}</div>
            </div>
          ))}
        </div>

        {platformFee > 0 && (
          <div style={{ fontSize: 11, color: c.t2, marginTop: 7, paddingTop: 6, borderTop: `1px solid ${c.bdr}`, fontWeight: 600 }}>
            Total from your wallet: {totalFromWallet.toFixed(4)} USDC
          </div>
        )}
        {maxFeeUsdc > 0 && (
          <div style={{ fontSize: 10, color: c.t3, marginTop: 7, paddingTop: 6, borderTop: `1px solid ${c.bdr}` }}>
            maxFee: {maxFeeUsdc.toFixed(4)} USDC (protocol + 20% buffer)
          </div>
        )}
      </div>

      {/* ── Gas token notice ── */}
      {!fromChain.gasIsUsdc && !isCircleUser && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: c.surf2, border: `1px solid ${c.bdr}`, borderRadius: 11,
          padding: '9px 11px',
          margin: inCard ? '8px 14px 0' : '0 0 7px',
          fontSize: 11, color: c.t2, lineHeight: 1.55,
        }}>
          <Info size={12} color={c.t2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Bridging from <strong style={{ color: c.text }}>{fromChain.label}</strong> requires{' '}
            <strong style={{ color: c.text }}>{fromChain.gasToken}</strong> for gas, not USDC.
          </span>
        </div>
      )}

      {/* ── Paymaster notice ── */}
      {!fromChain.gasIsUsdc && !isCircleUser && fromChain.paymasterSupported && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: c.blueDim, border: `1px solid ${c.blueBd}`, borderRadius: 11,
          padding: '9px 11px',
          margin: inCard ? '6px 14px 0' : '0 0 7px',
          fontSize: 11, color: c.t2, lineHeight: 1.55,
        }}>
          <Info size={12} color={c.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: c.text }}>Circle Paymaster available</strong> — pay gas in USDC with an ERC-4337 wallet.{' '}
            <a href="https://developers.circle.com/paymaster" target="_blank" rel="noreferrer" style={{ color: c.blue, fontWeight: 600, textDecoration: 'none' }}>Learn more</a>
          </span>
        </div>
      )}

      {/* ── Step progress strip (active / post-submit only) ── */}
      {status === 'bridging' && (
        <div style={{ margin: inCard ? '8px 14px 0' : '0 0 8px' }}>
          <StepStrip steps={steps} fromExplorer={fromChain.explorer} toExplorer={toChain.explorer} c={c} />
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && errMsg && (
        errMsg === 'SESSION_EXPIRED' ? (
          <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 11, margin: inCard ? '8px 14px 0' : '0 0 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 3 }}>PIN required</div>
            <div style={{ fontSize: 11, color: c.t2, marginBottom: 8, lineHeight: 1.5 }}>Enter your amount again and confirm with your Circle PIN.</div>
            <button
              onClick={() => { setStatus('idle'); setErrMsg(''); setSteps(INITIAL_STEPS) }}
              style={{ padding: '6px 14px', background: c.blue, border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
              Try again
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', gap: 7, alignItems: 'flex-start',
            padding: '9px 11px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: 11,
            margin: inCard ? '8px 14px 0' : '0 0 8px',
            fontSize: 11, color: c.t2, lineHeight: 1.5,
          }}>
            <AlertCircle size={12} color={c.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ color: c.text }}>Bridge failed:</strong> {errMsg}</span>
          </div>
        )
      )}

      {/* ── Primary CTA ── */}
      <div style={{ margin: inCard ? '10px 14px 14px' : '10px 0 0' }}>
        <button
          onClick={() => void handleBridge()}
          disabled={!canBridge}
          aria-label={`Bridge ${amount || '0'} USDC from ${fromChain.label} to ${toChain.label}`}
          style={{
            width: '100%', height: 46,
            background: canBridge ? c.blue : c.surf2,
            border: `1px solid ${canBridge ? c.blue : c.bdr}`,
            borderRadius: 13,
            fontSize: 14, fontWeight: 800,
            color: canBridge ? '#fff' : c.t3,
            cursor: canBridge ? 'pointer' : 'not-allowed',
            fontFamily: F,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
            boxShadow: canBridge ? '0 4px 20px rgba(8,102,245,0.28)' : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {status === 'bridging'
            ? <><span className="nan-spinner" />Bridging…</>
            : `Bridge ${amount || '0.00'} USDC`}
        </button>
      </div>

      {/* Recovery tool */}
      <div style={{ margin: inCard ? '10px 14px 0' : '10px 0 0' }}>
        <RecoverBridge c={c} />
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: c.t3, textAlign: 'center' as const, padding: inCard ? '0 14px 10px' : '6px 0 0' }}>
        Powered by Circle CCTP V2 · Transactions are irreversible
      </div>
    </div>
  )
}
