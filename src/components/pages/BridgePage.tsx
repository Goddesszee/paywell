import React, { useState, useEffect, useCallback, useRef } from 'react'
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowLeftRight, ArrowDownUp, CheckCircle, ExternalLink, Loader, Info } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
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
    if (bridgePrefill.toChain) {
      const want = bridgePrefill.toChain.toLowerCase()
      const idx = CHAINS.findIndex(c => c.label.toLowerCase() === want)
      if (idx > 0) setToIdx(idx)
    }
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

    // ── Circle UCW user path (email / Google login) — PIN popup via W3SSdk ───
    if (isCircleUser && wagmiAddress === undefined) {
      const authState = useAppStore.getState().auth
      if (!authState?.userToken) { setErrMsg('Session expired — please log in again.'); setStatus('error'); return }
      if (fromChain.chainId !== 5042002) { setErrMsg('Circle wallet bridge is only supported from Arc Testnet. Connect a browser wallet to bridge from other chains.'); setStatus('error'); return }

      // Resolve walletId + address — fetch fresh if not cached (handles older login sessions)
      let resolvedWalletId = authState.circleWalletId
      let resolvedAddress  = authState.circleWalletAddress
      if (!resolvedWalletId || !resolvedAddress) {
        try {
          const wr = await fetch('/api/wallet', { headers: { 'x-user-token': authState.userToken } })
          const wd = await wr.json() as { wallets?: { id: string; address: string }[] }
          const w  = wd.wallets?.[0]
          resolvedWalletId = w?.id
          resolvedAddress  = w?.address
          if (resolvedWalletId && resolvedAddress) {
            useAppStore.getState().setAuth({ ...authState, circleWalletId: resolvedWalletId, circleWalletAddress: resolvedAddress, walletAddress: resolvedAddress, walletId: resolvedWalletId })
          }
        } catch { /* ignore — will fail at bridge-start with a clearer error */ }
      }
      const userAddress = resolvedAddress
      const walletId    = resolvedWalletId
      if (!userAddress || !walletId) { setErrMsg('Could not load Circle wallet — please log out and log in again.'); setStatus('error'); return }

      try {
        updateStep('approve', { status: 'active' })

        // Step 1 — get bridge challengeId from server
        const startResp = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ucw-bridge-start',
            userToken: authState.userToken,
            walletAddress: userAddress,
            walletId,
            destChain: toChain.kitName,
            amount,
          }),
        })
        const startData = await startResp.json() as { challengeId?: string; error?: string }
        if (!startResp.ok || startData.error || !startData.challengeId) throw new Error(startData.error ?? 'Bridge start failed')

        updateStep('approve', { status: 'done' })
        updateStep('burn', { status: 'active' })

        // Step 2 — open Circle PIN popup
        const appId = (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? ''
        const sdk = new W3SSdk({ appSettings: { appId } })
        if (authState.encryptionKey) {
          sdk.setAuthentication({ userToken: authState.userToken, encryptionKey: authState.encryptionKey })
        } else {
          sdk.setAuthentication({ userToken: authState.userToken, encryptionKey: '' })
        }

        const txId = await new Promise<string>((resolve, reject) => {
          sdk.execute(startData.challengeId!, (err, result) => {
            if (err) { reject(new Error(err instanceof Error ? err.message : 'PIN approval failed')); return }
            const r = result as { data?: { transactionHash?: string; transactionId?: string } }
            resolve(r?.data?.transactionHash ?? r?.data?.transactionId ?? '')
          })
        })

        updateStep('burn', { status: 'done', txHash: txId })
        updateStep('fetchAttestation', { status: 'active' })

        // Step 3 — poll until confirmed
        if (txId) {
          const confirmResp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ucw-bridge-confirm', userToken: authState.userToken, transactionId: txId }),
          })
          const confirmData = await confirmResp.json() as { success?: boolean; txHash?: string; error?: string }
          if (!confirmResp.ok || confirmData.error) throw new Error(confirmData.error ?? 'Bridge confirm failed')
          updateStep('fetchAttestation', { status: 'done' })
          updateStep('mint', { status: 'done', txHash: confirmData.txHash })
        } else {
          updateStep('fetchAttestation', { status: 'done' })
          updateStep('mint', { status: 'done' })
        }

        setStatus('done')
        addActivity({ type: 'bridge', description: `Bridge to ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label, txHash: txId })
      } catch (e: unknown) {
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
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
        const adapter = await getPasskeyAdapter({ clientKey })
        const result = await appKit.bridge({
          from: { adapter, chain: fromChain.kitName as AppKitChain },
          to: {
            chain: toChain.kitName as AppKitChain,
            recipientAddress: auth?.circleWalletAddress as string,
            useForwarder: true,
          },
          amount,
        }) as BridgeResult
        console.log('[bridge/passkey] result:', JSON.stringify({ state: result.state, steps: result.steps?.map(s => ({ name: s.name, state: s.state, error: s.error, message: s.message })) }))
        for (const step of result.steps ?? []) {
          updateStep(step.name as StepName, {
            status: step.state === 'success' ? 'done' : step.state === 'error' ? 'error' : 'idle',
            txHash: step.txHash,
          })
          if (step.state === 'error') setErrMsg(String(step.error ?? step.message ?? step.name + ' failed').slice(0, 300))
        }
        const topState = result.state
        const allStepsDone = (result.steps ?? []).filter(s => s.name !== 'mint').every(s => s.state === 'success')
        if (topState === 'success' || topState === 'pending' || allStepsDone) {
          setStatus('done')
          addActivity({ type: 'bridge', description: `Bridge to ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label })
        } else {
          setStatus('error')
          // Surface the most specific error available
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

    // ── Wagmi browser wallet path ───────────────────────────────────────────
    if (!connector || !isConnected) return
    try {
      // Switch wallet to source chain before creating the adapter
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

      updateStep('approve', { status: 'active' })

      const result = await appKit.bridge({
        from: { adapter, chain: fromChain.kitName as AppKitChain },
        // Use Circle's Orbit forwarder: the relayer mints on the destination
        // chain so the user never needs to switch chains or sign a second tx.
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

  const canBridge = !!amount && parseFloat(amount) > 0 && status !== 'bridging'

  if (!isConnected && !isCircleUser && !isPasskeyUser) return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '64px 20px', textAlign: 'center', fontFamily: SANS }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: S, border: `1px solid ${B}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <ArrowLeftRight size={26} color={T2} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T, marginBottom: 8, letterSpacing: '-0.02em' }}>Connect your wallet</div>
      <div style={{ fontSize: 13, color: T2, marginBottom: 32, lineHeight: 1.65, maxWidth: 300, margin: '0 auto 32px' }}>
        Connect a browser wallet or log in with your NAN account to bridge USDC across chains via CCTP V2.
      </div>
      <ConnectKitButton />
    </div>
  )

  return (
    <div style={{ fontFamily: SANS, maxWidth: 480, margin: '0 auto', padding: '0 16px 100px' }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 0 18px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Bridge USDC</div>
        <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>Circle CCTP V2 · cross-chain in seconds</div>
      </div>

      {/* ── From / To ── */}
      <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 20, overflow: 'visible', marginBottom: 14 }}>
        {/* From */}
        <div style={{ padding: '16px 18px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>From</div>
          <ChainSelect value={fromIdx} onChange={v => { setFromIdx(v); if (v === toIdx) setToIdx(v === 0 ? 1 : 0) }} exclude={-1} />
        </div>

        {/* Swap direction */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '-2px 0', position: 'relative', zIndex: 2 }}>
          <button onClick={() => { const f = fromIdx, t = toIdx; setFromIdx(t); setToIdx(f) }}
            style={{ width: 40, height: 40, borderRadius: 13, background: WH, border: `1px solid ${B}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
            <ArrowDownUp size={16} color={BK} strokeWidth={2.5} />
          </button>
        </div>

        {/* To */}
        <div style={{ padding: '14px 18px 16px', borderTop: `1px solid ${B}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>To</div>
          <ChainSelect value={toIdx} onChange={v => { setToIdx(v); if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0) }} exclude={fromIdx} />
        </div>
      </div>

      {/* ── Amount ── */}
      <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 20, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>Amount</div>
        <div style={{ position: 'relative' as const }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={status === 'bridging'}
            style={{ width: '100%', padding: '10px 64px 10px 0', border: 'none', background: 'transparent', color: T, fontSize: 36, fontWeight: 800, fontFamily: 'var(--nan-mono, monospace)', boxSizing: 'border-box' as const, outline: 'none', letterSpacing: '-0.02em' }} />
          <span style={{ position: 'absolute' as const, right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: T2 }}>USDC</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {['1', '5', '10', '25'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              style={{ flex: 1, padding: '9px 0', border: `1px solid ${amount === v ? BK : B}`, borderRadius: 10, background: amount === v ? 'rgba(0,102,255,0.10)' : WH, color: amount === v ? BK : T, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, transition: 'all 0.12s', WebkitTapHighlightColor: 'transparent' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Transfer summary ── */}
      <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 16, padding: '4px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Transfer Summary</span>
          <span style={{ fontSize: 11, color: T3 }}>CCTP V2 · 8–20s</span>
        </div>
        {[
          { label: 'You send', value: `${amount || '0.00'} USDC`, bold: false },
          { label: `CCTP fee${feeLoading ? ' …' : ''}`, value: cctpProtocolFee > 0 ? `${cctpProtocolFee.toFixed(4)} USDC` : liveFee.label, bold: false },
          { label: `Platform fee (${bpsToPercent(BRIDGE_FEE_BPS)})`, value: platformFee > 0 ? `${platformFee.toFixed(4)} USDC` : '—', bold: false },
          { label: 'You receive (est.)', value: netReceived > 0 ? `${netReceived.toFixed(4)} USDC` : '0.00 USDC', bold: true },
        ].map(({ label, value, bold }, i, arr) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${B}` : 'none' }}>
            <span style={{ fontSize: 12, color: T2 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: bold ? 800 : 700, color: bold ? T : T2 }}>{value}</span>
          </div>
        ))}
        {maxFeeUsdc > 0 && (
          <div style={{ padding: '8px 0', fontSize: 11, color: T3 }}>
            maxFee: {maxFeeUsdc.toFixed(4)} USDC (protocol + 20% buffer)
          </div>
        )}
      </div>

      {/* ── Gas notice ── */}
      {!fromChain.gasIsUsdc && (
        <div style={{ background: WH, border: `1px solid ${B}`, borderRadius: 14, padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info size={13} color={T2} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: T2, lineHeight: 1.55 }}>
            Bridging from <strong style={{ color: T }}>{fromChain.label}</strong> requires <strong style={{ color: T }}>{fromChain.gasToken}</strong> for gas — not USDC.
          </div>
        </div>
      )}

      {/* ── Paymaster notice ── */}
      {!fromChain.gasIsUsdc && fromChain.paymasterSupported && (
        <div style={{ background: WH, border: `1px solid ${B}`, borderRadius: 14, padding: '12px 16px', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Info size={13} color={BK} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: T2, lineHeight: 1.55 }}>
            <strong style={{ color: T }}>Circle Paymaster available</strong> — pay gas in USDC with an ERC-4337 wallet.{' '}
            <a href="https://developers.circle.com/paymaster" target="_blank" rel="noreferrer" style={{ color: BK, fontWeight: 600, textDecoration: 'none' }}>Learn more</a>
          </div>
        </div>
      )}

      {/* ── Steps ── */}
      {status !== 'idle' && (
        <div style={{ background: S, border: `1px solid ${B}`, borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
          {steps.map((step, i) => (
            <div key={step.name} style={{ padding: '13px 18px', borderBottom: i < steps.length - 1 ? `1px solid ${B}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.status === 'done' ? 'rgba(0,200,83,0.12)' : step.status === 'active' ? 'rgba(0,102,255,0.12)' : WH,
                border: `1.5px solid ${step.status === 'done' ? 'rgba(0,200,83,0.3)' : step.status === 'error' ? 'rgba(255,59,59,0.4)' : step.status === 'active' ? BK : B}` }}>
                {step.status === 'done'   && <CheckCircle size={14} color="#00C853" strokeWidth={2.5} />}
                {step.status === 'active' && <Loader size={14} color={BK} style={{ animation: 'spin 1s linear infinite' }} />}
                {step.status === 'idle'   && <span style={{ fontSize: 11, color: T2, fontWeight: 700 }}>{i + 1}</span>}
                {step.status === 'error'  && <span style={{ fontSize: 13, color: '#FF3B3B', fontWeight: 800 }}>!</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: step.status === 'active' ? 700 : 500, color: step.status === 'done' ? T2 : T }}>{step.label}</div>
                {step.txHash && (
                  <a href={`${step.name === 'mint' ? toChain.explorer : fromChain.explorer}${step.txHash}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: BK, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, textDecoration: 'none', fontFamily: 'var(--nan-mono, monospace)' }}>
                    {step.txHash.slice(0, 10)}…{step.txHash.slice(-6)} <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && errMsg && (
        errMsg === 'SESSION_EXPIRED' ? (
          <div style={{ padding: '14px 16px', background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.20)', borderRadius: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T, marginBottom: 4 }}>PIN required</div>
            <div style={{ fontSize: 12, color: T2, marginBottom: 10, lineHeight: 1.5 }}>Enter your amount again and confirm with your Circle PIN. Your wallet and balance are safe.</div>
            <button onClick={() => { setStatus('idle'); setErrMsg(''); setSteps(INITIAL_STEPS) }}
              style={{ padding: '8px 18px', background: BK, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
              Try again
            </button>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.20)', borderRadius: 14, marginBottom: 14, fontSize: 13, color: T2, lineHeight: 1.5 }}>
            <strong style={{ color: T }}>Bridge failed:</strong> {errMsg}
          </div>
        )
      )}

      {/* ── CTA ── */}
      {status === 'done' ? (
        <button onClick={reset}
          style={{ width: '100%', height: 54, background: S, border: `1px solid ${B}`, borderRadius: 16, fontSize: 15, fontWeight: 700, color: T, cursor: 'pointer', fontFamily: SANS }}>
          Bridge again
        </button>
      ) : (
        <button onClick={() => void handleBridge()} disabled={!canBridge}
          style={{ width: '100%', height: 54, background: canBridge ? BK : WH, border: `1px solid ${canBridge ? BK : B}`, borderRadius: 16, fontSize: 15, fontWeight: 800, color: canBridge ? '#fff' : T2, cursor: canBridge ? 'pointer' : 'not-allowed', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s', boxShadow: canBridge ? '0 6px 24px rgba(0,102,255,0.30)' : 'none', WebkitTapHighlightColor: 'transparent' }}>
          {status === 'bridging'
            ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Bridging…</>
            : `Bridge ${amount || '0.00'} USDC`}
        </button>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: T2, textAlign: 'center' }}>
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
    <div ref={ref} style={{ position: 'relative', zIndex: open ? 100 : 1 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '11px 14px', border: `1px solid ${B}`, borderRadius: 12, background: WH, color: T, fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
        <span>{selected.label}</span>
        <span style={{ fontSize: 11, color: T2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: S, border: `1px solid ${B}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.35)', maxHeight: 280, overflowY: 'auto', zIndex: 200 }}>
          {CHAINS.map((c, i) => {
            const disabled = c.cctpDomain < 0 || i === exclude
            const isSelected = i === value
            return (
              <button key={c.kitName} type="button" disabled={disabled}
                onClick={() => { if (!disabled) { onChange(i); setOpen(false) } }}
                style={{ width: '100%', padding: '12px 16px', background: isSelected ? 'rgba(0,102,255,0.10)' : 'transparent', color: disabled ? T3 : isSelected ? BK : T, fontSize: 13, fontWeight: isSelected ? 700 : 500, fontFamily: SANS, border: 'none', borderBottom: `1px solid ${B}`, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', WebkitTapHighlightColor: 'transparent' }}>
                <span>{c.label}{c.cctpDomain < 0 ? ' (no CCTP)' : ''}</span>
                {isSelected && <CheckCircle size={13} color={BK} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row2({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: T2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: T }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T3, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
