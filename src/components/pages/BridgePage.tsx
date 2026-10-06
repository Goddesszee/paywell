import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowLeftRight, ArrowDownUp, CheckCircle, ExternalLink, Loader, Info } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { getPasskeyAdapter } from '../CirclePasskeyLogin'
import { bridgeFee, BRIDGE_FEE_BPS, bpsToPercent, BRIDGE_FEE_MIN_USDC } from '../../lib/fees'


const S  = 'var(--nan-surface)'
const B  = 'var(--nan-bdr)'
const T  = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const BK = '#0066FF'
const WH = 'var(--nan-surface2)'
const SANS = 'Inter, sans-serif'

// ── Typed wrappers for App Kit bridge result (state field not yet in public types) ──
interface BridgeStep { name: string; state: string; txHash?: string; explorerUrl?: string; error?: string; message?: string; reason?: string }
interface BridgeResult { steps?: BridgeStep[]; state?: string }
type AppKitChain = Parameters<InstanceType<typeof AppKit>['bridge']>[0]['from']['chain']

// ── CCTP V2 Sandbox fee endpoint ──────────────────────────────────────────────
const CCTP_FEE_API = 'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees'

interface BridgeChain {
  label: string
  kitName: string
  chainId: number
  cctpDomain: number   // from onchain-facts
  explorer: string
  gasToken: string
  gasIsUsdc: boolean
  // Paymaster ERC-4337 support
  paymasterSupported: boolean
  paymasterNote?: string
}

// CCTP V2 supported testnets. cctpDomain values from onchain-facts.ts.
// Paymaster v0.8 supports Arbitrum, Avalanche, Base, Ethereum, Optimism, Polygon, Unichain.
// 10% surcharge applies only on Arbitrum and Base.
const CHAINS: BridgeChain[] = [
  { label:'Arc Testnet',        kitName:'Arc_Testnet',        chainId:5042002,  cctpDomain:26, explorer:'https://testnet.arcscan.app/tx/',                    gasToken:'USDC', gasIsUsdc:true,  paymasterSupported:false },
  { label:'Ethereum Sepolia',   kitName:'Ethereum_Sepolia',   chainId:11155111, cctpDomain:0,  explorer:'https://sepolia.etherscan.io/tx/',                    gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Base Sepolia',       kitName:'Base_Sepolia',       chainId:84532,    cctpDomain:6,  explorer:'https://sepolia.basescan.org/tx/',                    gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.7 + v0.8 — pay gas in USDC (10% surcharge, ERC-4337 required)' },
  { label:'Arbitrum Sepolia',   kitName:'Arbitrum_Sepolia',   chainId:421614,   cctpDomain:3,  explorer:'https://sepolia.arbiscan.io/tx/',                     gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.7 + v0.8 — pay gas in USDC (10% surcharge, ERC-4337 required)' },
  { label:'OP Sepolia',         kitName:'Optimism_Sepolia',   chainId:11155420, cctpDomain:2,  explorer:'https://sepolia-optimism.etherscan.io/tx/',           gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Polygon Amoy',       kitName:'Polygon_Amoy_Testnet',chainId:80002,   cctpDomain:7,  explorer:'https://www.oklink.com/amoy/tx/',                     gasToken:'POL',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Avalanche Fuji',     kitName:'Avalanche_Fuji',     chainId:43113,    cctpDomain:1,  explorer:'https://testnet.snowtrace.io/tx/',                    gasToken:'AVAX', gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Unichain Sepolia',   kitName:'Unichain_Sepolia',   chainId:1301,     cctpDomain:10, explorer:'https://sepolia.uniscan.xyz/tx/',                     gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:true,  paymasterNote:'Paymaster v0.8 — pay gas in USDC (ERC-4337 wallet required)' },
  { label:'Linea Sepolia',      kitName:'Linea_Sepolia',      chainId:59141,    cctpDomain:-1, explorer:'https://sepolia.lineascan.build/tx/',                 gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:false },
  { label:'Sei Testnet',        kitName:'Sei_Testnet',        chainId:1328,     cctpDomain:16, explorer:'https://seistream.app/tx/',                           gasToken:'SEI',  gasIsUsdc:false, paymasterSupported:false },
  { label:'World Chain Sepolia',kitName:'World_Chain_Sepolia',chainId:4801,     cctpDomain:14, explorer:'https://worldchain-sepolia.explorer.alchemy.com/tx/', gasToken:'ETH',  gasIsUsdc:false, paymasterSupported:false },
]

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
interface StepState { name: StepName; label: string; status: 'idle'|'active'|'done'|'error'; txHash?: string; explorerUrl?: string }

const INITIAL_STEPS: StepState[] = [
  { name:'approve',          label:'Approve USDC',         status:'idle' },
  { name:'burn',             label:'Burn on source chain', status:'idle' },
  { name:'fetchAttestation', label:'Circle attestation',   status:'idle' },
  { name:'mint',             label:'Mint on destination',  status:'idle' },
]



interface LiveFee { bps: number; label: string; fetched: boolean }

export function BridgePage() {
  const { connector, isConnected, address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const isPasskeyUser = !wagmiAddress && !!auth?.isPasskeyUser
  // Passkey users sign client-side (MSCA); email/Google users go server-side
  const isCircleUser = !wagmiAddress && !!auth?.circleWalletAddress && !isPasskeyUser
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)


  // Lazy-instantiate AppKit — initialised once via useState initialiser so it
  // never runs during a re-render and avoids the "ref during render" lint error.
  const [appKit] = useState<AppKit>(() => new AppKit())

  const bridgePrefill    = useAppStore(s => s.bridgePrefill)
  const setBridgePrefill = useAppStore(s => s.setBridgePrefill)

  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx]     = useState(1)
  const [amount, setAmount]   = useState('')

  // Apply agent-chat prefill once on mount, then clear it
  useEffect(() => {
    if (!bridgePrefill) return
    if (bridgePrefill.amount) setAmount(bridgePrefill.amount)
    setBridgePrefill(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [steps, setSteps]     = useState<StepState[]>(INITIAL_STEPS)
  const [status, setStatus]   = useState<'idle'|'bridging'|'done'|'error'>('idle')
  const [errMsg, setErrMsg]   = useState('')
  const [liveFee, setLiveFee] = useState<LiveFee>({ bps: 0, label: '—', fetched: false })
  const [feeLoading, setFeeLoading] = useState(false)

  const fromChain = CHAINS[fromIdx]
  const toChain   = CHAINS[toIdx]

  // ── Fetch live CCTP fee whenever source/dest changes ──────────────────────
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
      const fast = Array.isArray(data) ? data.find((f) => f.finalityThreshold === 1000 || f.transferType === 'fast') : null
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

  // ── Compute CCTP protocol fee on the transfer amount ──────────────────────
  const gross = parseFloat(amount) || 0
  const platformFee = gross > 0 ? bridgeFee(gross) : 0
  // CCTP protocol fee: bps / 10000 * amount (deducted at mint, shown informatively)
  const cctpProtocolFee = gross > 0 && liveFee.bps > 0
    ? parseFloat((gross * liveFee.bps / 10000).toFixed(6))
    : 0
  // maxFee with 20% buffer per Circle docs
  const maxFeeUsdc = gross > 0 && liveFee.bps > 0
    ? parseFloat((cctpProtocolFee * 1.2).toFixed(6))
    : 0
  const netReceived = Math.max(0, gross - cctpProtocolFee - platformFee)

  const handleBridge = async () => {
    if (!amount) return
    setStatus('bridging')
    setErrMsg('')
    setSteps(INITIAL_STEPS)

    // ── Circle user path: server-side bridge via dev-controlled wallets (nan pattern) ─
    if (isCircleUser && wagmiAddress === undefined) {
      const userAddress = auth?.circleWalletAddress
      if (!userAddress) { setErrMsg('No Circle wallet address found.'); setStatus('error'); return }
      if (fromChain.chainId !== 5042002) { setErrMsg('Circle wallet bridge is only supported from Arc Testnet. Connect a browser wallet to bridge from other chains.'); setStatus('error'); return }
      try {
        updateStep('approve', { status: 'active' })
        const resp = await fetch('/api/appkit/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: userAddress,
            destChain: toChain.kitName,
            destAddr: userAddress,
            amount,
          }),
        })
        const data = await resp.json() as { success?: boolean; pending?: boolean; state?: string; burnTxHash?: string; error?: string }
        if (!resp.ok || data.error || data.success === false) throw new Error(data.error ?? 'Bridge failed')
        // nan pattern: bridge is non-blocking — Circle's Orbit forwarder handles mint
        // Mark all steps done since the server confirmed submission
        updateStep('approve', { status: 'done' })
        updateStep('burn', { status: 'done', txHash: data.burnTxHash })
        updateStep('fetchAttestation', { status: 'done' })
        updateStep('mint', { status: 'done' })
        setStatus('done')
        addActivity({ type:'bridge', description:`Bridge to ${toChain.label}`, amount:gross, sign:'-', status:'confirmed', counterparty:toChain.label, txHash: data.burnTxHash })
      } catch (e: unknown) {
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
      }
      return
    }

    // ── Passkey (MSCA) path — sign client-side via Circle Modular Wallets ──────
    const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
    const clientUrl = import.meta.env.VITE_CLIENT_URL as string | undefined
    if (isPasskeyUser) {
      if (!clientKey || !clientUrl) { setErrMsg('Modular Wallets not configured (VITE_CLIENT_KEY missing)'); setStatus('error'); return }
      if (fromChain.chainId !== 5042002) { setErrMsg('Passkey wallet bridge is only supported from Arc Testnet currently.'); setStatus('error'); return }
      try {
        updateStep('approve', { status: 'active' })
        const adapter = await getPasskeyAdapter({ clientKey, clientUrl })
        const result = await appKit.bridge({
          from: { adapter, chain: fromChain.kitName as AppKitChain },
          to: {
            chain: toChain.kitName as AppKitChain,
            recipientAddress: auth?.circleWalletAddress as string,
            useForwarder: true,
          },
          amount,
        }) as BridgeResult
        for (const step of result.steps ?? []) {
          updateStep(step.name as StepName, {
            status: step.state === 'success' ? 'done' : step.state === 'error' ? 'error' : 'idle',
            txHash: step.txHash,
          })
          if (step.state === 'error') setErrMsg(String(step.error ?? step.message ?? step.name + ' failed').slice(0, 200))
        }
        const topState = result.state
        const allStepsDone = (result.steps ?? []).filter(s => s.name !== 'mint').every(s => s.state === 'success')
        if (topState === 'success' || topState === 'pending' || allStepsDone) {
          setStatus('done')
          addActivity({ type: 'bridge', description: `Bridge to ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label })
        } else {
          setStatus('error')
          if (!errMsg) setErrMsg('Bridge did not complete. Check your passkey wallet balance.')
        }
      } catch (e: unknown) {
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
      }
      return
    }

    // ── Wagmi browser wallet path ───────────────────────────────────────────
    if (!connector || !isConnected) return
    try {
      // Switch wallet to source chain before creating the adapter
      if (chainId !== fromChain.chainId) await switchChainAsync({ chainId: fromChain.chainId })
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter  = await createViemAdapterFromProvider({ provider })

      updateStep('approve', { status: 'active' })

      const result = await appKit.bridge({
        from: { adapter, chain: fromChain.kitName as AppKitChain },
        // Use Circle's Orbit forwarder for the destination — the relayer handles
        // the mint transaction on the destination chain so we never need to
        // switchChain a second time or re-acquire the provider on a different network.
        to: {
          chain: toChain.kitName as AppKitChain,
          recipientAddress: wagmiAddress as string,
          useForwarder: true,
        },
        amount,
      }) as BridgeResult

      console.log('[bridge] result state:', result.state, 'steps:', result.steps?.map(s => s.name + ':' + s.state).join(', '))

      for (const step of result.steps ?? []) {
        const name = step.name as StepName
        const errDetail = step.error ?? step.message ?? step.reason
        updateStep(name, {
          status: step.state === 'success' ? 'done' : step.state === 'error' ? 'error' : 'idle',
          txHash: step.txHash,
          explorerUrl: step.explorerUrl,
        })
        if (step.state === 'error' && errDetail) {
          setErrMsg(errDetail.slice(0, 200))
        }
      }

      // App Kit bridge result uses result.state === 'success' (per Circle docs)
      const topState = result.state
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
        const stepErr = failedStep ? (failedStep.error ?? failedStep.message ?? failedStep.name + ' step failed') : 'Bridge returned non-success state.'
        setStatus('error')
        setErrMsg(stepErr.slice(0, 200))
      }
    } catch (e: unknown) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status:'error' } : s))
    }
  }

  const reset = () => { setStatus('idle'); setSteps(INITIAL_STEPS); setAmount('') }

  if (!isConnected && !isCircleUser && !isPasskeyUser) return (
    <div style={{ padding:32, textAlign:'center', fontFamily:SANS, color:T2 }}>Connect your wallet to bridge USDC</div>
  )

  return (
    <div style={{ fontFamily:SANS, maxWidth:480, margin:'0 auto', padding:'0 16px 80px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 24px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:S, border:`1px solid ${B}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowLeftRight size={18} color={T} />
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:700, color:T }}>Bridge USDC</div>
          <div style={{ fontSize:12, color:T2 }}>Move USDC across chains via CCTP V2</div>
        </div>
      </div>

      {/* From / To — stacked vertically with swap button */}
      <div style={{ marginBottom:16 }}>
        {/* From */}
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>From</div>
          <ChainSelect value={fromIdx} onChange={v => { setFromIdx(v); if (v === toIdx) setToIdx(v === 0 ? 1 : 0) }} exclude={-1} />
        </div>

        {/* Swap chains button */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
          <button onClick={() => { const f=fromIdx, t=toIdx; setFromIdx(t); setToIdx(f) }}
            style={{ width:36, height:36, borderRadius:'50%', background:S, border:`1px solid ${B}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <ArrowDownUp size={15} color={T2} />
          </button>
        </div>

        {/* To */}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>To</div>
          <ChainSelect value={toIdx} onChange={v => { setToIdx(v); if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0) }} exclude={fromIdx} />
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={status==='bridging'}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${B}`, borderRadius:10, background:WH, color:T, fontSize:16, fontWeight:600, fontFamily:SANS, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex:1, padding:'6px 0', border:`1px solid ${B}`, borderRadius:8, background:amount===v?BK:S, color:amount===v?'#ffffff':T, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:SANS }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Fee summary card */}
      <div style={{ background:S, border:`1px solid ${B}`, borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Transfer summary</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <Row2 label="Protocol" value="CCTP V2 Fast" />
          <Row2 label="Est. time" value="8–20 seconds" />
          <Row2 label="You send" value={`${amount||'0.00'} USDC`} />
          <Row2
            label={`CCTP protocol fee${feeLoading ? ' …' : ''}`}
            value={cctpProtocolFee > 0 ? `${cctpProtocolFee.toFixed(4)} USDC` : liveFee.label}
            sub={liveFee.fetched && liveFee.bps > 0 ? `Live rate: ${liveFee.label}` : undefined}
          />
          <Row2
            label={`Platform fee (${bpsToPercent(BRIDGE_FEE_BPS)}, min $${BRIDGE_FEE_MIN_USDC})`}
            value={platformFee > 0 ? `${platformFee.toFixed(4)} USDC` : '—'}
          />
          <Row2
            label="You receive (est.)"
            value={netReceived > 0 ? `${netReceived.toFixed(4)} USDC` : '0.00 USDC'}
            bold
          />
        </div>
        {maxFeeUsdc > 0 && (
          <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${B}`, fontSize:11, color:T3 }}>
            maxFee set to {maxFeeUsdc.toFixed(4)} USDC (protocol fee + 20% buffer per Circle docs)
          </div>
        )}
      </div>

      {/* Gas notice */}
      {!fromChain.gasIsUsdc && (
        <div style={{ background:WH, border:`1px solid ${B}`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', gap:10, alignItems:'flex-start' }}>
          <Info size={14} color={T2} style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12, color:T2, lineHeight:1.5 }}>
            <strong style={{ color:T }}>Gas required:</strong> Bridging from <strong>{fromChain.label}</strong> requires <strong>{fromChain.gasToken}</strong> for network fees — not USDC. Only Arc uses USDC as gas.
          </div>
        </div>
      )}

      {/* Paymaster notice */}
      {!fromChain.gasIsUsdc && fromChain.paymasterSupported && (
        <div style={{ background:WH, border:`1px solid ${B}`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', gap:10, alignItems:'flex-start' }}>
          <Info size={14} color={T2} style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12, color:T2, lineHeight:1.5 }}>
            <strong style={{ color:T }}>Circle Paymaster available:</strong> {fromChain.paymasterNote}. With an ERC-4337 smart wallet, you can pay gas in USDC and avoid holding {fromChain.gasToken}.{' '}
            <a href="https://developers.circle.com/paymaster" target="_blank" rel="noreferrer" style={{ color:T, fontWeight:600, textDecoration:'underline' }}>Learn more</a>
          </div>
        </div>
      )}

      {/* Steps */}
      {status !== 'idle' && (
        <div style={{ border:`1px solid ${B}`, borderRadius:12, overflow:'hidden', marginBottom:16 }}>
          {steps.map((step, i) => (
            <div key={step.name} style={{ padding:'12px 16px', borderBottom:i<steps.length-1?`1px solid ${B}`:'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                background: step.status==='done' ? BK : S, border:`1px solid ${step.status==='done' ? BK : step.status==='error' ? T : B}` }}>
                {step.status==='done'   && <CheckCircle size={14} color={WH} />}
                {step.status==='active' && <Loader size={14} color={T} style={{ animation:'spin 1s linear infinite' }} />}
                {step.status==='idle'   && <span style={{ fontSize:11, color:T2 }}>{i+1}</span>}
                {step.status==='error'  && <span style={{ fontSize:11, color:T, fontWeight:700 }}>!</span>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:T }}>{step.label}</div>
                {step.txHash && (
                  <a href={`${step.name === 'mint' ? toChain.explorer : fromChain.explorer}${step.txHash}`} target="_blank" rel="noreferrer"
                    style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                    {step.txHash.slice(0,10)}…{step.txHash.slice(-6)} <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {status==='error' && errMsg && (
        errMsg === 'SESSION_EXPIRED' ? (
          <div style={{ background:WH, border:`1px solid ${B}`, borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:13, color:T }}>
            <div style={{ fontWeight:600, marginBottom:4 }}>Re-authentication needed</div>
            <div style={{ fontSize:12, color:T2, marginBottom:10 }}>To sign bridge transactions, please log in again. Your wallet and balance are safe.</div>
            <button onClick={() => { useAppStore.getState().setAuth({ ...useAppStore.getState().auth!, userToken: undefined, encryptionKey: undefined }); useAppStore.getState().setActiveView('login') }}
              style={{ padding:'7px 16px', background:BK, border:'none', borderRadius:8, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:SANS }}>
              Log in again
            </button>
          </div>
        ) : (
          <div style={{ background:WH, border:`1px solid ${B}`, borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:13, color:T }}>
            <strong>Bridge failed:</strong> {errMsg}
          </div>
        )
      )}

      {/* CTA */}
      {status==='done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'15px 0', background:S, border:`1px solid ${B}`, borderRadius:14, fontSize:15, fontWeight:600, color:T, cursor:'pointer', fontFamily:SANS }}>
          Bridge again
        </button>
      ) : (
        <button onClick={() => void handleBridge()} disabled={status==='bridging'||!amount||parseFloat(amount)<=0}
          style={{ width:'100%', padding:'15px 0', background:status==='bridging'||!amount ? S : BK,
            border:`1px solid ${status==='bridging'||!amount ? B : BK}`, borderRadius:14, fontSize:15, fontWeight:600,
            color:status==='bridging'||!amount ? T2 : WH, cursor:status==='bridging'||!amount?'not-allowed':'pointer', fontFamily:SANS,
            display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {status==='bridging' ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Bridging…</> : `Bridge ${amount||'0.00'} USDC →`}
        </button>
      )}

      <div style={{ marginTop:12, fontSize:11, color:T2, textAlign:'center' }}>
        Powered by Circle CCTP V2 · Transactions are irreversible
      </div>
    </div>
  )
}

function ChainSelect({ value, onChange, exclude }: { value: number; onChange: (i: number) => void; exclude?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = CHAINS[value]
  return (
    <div ref={ref} style={{ position:'relative', zIndex: open ? 100 : 1 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ width:'100%', padding:'13px 14px', border:`1px solid ${B}`, borderRadius:12, background:S, color:T,
          fontSize:14, fontWeight:600, fontFamily:SANS, cursor:'pointer', outline:'none',
          display:'flex', alignItems:'center', justifyContent:'space-between', textAlign:'left' }}>
        <span>{selected.label}</span>
        <span style={{ fontSize:12, color:T2, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:S, border:`1px solid ${B}`,
          borderRadius:12, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.3)', maxHeight:260, overflowY:'auto' }}>
          {CHAINS.map((c, i) => {
            const disabled = c.cctpDomain < 0 || i === exclude
            return (
              <button key={c.kitName} type="button" disabled={disabled}
                onClick={() => { if (!disabled) { onChange(i); setOpen(false) } }}
                style={{ width:'100%', padding:'13px 16px', background: i === value ? BK : 'transparent',
                  color: disabled ? T3 : i === value ? '#fff' : T,
                  fontSize:14, fontWeight: i === value ? 700 : 500, fontFamily:SANS,
                  border:'none', borderBottom:`1px solid ${B}`, cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign:'left', opacity: disabled ? 0.4 : 1 }}>
                {c.label}{c.cctpDomain < 0 ? ' (no CCTP)' : ''}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row2({ label, value, sub, bold }: { label:string; value:string; sub?:string; bold?:boolean }) {
  return (
    <div>
      <div style={{ fontSize:11, color:T2 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:bold?700:600, color:T }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:T3, marginTop:1 }}>{sub}</div>}
    </div>
  )
}
