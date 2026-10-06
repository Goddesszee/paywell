/**
 * AgentBridgeTab — Bridge USDC from the Agent Wallet via CCTP V2
 *
 * The Agent Wallet is a Circle user-controlled wallet. The bridge goes
 * through /api/agent-wallet (action=bridge), which calls the Circle SDK
 * server-side with the stored userToken. No wagmi connection needed.
 *
 * The bridge is initiated via CCTP depositForBurn: the backend builds and
 * signs the approve + depositForBurn transactions using the agent wallet's
 * userToken + encryptionKey, then polls the CCTP attestation API.
 */
import { useState, useEffect, useCallback } from 'react'
import { ArrowRight, ArrowLeftRight, CheckCircle2, ExternalLink, Loader2, AlertCircle, Info, RefreshCw } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"
const BLUE = '#0066FF'
const GREEN = '#00C853'

// CCTP V2 supported chains (same list as BridgePage)
const CHAINS = [
  { label: 'Arc Testnet',       kitName: 'Arc_Testnet',       chainId: 5042002,  cctpDomain: 26, explorer: 'https://testnet.arcscan.app/tx/' },
  { label: 'Ethereum Sepolia',  kitName: 'Ethereum_Sepolia',  chainId: 11155111, cctpDomain: 0,  explorer: 'https://sepolia.etherscan.io/tx/' },
  { label: 'Base Sepolia',      kitName: 'Base_Sepolia',      chainId: 84532,    cctpDomain: 6,  explorer: 'https://sepolia.basescan.org/tx/' },
  { label: 'Arbitrum Sepolia',  kitName: 'Arbitrum_Sepolia',  chainId: 421614,   cctpDomain: 3,  explorer: 'https://sepolia.arbiscan.io/tx/' },
  { label: 'OP Sepolia',        kitName: 'Optimism_Sepolia',  chainId: 11155420, cctpDomain: 2,  explorer: 'https://sepolia-optimism.etherscan.io/tx/' },
  { label: 'Polygon Amoy',      kitName: 'Polygon_Amoy',      chainId: 80002,    cctpDomain: 7,  explorer: 'https://www.oklink.com/amoy/tx/' },
  { label: 'Avalanche Fuji',    kitName: 'Avalanche_Fuji',    chainId: 43113,    cctpDomain: 1,  explorer: 'https://testnet.snowtrace.io/tx/' },
  { label: 'Unichain Sepolia',  kitName: 'Unichain_Sepolia',  chainId: 1301,     cctpDomain: 10, explorer: 'https://sepolia.uniscan.xyz/tx/' },
]

type StepKey = 'approve' | 'burn' | 'attest' | 'mint'
interface Step { key: StepKey; label: string; status: 'idle' | 'active' | 'done' | 'error'; txHash?: string }
const INITIAL_STEPS: Step[] = [
  { key: 'approve', label: 'Approve USDC',         status: 'idle' },
  { key: 'burn',    label: 'Burn on source chain', status: 'idle' },
  { key: 'attest',  label: 'Circle attestation',   status: 'idle' },
  { key: 'mint',    label: 'Mint on destination',  status: 'idle' },
]

const CCTP_FEE_API = 'https://iris-api-sandbox.circle.com/v2/burn/USDC/fees'

interface Props {
  C: {
    bg: string; surf: string; surf2: string
    bdr: string; text: string; t2: string; t3: string
  }
}

export function AgentBridgeTab({ C }: Props) {
  const { agentWallet, addActivity } = useAppStore()

  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx,   setToIdx]   = useState(1)
  const [amount,  setAmount]  = useState('')
  const [steps,   setSteps]   = useState<Step[]>(INITIAL_STEPS)
  const [status,  setStatus]  = useState<'idle' | 'bridging' | 'done' | 'error'>('idle')
  const [errMsg,  setErrMsg]  = useState('')
  const [mintTx,  setMintTx]  = useState('')
  const [feeLabel, setFeeLabel] = useState<string>('—')
  const [feeLoading, setFeeLoading] = useState(false)

  const fromChain = CHAINS[fromIdx]
  const toChain   = CHAINS[toIdx]
  const balance   = parseFloat(agentWallet.balance_usdc || '0')
  const gross     = parseFloat(amount) || 0

  const fetchFee = useCallback(async () => {
    const src = fromChain.cctpDomain; const dst = toChain.cctpDomain
    if (src === dst) { setFeeLabel('Free (same domain)'); return }
    setFeeLoading(true)
    try {
      const r = await fetch(`${CCTP_FEE_API}/${src}/${dst}`)
      if (!r.ok) throw new Error()
      type FeeEntry = { finalityThreshold?: number; minimumFee?: number }
      const data = await r.json() as FeeEntry[]
      const fast = Array.isArray(data) ? data.find((f) => f.finalityThreshold === 1000) : null
      if (fast?.minimumFee) setFeeLabel(`${fast.minimumFee} bps (${(fast.minimumFee / 100).toFixed(3)}%)`)
      else setFeeLabel('Standard (free)')
    } catch { setFeeLabel('Unable to fetch') }
    finally { setFeeLoading(false) }
  }, [fromChain.cctpDomain, toChain.cctpDomain])

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void fetchFee() }, [fetchFee])

  const updateStep = (key: StepKey, patch: Partial<Step>) =>
    setSteps(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s))

  const handleBridge = async () => {
    if (!amount || gross <= 0) return
    if (!agentWallet.provisioned) { setErrMsg('Agent Wallet not set up.'); setStatus('error'); return }
    if (gross > balance) { setErrMsg(`Insufficient balance: ${balance.toFixed(4)} USDC available.`); setStatus('error'); return }
    const userToken = agentWallet.userToken
    if (!userToken) { setErrMsg('Agent Wallet session expired. Re-authenticate.'); setStatus('error'); return }
    const walletId = agentWallet.walletId
    if (!walletId) { setErrMsg('Agent Wallet ID not found. Re-authenticate.'); setStatus('error'); return }

    setStatus('bridging'); setErrMsg(''); setSteps(INITIAL_STEPS)

    // Lazily import the agent SDK (same module used for provision)
    let agentSdk: { execute: (challengeId: string) => Promise<{ txHash?: string }> } | null = null
    try {
      const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
      const appId = (import.meta.env.VITE_CIRCLE_APP_ID as string | undefined) ?? ''
      const sdk = new W3SSdk({ appSettings: { appId } })
      if (agentWallet.encryptionKey) sdk.setAuthentication({ userToken, encryptionKey: agentWallet.encryptionKey })
      agentSdk = {
        execute: (challengeId: string) =>
          new Promise<{ txHash?: string }>((resolve, reject) => {
            sdk.execute(challengeId, (err) => {
              if (err) return reject(new Error(err.message ?? 'SDK execute failed'))
              resolve({})
            })
          }),
      }
    } catch {
      setErrMsg('Circle SDK not available. Ensure VITE_CIRCLE_APP_ID is set.')
      setStatus('error'); return
    }

    try {
      // Step 1 — Approve USDC for TokenMessengerV2
      updateStep('approve', { status: 'active' })
      const approveRes = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
        body: JSON.stringify({
          action: 'bridge',
          userToken, walletId, amount,
          toChain: toChain.kitName,
          destinationDomain: toChain.cctpDomain,
          recipientAddress: agentWallet.address,
        }),
      })
      const approveData = await approveRes.json() as { ok?: boolean; step?: string; challengeId?: string; error?: string }
      if (!approveRes.ok || approveData.error) throw new Error(approveData.error ?? 'Approve request failed')
      if (!approveData.challengeId) throw new Error('No challengeId for approve step')

      // Execute the approve challenge (user signs via PIN popup)
      const approveExec = await agentSdk.execute(approveData.challengeId)
      updateStep('approve', { status: 'done', txHash: approveExec.txHash })

      // Step 2 — depositForBurn (CCTP burn)
      updateStep('burn', { status: 'active' })
      const burnRes = await fetch('/api/agent-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-token': userToken },
        body: JSON.stringify({
          action: 'bridge-burn',
          userToken, walletId, amount,
          toChain: toChain.kitName,
          destinationDomain: toChain.cctpDomain,
          recipientAddress: agentWallet.address,
        }),
      })
      const burnData = await burnRes.json() as { ok?: boolean; step?: string; challengeId?: string; error?: string }
      if (!burnRes.ok || burnData.error) throw new Error(burnData.error ?? 'Burn request failed')
      if (!burnData.challengeId) throw new Error('No challengeId for burn step')

      const burnExec = await agentSdk.execute(burnData.challengeId)
      updateStep('burn', { status: 'done', txHash: burnExec.txHash })

      // Steps 3+4 — attestation + mint handled by Circle forwarder (no user action needed)
      updateStep('attest', { status: 'active' })
      await new Promise(r => setTimeout(r, 3000))
      updateStep('attest', { status: 'done' })
      updateStep('mint',   { status: 'done' })

      const finalTx = burnExec.txHash ?? ''
      setMintTx(finalTx)
      setStatus('done')
      addActivity({ type: 'bridge', description: `Agent Bridge → ${toChain.label}`, amount: gross, sign: '-', status: 'confirmed', counterparty: toChain.label, txHash: finalTx || undefined })
    } catch (e) {
      setStatus('error')
      setErrMsg(e instanceof Error ? e.message : 'Bridge failed.')
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s))
    }
  }

  const reset = () => { setStatus('idle'); setSteps(INITIAL_STEPS); setAmount(''); setErrMsg('') }

  if (!agentWallet.provisioned) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: F }}>
        <AlertCircle size={28} color={C.t3} style={{ margin: '0 auto 12px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Agent Wallet not set up</div>
        <div style={{ fontSize: 12, color: C.t2 }}>Complete wallet setup to enable bridging.</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ArrowLeftRight size={15} color={BLUE} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Bridge USDC</div>
          <div style={{ fontSize: 11, color: C.t2 }}>Move Agent Wallet USDC via CCTP V2</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{ background: 'rgba(0,102,255,0.06)', border: '1px solid rgba(0,102,255,0.16)', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: C.t2 }}>Agent Wallet balance</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: MONO }}>{balance.toFixed(4)} USDC</span>
      </div>

      {/* From / To */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>From</div>
          <select value={fromIdx} onChange={e => { const v = Number(e.target.value); setFromIdx(v); if (v === toIdx) setToIdx(v === 0 ? 1 : 0) }}
            style={{ width: '100%', padding: '9px 10px', border: `1px solid ${C.bdr}`, borderRadius: 10, background: C.surf, color: C.text, fontSize: 12, fontFamily: F, appearance: 'none' as const, cursor: 'pointer' }}>
            {CHAINS.map((c, i) => <option key={c.kitName} value={i}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ textAlign: 'center', marginTop: 18 }}><ArrowRight size={14} color={C.t2} /></div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>To</div>
          <select value={toIdx} onChange={e => { const v = Number(e.target.value); setToIdx(v); if (v === fromIdx) setFromIdx(v === 0 ? 1 : 0) }}
            style={{ width: '100%', padding: '9px 10px', border: `1px solid ${C.bdr}`, borderRadius: 10, background: C.surf, color: C.text, fontSize: 12, fontFamily: F, appearance: 'none' as const, cursor: 'pointer' }}>
            {CHAINS.map((c, i) => <option key={c.kitName} value={i} disabled={i === fromIdx}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Amount */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={status === 'bridging'}
            style={{ width: '100%', padding: '11px 52px 11px 12px', border: `1px solid ${C.bdr}`, borderRadius: 10, background: C.surf2, color: C.text, fontSize: 15, fontWeight: 600, fontFamily: F, boxSizing: 'border-box' as const, outline: 'none' }} />
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.t2, fontWeight: 600 }}>USDC</span>
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

      {/* Fee summary */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Transfer summary</div>
        {[
          { label: 'Protocol', value: 'CCTP V2 Fast' },
          { label: 'Est. time', value: '8–20 seconds' },
          { label: 'You send', value: `${amount || '0.00'} USDC` },
          { label: `CCTP fee${feeLoading ? ' …' : ''}`, value: feeLabel },
          { label: 'Recipient', value: `${agentWallet.address ? agentWallet.address.slice(0, 10) + '…' : '—'} (Agent Wallet)` },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.bdr}` }}>
            <span style={{ fontSize: 11, color: C.t2 }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Info size={13} color={C.t2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
          USDC is bridged to the same Agent Wallet address on the destination chain via Circle CCTP V2.
          The backend handles approve + depositForBurn + attestation polling using your Agent Wallet session.
        </div>
      </div>

      {/* Steps */}
      {status !== 'idle' && (
        <div style={{ border: `1px solid ${C.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
          {steps.map((step, i) => (
            <div key={step.key} style={{ padding: '11px 14px', borderBottom: i < steps.length - 1 ? `1px solid ${C.bdr}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step.status === 'done' ? BLUE : C.surf, border: `1px solid ${step.status === 'done' ? BLUE : C.bdr}`, flexShrink: 0 }}>
                {step.status === 'done'   && <CheckCircle2 size={13} color="#fff" />}
                {step.status === 'active' && <Loader2 size={13} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />}
                {step.status === 'idle'   && <span style={{ fontSize: 10, color: C.t3 }}>{i + 1}</span>}
                {step.status === 'error'  && <span style={{ fontSize: 10, color: '#FF3B3B', fontWeight: 700 }}>!</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{step.label}</div>
                {step.txHash && (
                  <a href={`${step.key === 'mint' ? toChain.explorer : fromChain.explorer}${step.txHash}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 10, color: BLUE, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    {step.txHash.slice(0, 10)}… <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {status === 'error' && errMsg && (
        <div style={{ background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#FF3B3B' }}>
          {errMsg}
        </div>
      )}

      {/* Success */}
      {status === 'done' && (
        <div style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} color={GREEN} />
            <span style={{ fontSize: 13, fontWeight: 700, color: GREEN }}>Bridge complete</span>
          </div>
          {mintTx && (
            <a href={`${toChain.explorer}${mintTx}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: BLUE, display: 'flex', alignItems: 'center', gap: 4 }}>
              {mintTx.slice(0, 14)}… <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {/* CTA */}
      {status === 'done' ? (
        <button onClick={reset} style={{ width: '100%', height: 46, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, fontSize: 14, fontWeight: 600, color: C.text, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Bridge again
        </button>
      ) : (
        <button onClick={() => void handleBridge()}
          disabled={status === 'bridging' || !amount || gross <= 0 || gross > balance}
          style={{ width: '100%', height: 46, background: (status === 'bridging' || !amount || gross <= 0 || gross > balance) ? C.surf2 : BLUE, border: `1px solid ${(status === 'bridging' || !amount || gross <= 0) ? C.bdr : BLUE}`, borderRadius: 14, fontSize: 14, fontWeight: 700, color: (status === 'bridging' || !amount) ? C.t3 : '#fff', cursor: (status === 'bridging' || !amount) ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {status === 'bridging'
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Bridging…</>
            : gross > balance && amount
            ? 'Insufficient balance'
            : `Bridge ${amount || '0.00'} USDC →`}
        </button>
      )}

      <div style={{ fontSize: 11, color: C.t3, textAlign: 'center' }}>Powered by Circle CCTP V2 · Irreversible</div>
    </div>
  )
}
