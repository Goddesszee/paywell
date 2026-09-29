import { useNanTheme } from '../../hooks/useNanTheme'
import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { ArrowUpDown, Loader, CheckCircle, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { swapFee, SWAP_FEE_BPS, bpsToPercent, FEE_WALLET } from '../../lib/fees'

const appKit = new AppKit()
const F = "'Inter',-apple-system,sans-serif"
const MONO = "'JetBrains Mono',Menlo,monospace"
const BG   = 'var(--nan-bg)'; const SURF = 'var(--nan-surface)'; const SURF2= 'var(--nan-surface2)'
const BDR  = 'var(--nan-bdr)'; const BDR2 = 'var(--nan-bdr2)'
const BLUE = '#0066FF'; const TEXT = 'var(--nan-text)'; const T2   = 'var(--nan-text2)'; const T3   = 'var(--nan-text3)'
const GREEN = '#00C853'; const RED = '#FF3B3B'

const TOKENS = ['USDC','EURC','USDT','PYUSD','WETH','WBTC'] as const
type Token = typeof TOKENS[number]
const CHAIN = 'Arc_Testnet'; const CHAIN_ID = 5042002
type Phase = 'idle'|'estimating'|'reviewed'|'swapping'|'done'|'error'
interface Estimate { estimatedOutput:{amount:string;token:string}; fees:Array<{type:string;amount:string;token:string}> }

function TokenBadge({ token, onChange, exclude }: { token: Token; onChange:(t:Token)=>void; exclude:Token }) {
  return (
    <select value={token} onChange={e => onChange(e.target.value as Token)} style={{ padding:'8px 12px', border:`1px solid ${BDR2}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:14, fontWeight:700, fontFamily:F, cursor:'pointer', outline:'none', appearance:'none', WebkitAppearance:'none', minWidth:88 }}>
      {TOKENS.filter(t => t !== exclude).map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

function Row({ label, value, mono, accent }: { label:string; value:string; mono?:boolean; accent?:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:`1px solid ${BDR}` }}>
      <span style={{ fontSize:12, color:T2, fontFamily:F }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color:accent?BLUE:TEXT, fontFamily:mono?MONO:F }}>{value}</span>
    </div>
  )
}

export function SwapPage() {
  const C = useNanTheme()
  const { connector, isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const addActivity = useAppStore(s => s.addActivity)
  const recordFee = useAppStore(s => s.recordFee)

  const [tokenIn, setTokenIn]   = useState<Token>('USDT')
  const [tokenOut, setTokenOut] = useState<Token>('USDC')
  const [amountIn, setAmountIn] = useState('')
  const [estimate, setEstimate] = useState<Estimate|null>(null)
  const [reviewedAddress, setReviewedAddress] = useState<string|undefined>()
  const [phase, setPhase]   = useState<Phase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [explorerUrl, setExplorerUrl] = useState('')

  const sameToken = tokenIn === tokenOut
  const canReview = isConnected && amountIn && parseFloat(amountIn) > 0 && !sameToken

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
      const adapter = await getAdapter()
      const est = await appKit.estimateSwap({ from:{adapter,chain:CHAIN}, tokenIn, tokenOut, amountIn, config:{slippageBps:100} })
      setEstimate(est as unknown as Estimate); setReviewedAddress(address); setPhase('reviewed')
    } catch(e:unknown) { setPhase('error'); setErrMsg(e instanceof Error?e.message:'Estimation failed.') }
  }

  const executeSwap = async () => {
    if (!estimate || address !== reviewedAddress) { setPhase('error'); setErrMsg('Wallet changed since estimate. Get a new quote.'); return }
    setPhase('swapping'); setErrMsg('')
    try {
      const adapter = await getAdapter()
      const result = await appKit.swap({ from:{adapter,chain:CHAIN}, tokenIn, tokenOut, amountIn, config:{slippageBps:100} })
      const resultHash = (result as {txHash?:string}).txHash
      setTxHash(resultHash ?? ''); setExplorerUrl((result as {explorerUrl?:string}).explorerUrl ?? '')
      setPhase('done')
      const gross = parseFloat(amountIn); const fee = swapFee(gross)
      addActivity({ type:'swap', description:`Swap ${tokenIn} → ${tokenOut}`, amount:gross, sign:'-', status:'confirmed', counterparty:tokenOut, txHash:resultHash })
      if (fee > 0) recordFee({ source:'swap', grossAmount:gross, feeAmount:fee, feeWallet:FEE_WALLET, txHash:resultHash, description:`Swap ${tokenIn} → ${tokenOut}` })
    } catch(e:unknown) { setPhase('error'); setErrMsg(e instanceof Error?e.message:'Swap failed.') }
  }

  const flipTokens = () => { setTokenIn(tokenOut); setTokenOut(tokenIn); setEstimate(null); setPhase('idle') }
  const reset = () => { setAmountIn(''); setEstimate(null); setPhase('idle'); setErrMsg(''); setTxHash('') }

  if (!isConnected) return (
    <div style={{ padding:'48px 24px', textAlign:'center', fontFamily:F }}>
      <div style={{ width:52,height:52,borderRadius:14,background:SURF,border:`1px solid ${BDR}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px' }}>
        <ArrowUpDown size={22} color={T3} />
      </div>
      <div style={{ fontSize:16,fontWeight:700,color:TEXT,marginBottom:6 }}>Connect wallet to swap</div>
      <div style={{ fontSize:13,color:T2 }}>Connect your wallet to exchange tokens.</div>
    </div>
  )

  if (phase === 'done') return (
    <div style={{ maxWidth:480,margin:'0 auto',fontFamily:F,padding:'0 0 80px' }}>
      <div style={{ textAlign:'center',padding:'48px 20px 32px' }}>
        <div style={{ width:64,height:64,borderRadius:'50%',background:'rgba(0,200,83,0.10)',border:'1px solid rgba(0,200,83,0.25)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px' }}>
          <CheckCircle size={28} color={GREEN} />
        </div>
        <div style={{ fontSize:22,fontWeight:700,color:TEXT,marginBottom:6,letterSpacing:'-0.025em' }}>Swap complete</div>
        <div style={{ fontSize:14,color:T2,marginBottom:28 }}>Your tokens have been exchanged.</div>
        {txHash && (
          <a href={explorerUrl||`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:BLUE,textDecoration:'none',background:'rgba(0,102,255,0.08)',border:'1px solid rgba(0,102,255,0.20)',borderRadius:8,padding:'8px 14px',marginBottom:28 }}>
            {txHash.slice(0,14)}… <ExternalLink size={13} />
          </a>
        )}
        <button onClick={reset} style={{ width:'100%',height:52,background:BLUE,color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:F }}>Swap again</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth:480,margin:'0 auto',fontFamily:F,padding:'0 0 80px' }}>

      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:12,padding:'20px 0 22px' }}>
        <div style={{ width:38,height:38,borderRadius:10,background:'rgba(0,102,255,0.10)',border:'1px solid rgba(0,102,255,0.20)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <ArrowUpDown size={18} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:18,fontWeight:700,color:TEXT,letterSpacing:'-0.02em' }}>Swap</div>
          <div style={{ fontSize:12,color:T3 }}>Exchange tokens · Routed by LiFi</div>
        </div>
      </div>

      {/* Swap card */}
      <div style={{ background:SURF,border:`1px solid ${BDR}`,borderRadius:16,overflow:'hidden',marginBottom:12 }}>

        {/* You pay */}
        <div style={{ padding:'18px 16px 14px' }}>
          <div style={{ fontSize:11,fontWeight:600,color:T3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10 }}>You pay</div>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={amountIn}
              onChange={e => { setAmountIn(e.target.value); setEstimate(null); setPhase('idle') }}
              disabled={phase==='swapping'}
              style={{ flex:1,fontSize:32,fontWeight:700,color:TEXT,border:'none',outline:'none',background:'transparent',fontFamily:F,minWidth:0 }} />
            <TokenBadge token={tokenIn} onChange={t=>{setTokenIn(t);setEstimate(null);setPhase('idle')}} exclude={tokenOut} />
          </div>
          {/* Quick amounts */}
          <div style={{ display:'flex',gap:6,marginTop:12 }}>
            {['1','5','10','25','50'].map(v => (
              <button key={v} onClick={() => { setAmountIn(v); setEstimate(null); setPhase('idle') }}
                style={{ flex:1,padding:'6px 0',border:`1px solid ${amountIn===v?BLUE:BDR}`,borderRadius:7,background:amountIn===v?'rgba(0,102,255,0.12)':SURF2,color:amountIn===v?BLUE:T2,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:F,transition:'all 0.12s' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Flip divider */}
        <div style={{ position:'relative',height:1,background:BDR,display:'flex',justifyContent:'center' }}>
          <button onClick={flipTokens} style={{ position:'absolute',top:-18,width:36,height:36,borderRadius:'50%',border:`1px solid ${BDR2}`,background:SURF2,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all 0.15s',zIndex:1 }}>
            <ArrowUpDown size={14} color={T2} />
          </button>
        </div>

        {/* You receive */}
        <div style={{ padding:'22px 16px 18px',background:SURF2 }}>
          <div style={{ fontSize:11,fontWeight:600,color:T3,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10 }}>You receive (est.)</div>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <div style={{ flex:1,fontSize:32,fontWeight:700,color:estimate?GREEN:T3,fontFamily:MONO }}>
              {estimate ? estimate.estimatedOutput.amount : '—'}
            </div>
            <TokenBadge token={tokenOut} onChange={t=>{setTokenOut(t);setEstimate(null);setPhase('idle')}} exclude={tokenIn} />
          </div>
        </div>
      </div>

      {/* Warnings */}
      {sameToken && (
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'rgba(240,165,0,0.08)',border:'1px solid rgba(240,165,0,0.20)',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#F0A500' }}>
          <AlertCircle size={15} /> Same token selected — choose different tokens.
        </div>
      )}

      {/* Estimate panel */}
      {estimate && (
        <div style={{ background:SURF,border:`1px solid ${BDR}`,borderRadius:12,padding:'14px 16px',marginBottom:12 }}>
          <Row label="Estimated output" value={`${estimate.estimatedOutput.amount} ${estimate.estimatedOutput.token}`} />
          <Row label="Slippage tolerance" value="1%" />
          <Row label={`NAN fee (${bpsToPercent(SWAP_FEE_BPS)})`} value={`${swapFee(parseFloat(amountIn)||0).toFixed(4)} ${tokenIn}`} />
          {estimate.fees.map((f,i) => <Row key={i} label={`${f.type} fee`} value={`${f.amount} ${f.token}`} />)}
          <div style={{ paddingTop:8,fontSize:11,color:T3 }}>⚠ Routed via LiFi aggregator.</div>
        </div>
      )}

      {/* Error */}
      {phase==='error' && errMsg && (
        <div style={{ display:'flex',alignItems:'flex-start',gap:8,background:'rgba(255,59,59,0.08)',border:'1px solid rgba(255,59,59,0.20)',borderRadius:10,padding:'12px 14px',marginBottom:12 }}>
          <AlertCircle size={15} color={RED} style={{ flexShrink:0,marginTop:1 }} />
          <span style={{ fontSize:13,color:RED }}>{errMsg}</span>
        </div>
      )}

      {/* CTAs */}
      {phase==='reviewed' ? (
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={() => { setEstimate(null); setPhase('idle') }} style={{ flex:1,height:52,background:SURF,border:`1px solid ${BDR}`,borderRadius:12,fontSize:14,fontWeight:600,color:TEXT,cursor:'pointer',fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
            <RefreshCw size={14} /> New quote
          </button>
          <button onClick={() => void executeSwap()} disabled={phase==='swapping'} style={{ flex:2,height:52,background:BLUE,border:'none',borderRadius:12,fontSize:15,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:F }}>
            {phase==='swapping' ? <span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}><Loader size={16} style={{ animation:'spin 1s linear infinite' }} />Swapping…</span> : `Swap ${amountIn} ${tokenIn} → ${tokenOut}`}
          </button>
        </div>
      ) : (
        <button onClick={() => void reviewSwap()} disabled={!canReview||phase==='estimating'||phase==='swapping'} style={{ width:'100%',height:52,background:canReview?BLUE:SURF,border:`1px solid ${canReview?BLUE:BDR}`,borderRadius:12,fontSize:15,fontWeight:700,color:canReview?'#fff':T3,cursor:canReview?'pointer':'not-allowed',fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'all 0.15s' }}>
          {phase==='estimating' ? <><Loader size={16} style={{ animation:'spin 1s linear infinite' }} /> Getting quote…</> : 'Get quote'}
        </button>
      )}

      <div style={{ marginTop:14,fontSize:11,color:T3,textAlign:'center' }}>
        Powered by Circle App Kit · Swaps routed via LiFi
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
