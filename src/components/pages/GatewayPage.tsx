import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Check, AlertCircle, Copy } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
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

// Circle Gateway Wallet on Arc Testnet — the address users deposit USDC to.
// Funds deposited here become unified cross-chain balance.
// Source: https://developers.circle.com/gateway
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const
// Circle Gateway Minter — used to read your gateway balance (as USDC allowance).
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const

// Minimal ABI for reading your Gateway balance:
// Gateway tracks balances as an ERC-20 allowance from GatewayWallet → GatewayMinter
// So balanceOf(user) on the GatewayMinter gives your unified balance.
const GATEWAY_MINTER_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Minimal ABI for Gateway withdraw: burn gateway tokens back to USDC
const GATEWAY_MINTER_BURN_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

type Tab = 'balance' | 'deposit' | 'withdraw'

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { address } = useAccount()
  const usdcFact = getUsdc(ARC)
  const decimals = usdcDecimalsFor(ARC)

  // Wallet USDC balance
  const { data: rawWalletBalance, isLoading: walletLoading, refetch: refetchWallet } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC, query: { enabled: !!address && !!usdcFact },
  })

  // Gateway balance — read from GatewayMinter.balanceOf(user)
  const { data: rawGatewayBalance, isLoading: gatewayLoading, refetch: refetchGateway } = useReadContract({
    address: GATEWAY_MINTER,
    abi: GATEWAY_MINTER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address },
  })

  const walletBalance = rawWalletBalance !== undefined
    ? formatUnits(rawWalletBalance, decimals) : null
  const gatewayBalance = rawGatewayBalance !== undefined
    ? formatUnits(rawGatewayBalance, decimals) : null

  const refetchAll = () => { void refetchWallet(); void refetchGateway() }
  const isLoading = walletLoading || gatewayLoading

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
        <button onClick={refetchAll} style={{ width:36, height:36, borderRadius:10, background:SURF, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
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

      {tab === 'balance'  && <BalanceTab  address={address} walletBalance={walletBalance} gatewayBalance={gatewayBalance} isLoading={isLoading} />}
      {tab === 'deposit'  && <DepositTab  address={address} walletBalance={walletBalance} decimals={decimals} onSuccess={() => { refetchAll(); setTab('balance') }} />}
      {tab === 'withdraw' && <WithdrawTab address={address} gatewayBalance={gatewayBalance} decimals={decimals} onSuccess={() => { refetchAll(); setTab('balance') }} />}
    </div>
  )
}

function BalanceTab({ address, walletBalance, gatewayBalance, isLoading }: {
  address?: string; walletBalance: string|null; gatewayBalance: string|null; isLoading: boolean
}) {
  const display = gatewayBalance ? parseFloat(gatewayBalance).toFixed(2) : '0.00'
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
              {display} <span style={{ fontSize:18, color:'rgba(255,255,255,0.40)' }}>USDC</span>
            </div>
            <div style={{ marginTop:8, fontSize:12, color:'rgba(255,255,255,0.30)' }}>
              {parseFloat(display) > 0 ? 'Unified cross-chain USDC balance' : 'Deposit USDC to build your Gateway balance'}
            </div>
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
          <span style={{ fontSize:15, fontWeight:700, color:TEXT, fontFamily:MONO }}>{isLoading ? '…' : `${walletBalance ? parseFloat(walletBalance).toFixed(2) : '0.00'} USDC`}</span>
        </div>
      )}
      {/* Gateway info */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:T3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>What is Gateway?</div>
        <div style={{ fontSize:12, color:T2, lineHeight:1.6 }}>
          Circle Gateway lets you hold a unified USDC balance across multiple blockchains. Deposit once on Arc, spend across supported chains instantly with no bridging wait.
        </div>
        <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
          {['Arc', 'Ethereum', 'Base', 'Arbitrum', 'Polygon', 'OP', 'Avalanche', 'Unichain', 'Solana'].map(c => (
            <span key={c} style={{ fontSize:10, fontWeight:600, color:BLUE, background:'rgba(0,102,255,0.10)', border:'1px solid rgba(0,102,255,0.20)', borderRadius:20, padding:'2px 8px' }}>{c}</span>
          ))}
        </div>
      </div>
      {!address && (
        <div style={{ textAlign:'center', padding:'32px 0', color:T3 }}>
          <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Connect to view your Gateway balance</div>
        </div>
      )}
    </div>
  )
}

function DepositTab({ address, walletBalance, decimals, onSuccess }: {
  address?: string; walletBalance: string|null; decimals: number; onSuccess: () => void
}) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const usdcFact = getUsdc(ARC)
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle'|'approving'|'depositing'|'done'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const parsed = amount && parseFloat(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Step 1: approve USDC → GatewayWallet
  const { writeContract: approve, data: approveTxHash, reset: resetApprove } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveError } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Step 2: GatewayWallet.depositFor(amount) — but GatewayWallet on Arc is a simple
  // ERC-20 transfer target (USDC → GatewayWallet mints gateway tokens for your address).
  // The Circle Gateway on Arc works by transferring USDC to the GatewayWallet address.
  // Circle's backend detects the transfer and credits your unified balance.
  const { writeContract: deposit, data: depositTxHash, reset: resetDeposit } = useWriteContract()
  const { isSuccess: depositSuccess, isError: depositError } = useWaitForTransactionReceipt({ hash: depositTxHash })

  useEffect(() => {
    if (approveSuccess && parsed > 0n && usdcFact) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('depositing')
      // Transfer USDC to the GatewayWallet — Circle detects and credits unified balance
      deposit({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [GATEWAY_WALLET, parsed],
        chainId: ARC,
      })
    }
  }, [approveSuccess]) // eslint-disable-line

  useEffect(() => {
    if (depositSuccess) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('done')
      toast.success(`Deposited ${amount} USDC to Gateway`)
      setTimeout(onSuccess, 1500)
    }
  }, [depositSuccess]) // eslint-disable-line

  useEffect(() => {
    if (approveError || depositError) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('error')
      setErrMsg('Transaction rejected or failed.')
    }
  }, [approveError, depositError]) // eslint-disable-line

  const handleDeposit = async () => {
    if (!address || !usdcFact || !amount || parseFloat(amount) <= 0) return
    setErrMsg('')
    try {
      if (chainId !== ARC) await switchChainAsync({ chainId: ARC })
      setPhase('approving')
      // Approve GatewayWallet to spend your USDC
      approve({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [GATEWAY_WALLET, parsed],
        chainId: ARC,
      })
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Failed to deposit.')
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); resetApprove(); resetDeposit() }

  if (!address) return (
    <div style={{ textAlign:'center', padding:'48px 0', color:T3 }}>
      <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet to deposit</div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowDownToLine size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Deposit USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Transfer USDC into your unified Gateway balance</div>
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
          <span style={{ fontSize:11, color:T2 }}>Available: <strong style={{ color:TEXT }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></span>
          {walletBalance && <button onClick={() => setAmount(parseFloat(walletBalance).toFixed(6))} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'7px 0', border:`1px solid ${amount===v?BLUE:BDR}`, borderRadius:8, background:amount===v?'rgba(0,102,255,0.12)':SURF, color:amount===v?BLUE:T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600 }}>{v}</button>
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div style={{ border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label:'Approve USDC spend', done: phase==='depositing'||phase==='done', active: phase==='approving' },
            { label:'Transfer to Gateway', done: phase==='done', active: phase==='depositing' },
          ].map((s,i) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom: i===0?`1px solid ${BDR}`:'none', display:'flex', alignItems:'center', gap:12 }}>
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

      <div style={{ fontSize:11, color:T3, textAlign:'center', lineHeight:1.5 }}>
        Powered by Circle Gateway · Funds available cross-chain instantly
      </div>
    </div>
  )
}

function WithdrawTab({ address, gatewayBalance, decimals, onSuccess }: {
  address?: string; gatewayBalance: string|null; decimals: number; onSuccess: () => void
}) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle'|'burning'|'done'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const parsed = amount && parseFloat(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Withdraw = call burn() on GatewayMinter — converts gateway tokens back to wallet USDC
  const { writeContract: burn, data: burnTxHash, reset: resetBurn } = useWriteContract()
  const { isSuccess: burnSuccess, isError: burnError } = useWaitForTransactionReceipt({ hash: burnTxHash })

  useEffect(() => {
    if (burnSuccess) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('done')
      toast.success(`Withdrew ${amount} USDC from Gateway`)
      setTimeout(onSuccess, 1500)
    }
  }, [burnSuccess]) // eslint-disable-line

  useEffect(() => {
    if (burnError) {
      // eslint-disable-next-line react/set-state-in-effect
      setPhase('error')
      setErrMsg('Withdrawal failed. Check you have sufficient Gateway balance.')
    }
  }, [burnError]) // eslint-disable-line

  const handleWithdraw = async () => {
    if (!address || !amount || parseFloat(amount) <= 0) return
    setErrMsg('')
    try {
      if (chainId !== ARC) await switchChainAsync({ chainId: ARC })
      setPhase('burning')
      burn({
        address: GATEWAY_MINTER,
        abi: GATEWAY_MINTER_BURN_ABI,
        functionName: 'burn',
        args: [parsed],
        chainId: ARC,
      })
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Failed to withdraw.')
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); resetBurn() }

  if (!address) return (
    <div style={{ textAlign:'center', padding:'48px 0', color:T3 }}>
      <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet to withdraw</div>
    </div>
  )

  const gwBal = gatewayBalance ? parseFloat(gatewayBalance) : 0
  const hasBalance = gwBal > 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowUpFromLine size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Withdraw USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Convert Gateway balance back to wallet USDC</div>
        </div>
      </div>

      {!hasBalance && (
        <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12, color:T2, lineHeight:1.5 }}>
            Your Gateway balance is 0.00 USDC. Deposit USDC first to build a Gateway balance.
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle' || !hasBalance}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
          <span style={{ fontSize:11, color:T2 }}>Gateway balance: <strong style={{ color:TEXT }}>{gwBal.toFixed(2)} USDC</strong></span>
          {hasBalance && <button onClick={() => setAmount(gwBal.toFixed(6))} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
      </div>

      {phase === 'burning' && (
        <div style={{ border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:SURF2, border:`1px solid ${BDR}` }}>
            <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} />
          </div>
          <span style={{ fontSize:13, color:TEXT }}>Burning gateway tokens…</span>
          {burnTxHash && (
            <a href={buildTxExplorerUrl(ARC, burnTxHash)} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
          )}
        </div>
      )}

      {phase === 'done' && burnTxHash && (
        <div style={{ border:`1px solid rgba(0,200,83,0.20)`, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
          <Check size={16} color="#00C853" />
          <span style={{ fontSize:13, color:TEXT }}>Withdrawal complete</span>
          <a href={buildTxExplorerUrl(ARC, burnTxHash)} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background:'rgba(255,68,68,0.08)', border:`1px solid rgba(255,68,68,0.20)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={14} color="#FF4444" style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:'#FF4444' }}>{errMsg}</span>
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Withdraw again</button>
      ) : (
        <button onClick={() => void handleWithdraw()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle' || !hasBalance}
          style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle'||!hasBalance)?'not-allowed':'pointer', background:(!amount||phase!=='idle'||!hasBalance)?SURF:BLUE, color:(!amount||phase!=='idle'||!hasBalance)?T2:'#fff', transition:'all 0.15s' }}>
          {phase==='burning'?'Withdrawing…':`Withdraw ${amount||'0.00'} USDC`}
        </button>
      )}

      {/* Gateway address info */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:11, color:T3, marginBottom:4 }}>Gateway Wallet (Arc Testnet)</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, fontFamily:MONO, color:T2 }}>{GATEWAY_WALLET.slice(0,14)}…{GATEWAY_WALLET.slice(-8)}</span>
          <button onClick={() => { void navigator.clipboard.writeText(GATEWAY_WALLET); toast.success('Copied') }} style={{ background:'none', border:'none', cursor:'pointer', color:T3, padding:2 }}>
            <Copy size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
