import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Check, AlertCircle } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const SURF = 'var(--nan-surface)'
const SURF2= 'var(--nan-surface2)'
const BDR  = 'var(--nan-bdr)'
const BLUE = '#0066FF'
const TEXT = 'var(--nan-text)'
const T2   = 'var(--nan-text2)'
const T3   = 'var(--nan-text3)'
const ARC  = 5042002
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const

type Tab = 'balance' | 'deposit' | 'withdraw'

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { address } = useAccount()
  const usdcFact = getUsdc(ARC)
  const { data: rawWalletBalance, isLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC, query: { enabled: !!address && !!usdcFact },
  })
  const decimals = usdcDecimalsFor(ARC)
  const walletBalance = rawWalletBalance !== undefined
    ? (Number(rawWalletBalance) / 10 ** decimals).toFixed(2) : null

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Layers size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>Gateway</div>
          <div style={{ fontSize:12, color:T2 }}>Unified USDC · Arc Testnet</div>
        </div>
        <button onClick={() => refetch()} style={{ width:36, height:36, borderRadius:10, background:SURF, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <RefreshCw size={15} color={T2} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:SURF, borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
        {(['balance','deposit','withdraw'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'8px 4px', border:'none', borderRadius:9, cursor:'pointer',
            fontFamily:F, fontSize:13, fontWeight: tab===t ? 700 : 500,
            background: tab===t ? BLUE : 'transparent',
            color: tab===t ? '#fff' : T2, transition:'all 0.15s',
          }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
        ))}
      </div>

      {tab === 'balance'  && <BalanceTab  address={address} walletBalance={walletBalance} isLoading={isLoading} />}
      {tab === 'deposit'  && <DepositTab  address={address} walletBalance={walletBalance} onSuccess={() => { refetch(); setTab('balance') }} />}
      {tab === 'withdraw' && <WithdrawTab address={address} onSuccess={() => { refetch(); setTab('balance') }} />}
    </div>
  )
}

function BalanceTab({ address, walletBalance, isLoading }: { address?: string; walletBalance: string|null; isLoading: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'linear-gradient(145deg,#0A0D14 0%,#0E1422 60%,#080B10 100%)', border:`1px solid rgba(0,102,255,0.18)`, borderRadius:20, padding:'28px 24px' }}>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:10, fontFamily:MONO }}>Gateway Balance</div>
        {!address ? (
          <div style={{ fontSize:32, fontWeight:700, color:'rgba(255,255,255,0.25)', fontFamily:MONO }}>—</div>
        ) : isLoading ? (
          <div style={{ height:44, width:120, background:'rgba(255,255,255,0.08)', borderRadius:10, animation:'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <>
            <div style={{ fontSize:40, fontWeight:700, color:'#FFFFFF', letterSpacing:'-1.5px', fontFamily:MONO }}>
              0.00 <span style={{ fontSize:18, color:'rgba(255,255,255,0.40)' }}>USDC</span>
            </div>
            <div style={{ marginTop:8, fontSize:12, color:'rgba(255,255,255,0.30)' }}>Deposit USDC to build your Gateway balance</div>
          </>
        )}
        {address && (
          <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.08)', fontSize:12, color:'rgba(255,255,255,0.30)', fontFamily:MONO }}>
            {address.slice(0,8)}...{address.slice(-6)} · Arc Testnet
          </div>
        )}
      </div>
      {address && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color:T2 }}>Wallet USDC available</span>
          <span style={{ fontSize:15, fontWeight:700, color:TEXT, fontFamily:MONO }}>{isLoading ? '…' : `${walletBalance ?? '0.00'} USDC`}</span>
        </div>
      )}
      {!address && (
        <div style={{ textAlign:'center', padding:'32px 0', color:T3 }}>
          <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Connect to view your Gateway balance</div>
        </div>
      )}
    </div>
  )
}

function DepositTab({ address, walletBalance, onSuccess }: { address?: string; walletBalance: string|null; onSuccess: () => void }) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const usdcFact = getUsdc(ARC)
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle'|'approving'|'depositing'|'done'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const decimals = usdcDecimalsFor(ARC)
  const parsed = amount && parseFloat(amount) > 0 ? parseUnits(amount, decimals) : 0n
  const { writeContract: approve, data: approveTxHash, reset: resetApprove } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveError } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { writeContract: deposit, data: depositTxHash, reset: resetDeposit } = useWriteContract()
  const { isSuccess: depositSuccess, isError: depositError } = useWaitForTransactionReceipt({ hash: depositTxHash })

  useEffect(() => {
    if (approveSuccess && parsed > 0n && usdcFact) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('depositing')
      deposit({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [GATEWAY_WALLET, parsed], chainId: ARC })
    }
  }, [approveSuccess]) // eslint-disable-line

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (depositSuccess) { setPhase('done'); toast.success(`Deposited ${amount} USDC to Gateway`); setTimeout(onSuccess, 1500) }
  }, [depositSuccess]) // eslint-disable-line

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (approveError || depositError) { setPhase('error'); setErrMsg('Transaction rejected or failed.') }
  }, [approveError, depositError]) // eslint-disable-line

  const handleDeposit = async () => {
    if (!address || !usdcFact || !amount || parseFloat(amount) <= 0) return
    setErrMsg('')
    try {
      if (chainId !== ARC) await switchChainAsync({ chainId: ARC })
      setPhase('approving')
      approve({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'approve', args: [GATEWAY_WALLET, parsed], chainId: ARC })
    } catch (e: unknown) { setPhase('error'); setErrMsg(e instanceof Error ? e.message : 'Failed to deposit.') }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); resetApprove(); resetDeposit() }

  if (!address) return <div style={{ textAlign:'center', padding:'48px 0', color:T3 }}><div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet to deposit</div></div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowDownToLine size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Deposit USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Transfer USDC into the Gateway contract</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
          <span style={{ fontSize:11, color:T2 }}>Available: <strong style={{ color:TEXT }}>{walletBalance ?? '—'} USDC</strong></span>
          {walletBalance && <button onClick={() => setAmount(walletBalance)} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'} style={{ flex:1, padding:'7px 0', border:`1px solid ${amount===v?BLUE:BDR}`, borderRadius:8, background:amount===v?'rgba(0,102,255,0.12)':SURF, color:amount===v?BLUE:T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600 }}>{v}</button>
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div style={{ border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[{ label:'Approve USDC', done: phase==='depositing'||phase==='done', active: phase==='approving' },
            { label:'Transfer to Gateway', done: phase==='done', active: phase==='depositing' }].map((s,i) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom: i===0 ? `1px solid ${BDR}` : 'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done?BLUE:SURF2, border:`1px solid ${s.done?BLUE:BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={13} color="#fff" /> : s.active ? <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color:TEXT }}>{s.label}</span>
              {s.done && i===1 && depositTxHash && (
                <a href={buildTxExplorerUrl(ARC, depositTxHash)} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background:'rgba(255,68,68,0.08)', border:`1px solid rgba(255,68,68,0.20)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={14} color="#FF4444" style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:'#FF4444' }}>{errMsg}</span>
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Deposit again</button>
      ) : (
        <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle'}
          style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:!amount||phase!=='idle'?'not-allowed':'pointer', background:!amount||phase!=='idle'?SURF:BLUE, color:!amount||phase!=='idle'?T2:'#fff', transition:'all 0.15s' }}>
          {phase==='approving'?'Approving…':phase==='depositing'?'Depositing…':`Deposit ${amount||'0.00'} USDC`}
        </button>
      )}
    </div>
  )
}

function WithdrawTab({ address }: { address?: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  if (!address) return <div style={{ textAlign:'center', padding:'48px 0', color:T3 }}><div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet to withdraw</div></div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowUpFromLine size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Withdraw USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Withdraw from Gateway back to your wallet</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
      </div>
      <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
        <AlertCircle size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.5 }}>
          Withdrawals require a Circle Kit Key.{' '}
          <a href="https://developers.circle.com/gateway" target="_blank" rel="noreferrer" style={{ color:BLUE, fontWeight:600 }}>Read docs</a>
        </div>
      </div>
      <button disabled={!amount || parseFloat(amount)<=0} onClick={() => toast.info('Withdrawal requires Circle Kit Key configuration.')}
        style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, fontFamily:F, border:'none', background:!amount||parseFloat(amount)<=0?SURF:BLUE, color:!amount||parseFloat(amount)<=0?T2:'#fff', cursor:!amount||parseFloat(amount)<=0?'not-allowed':'pointer', transition:'all 0.15s' }}>
        Withdraw {amount||'0.00'} USDC
      </button>
    </div>
  )
}
