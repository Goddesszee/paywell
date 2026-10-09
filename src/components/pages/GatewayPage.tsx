import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowLeftRight, ExternalLink, Check, AlertCircle, Copy, Info, ChevronDown } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId, useReadContract } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, zeroAddress } from 'viem'
import { toast } from 'sonner'
import { getUsdc, getProtocolContractByName, buildTxExplorerUrl, ONCHAIN_CHAINS } from '@/onchain-facts'
import { useAppStore } from '../../store/appStore'
import { useCircleTransaction } from '../../hooks/useCircleTransaction'

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

// ── Gateway addresses from onchain-facts ─────────────────────────────────────
const GATEWAY_WALLET = getProtocolContractByName('GatewayWallet', 'testnet')!.address as `0x${string}`
const GATEWAY_MINTER = getProtocolContractByName('GatewayMinter', 'testnet')!.address as `0x${string}`

// ── Gateway REST API ──────────────────────────────────────────────────────────
const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1'

// ── Correct Gateway ABIs ──────────────────────────────────────────────────────
// deposit(address token, uint256 value) — credits the caller's unified balance
const GATEWAY_WALLET_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'token',  type: 'address' },
      { name: 'value',  type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// gatewayMint(bytes attestationPayload, bytes signature) — mints on destination
const GATEWAY_MINTER_ABI = [
  {
    type: 'function',
    name: 'gatewayMint',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature',          type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// EIP-712 typed data for Gateway BurnIntent — MUST match exactly
const BURN_INTENT_TYPED_DATA = {
  domain: { name: 'GatewayWallet', version: '1' },
  types: {
    EIP712Domain: [
      { name: 'name',    type: 'string' },
      { name: 'version', type: 'string' },
    ],
    TransferSpec: [
      { name: 'version',              type: 'uint32'  },
      { name: 'sourceDomain',         type: 'uint32'  },
      { name: 'destinationDomain',    type: 'uint32'  },
      { name: 'sourceContract',       type: 'bytes32' },
      { name: 'destinationContract',  type: 'bytes32' },
      { name: 'sourceToken',          type: 'bytes32' },
      { name: 'destinationToken',     type: 'bytes32' },
      { name: 'sourceDepositor',      type: 'bytes32' },
      { name: 'destinationRecipient', type: 'bytes32' },
      { name: 'sourceSigner',         type: 'bytes32' },
      { name: 'destinationCaller',    type: 'bytes32' },
      { name: 'value',                type: 'uint256' },
      { name: 'salt',                 type: 'bytes32' },
      { name: 'hookData',             type: 'bytes'   },
    ],
    BurnIntent: [
      { name: 'maxBlockHeight', type: 'uint256' },
      { name: 'maxFee',         type: 'uint256' },
      { name: 'spec',           type: 'TransferSpec' },
    ],
  },
  primaryType: 'BurnIntent' as const,
}

function toBytes32(addr: `0x${string}`): `0x${string}` {
  return `0x${addr.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

function randomHex32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

// Chains with Gateway testnet support
const GATEWAY_CHAINS = ONCHAIN_CHAINS.filter(c =>
  c.isTestnet && c.usdc && [5042002, 11155111, 84532, 421614, 43113, 80002, 11155420, 1301].includes(c.chainId)
)

// Domain IDs for testnet
const DOMAIN_MAP: Record<number, number> = {
  11155111: 0,  // Ethereum Sepolia
  43113:    1,  // Avalanche Fuji
  11155420: 2,  // OP Sepolia
  421614:   3,  // Arbitrum Sepolia
  84532:    6,  // Base Sepolia
  80002:    7,  // Polygon Amoy
  1301:     10, // Unichain Sepolia
  5042002:  26, // Arc Testnet
}

// ── Gateway REST API helpers ──────────────────────────────────────────────────
async function fetchGatewayBalance(address: string): Promise<string> {
  // Query all supported domains for this depositor
  const sources = Object.entries(DOMAIN_MAP).map(([, domain]) => ({
    domain,
    depositor: address,
  }))
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources }),
  })
  if (!res.ok) throw new Error(`Gateway balances API: ${res.status}`)
  const data = await res.json() as { balances: { domain: number; depositor: string; balance: string }[] }
  // Sum all domain balances
  const total = data.balances.reduce((acc, b) => acc + parseFloat(b.balance || '0'), 0)
  return total.toFixed(6)
}

/** Fetch current Arc block number via public RPC */
async function fetchArcBlockNumber(): Promise<bigint> {
  const rpcUrl = 'https://rpc.testnet.arc.io'
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  })
  const data = await res.json() as { result?: string }
  if (!data.result) throw new Error('Could not fetch Arc block number')
  return BigInt(data.result)
}

/**
 * Submit a burn intent to the Gateway API and return attestation + signature.
 * - For SCAs (passkey / smart contract accounts), pass contractSigner=true.
 * - The API may return a transferId (forwarded) instead of inline attestation;
 *   in that case we poll GET /v1/transfer/{id} until the attestation is ready.
 */
async function submitBurnIntent(
  burnIntent: unknown,
  signature: string,
  contractSigner = false,
): Promise<{ attestation: `0x${string}`; signature: `0x${string}` }> {
  const item: Record<string, unknown> = { burnIntent, signature }
  if (contractSigner) item.contractSigner = true

  const res = await fetch(`${GATEWAY_API}/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      [item],
      (_k, v: unknown) => typeof v === 'bigint' ? (v).toString() : v,
    ),
  })
  if (!res.ok) throw new Error(`Gateway transfer API: ${res.status} ${await res.text()}`)
  const json = await res.json() as {
    attestation?: `0x${string}`
    signature?: `0x${string}`
    transferId?: string
  }

  // Inline response (non-forwarded)
  if (json.attestation && json.signature) {
    return { attestation: json.attestation, signature: json.signature }
  }

  // Forwarded response — poll GET /v1/transfer/{id}
  const transferId = json.transferId
  if (!transferId) throw new Error('Gateway API returned no attestation and no transferId')

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000))
    const poll = await fetch(`${GATEWAY_API}/transfer/${transferId}`)
    if (!poll.ok) continue
    const record = await poll.json() as {
      attestation?: { payload?: `0x${string}`; signature?: `0x${string}` }
    }
    const att = record.attestation
    if (att?.payload && att?.signature) {
      return { attestation: att.payload, signature: att.signature }
    }
  }
  throw new Error('Timed out waiting for Gateway attestation')
}

type Tab = 'balance' | 'deposit' | 'transfer'

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { address: wagmiAddress } = useAccount()
  const { auth } = useAppStore()
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  const usdcFact = getUsdc(ARC)

  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  // Wallet USDC balance (ERC-20)
  const { data: rawWalletBalance, isLoading: walletLoading, refetch: refetchWallet } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC,
    query: { enabled: !!address && !!usdcFact },
  })
  const walletBalance = rawWalletBalance !== undefined
    ? formatUnits(rawWalletBalance, usdcFact?.decimals ?? 6)
    : null

  const doFetchBalance = async (addr: string) => {
    setBalanceLoading(true)
    try {
      const bal = await fetchGatewayBalance(addr)
      setGatewayBalance(bal) // eslint-disable-line react/set-state-in-effect
    } catch {
      setGatewayBalance('0.000000') // eslint-disable-line react/set-state-in-effect
    } finally {
      setBalanceLoading(false) // eslint-disable-line react/set-state-in-effect
    }
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (address) { void doFetchBalance(address) } }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadGatewayBalance = () => { if (address) void doFetchBalance(address) }
  const refetchAll = () => { void refetchWallet(); loadGatewayBalance() }
  const isLoading = walletLoading || balanceLoading

  const TABS: { id: Tab; label: string }[] = [
    { id: 'balance',  label: 'Balance'  },
    { id: 'deposit',  label: 'Deposit'  },
    { id: 'transfer', label: 'Transfer' },
  ]

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', paddingBottom: 88 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 16px' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Layers size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:TEXT, letterSpacing:'-0.02em' }}>Gateway</div>
          <div style={{ fontSize:12, color:T2 }}>Unified USDC · Circle Gateway Testnet</div>
        </div>
        <button onClick={refetchAll} style={{ width:36, height:36, borderRadius:10, background:SURF, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <RefreshCw size={15} color={T2} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:SURF, borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'8px 4px', border:'none', borderRadius:9, cursor:'pointer',
            fontFamily:F, fontSize:13, fontWeight: tab===t.id ? 700 : 500,
            background: tab===t.id ? BLUE : 'transparent',
            color: tab===t.id ? '#fff' : T2, transition:'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'balance'  && <BalanceTab  address={address} walletBalance={walletBalance} gatewayBalance={gatewayBalance} isLoading={isLoading} />}
      {tab === 'deposit'  && (wagmiAddress
        ? <DepositTab  address={address} walletBalance={walletBalance} usdcFact={usdcFact} onSuccess={() => { refetchAll(); setTab('balance') }} />
        : <CircleDepositTab  address={address} walletBalance={walletBalance} usdcFact={usdcFact} onSuccess={() => { refetchAll(); setTab('balance') }} />)}
      {tab === 'transfer' && (wagmiAddress
        ? <TransferTab address={wagmiAddress} gatewayBalance={gatewayBalance} onSuccess={() => { refetchAll(); setTab('balance') }} />
        : <CircleTransferTab address={address} gatewayBalance={gatewayBalance} onSuccess={() => { refetchAll(); setTab('balance') }} />)}
    </div>
  )
}

// ── Balance tab ───────────────────────────────────────────────────────────────
function BalanceTab({ address, walletBalance, gatewayBalance, isLoading }: {
  address?: string; walletBalance: string|null; gatewayBalance: string|null; isLoading: boolean
}) {
  const display = gatewayBalance ? parseFloat(gatewayBalance).toFixed(2) : '0.00'
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ background:'linear-gradient(145deg,#0A0D14 0%,#0E1422 60%,#080B10 100%)', border:`1px solid rgba(0,102,255,0.18)`, borderRadius:20, padding:'28px 24px' }}>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', letterSpacing:'0.16em', textTransform:'uppercase', marginBottom:10, fontFamily:MONO }}>Gateway Balance (Unified)</div>
        {!address ? (
          <div style={{ fontSize:32, fontWeight:700, color:'rgba(255,255,255,0.25)', fontFamily:MONO }}>—</div>
        ) : isLoading ? (
          <div style={{ height:44, width:140, background:'rgba(255,255,255,0.08)', borderRadius:10, animation:'nan-shimmer 1.4s ease infinite' }} />
        ) : (
          <>
            <div style={{ fontSize:40, fontWeight:700, color:'#FFFFFF', letterSpacing:'-1.5px', fontFamily:MONO }}>
              {display} <span style={{ fontSize:18, color:'rgba(255,255,255,0.40)' }}>USDC</span>
            </div>
            <div style={{ marginTop:8, fontSize:12, color:'rgba(255,255,255,0.30)' }}>
              {parseFloat(display) > 0 ? 'Summed across all supported chains via Gateway API' : 'Deposit USDC to build your unified Gateway balance'}
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
          <span style={{ fontSize:13, color:T2 }}>Wallet USDC (Arc Testnet)</span>
          <span style={{ fontSize:15, fontWeight:700, color:TEXT, fontFamily:MONO }}>{isLoading ? '…' : `${walletBalance ? parseFloat(walletBalance).toFixed(2) : '0.00'} USDC`}</span>
        </div>
      )}

      {/* Supported chains */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:T3, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>What is Gateway?</div>
        <div style={{ fontSize:12, color:T2, lineHeight:1.6 }}>
          Circle Gateway holds a unified USDC balance across all supported chains. Deposit on any chain, transfer instantly to any other — no CCTP wait time.
        </div>
        <div style={{ marginTop:10, display:'flex', gap:6, flexWrap:'wrap' }}>
          {['Arc', 'Ethereum', 'Base', 'Arbitrum', 'Polygon', 'OP', 'Avalanche', 'Unichain'].map(c => (
            <span key={c} style={{ fontSize:10, fontWeight:600, color:BLUE, background:'rgba(0,102,255,0.10)', border:'1px solid rgba(0,102,255,0.20)', borderRadius:20, padding:'2px 8px' }}>{c}</span>
          ))}
        </div>
      </div>

      {!address && (
        <div style={{ textAlign:'center', padding:'32px 0', color:T3 }}>
          <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Connect to view your unified Gateway balance</div>
        </div>
      )}
    </div>
  )
}

// ── Deposit tab (wagmi wallet) ─────────────────────────────────────────────────
function DepositTab({ address, walletBalance, usdcFact, onSuccess }: {
  address?: string; walletBalance: string|null
  usdcFact: { address: string; decimals: number; symbol: string } | undefined
  onSuccess: () => void
}) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle'|'approving'|'depositing'|'done'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const decimals = usdcFact?.decimals ?? 6
  const parsed = amount && parseFloat(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Step 1: approve USDC to GatewayWallet
  const { writeContract: approve, data: approveTxHash, reset: resetApprove } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveError } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Step 2: deposit(token, amount) — correct Circle Gateway ABI
  const { writeContract: deposit, data: depositTxHash, reset: resetDeposit } = useWriteContract()
  const { isSuccess: depositSuccess, isError: depositError } = useWaitForTransactionReceipt({ hash: depositTxHash })

  useEffect(() => {
    if (approveSuccess && parsed > 0n && usdcFact && address) {
      setPhase('depositing') // eslint-disable-line react/set-state-in-effect
      deposit({
        address: GATEWAY_WALLET,
        abi: GATEWAY_WALLET_ABI,
        functionName: 'deposit',
        // deposit(token address, amount) — NOT depositFor(account, amount)
        args: [usdcFact.address as `0x${string}`, parsed],
        chainId: ARC,
      })
    }
  }, [approveSuccess]) // eslint-disable-line

  useEffect(() => {
    if (depositSuccess) {
      setPhase('done') // eslint-disable-line react/set-state-in-effect
      toast.success(`Deposited ${amount} USDC into Gateway`)
      setTimeout(onSuccess, 1500)
    }
  }, [depositSuccess]) // eslint-disable-line

  useEffect(() => {
    if (approveError || depositError) {
      setPhase('error') // eslint-disable-line react/set-state-in-effect
      setErrMsg('Transaction rejected or failed.') // eslint-disable-line react/set-state-in-effect
    }
  }, [approveError, depositError]) // eslint-disable-line

  const handleDeposit = async () => {
    if (!address || !usdcFact || !amount || parseFloat(amount) <= 0) return
    setErrMsg('')
    try {
      if (chainId !== ARC) await switchChainAsync({ chainId: ARC })
      setPhase('approving')
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
          <div style={{ fontSize:11, color:T2 }}>Deposit on Arc Testnet to build your unified balance</div>
        </div>
      </div>

      <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>
          Approves USDC spend, then calls <strong>GatewayWallet.deposit(token, amount)</strong> — credits your unified cross-chain balance.
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
            { label:'deposit(token, amount) on Gateway', done: phase==='done', active: phase==='depositing' },
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
      <div style={{ fontSize:11, color:T3, textAlign:'center' }}>Powered by Circle Gateway · Funds available cross-chain instantly</div>
    </div>
  )
}

// ── Circle wallet deposit tab ─────────────────────────────────────────────────
// Passkey users (isPasskeyUser=true) are Circle Modular Wallet / ERC-4337 smart
// accounts. They sign via the bundler (sendUserOperation), NOT the W3S SDK
// PIN/email flow. useCircleTransaction requires userToken + encryptionKey which
// passkey users never have — routing them there produces "Circle session expired".
// This component detects the user type and picks the right signing path.
function CircleDepositTab({ address, walletBalance, usdcFact, onSuccess }: {
  address?: string; walletBalance: string|null
  usdcFact: { address: string } | undefined; onSuccess: () => void
}) {
  const { auth } = useAppStore()
  const isPasskey = !!auth?.isPasskeyUser

  if (isPasskey) {
    return (
      <PasskeyDepositTab
        address={address}
        walletBalance={walletBalance}
        usdcFact={usdcFact}
        onSuccess={onSuccess}
      />
    )
  }
  return (
    <W3SDepositTab
      address={address}
      walletBalance={walletBalance}
      usdcFact={usdcFact}
      onSuccess={onSuccess}
    />
  )
}

// Passkey (Modular Wallet / ERC-4337) deposit — uses bundler sendUserOperation
// Batches approve + deposit into a single user op so the user only signs once.
function PasskeyDepositTab({ address, walletBalance, usdcFact, onSuccess }: {
  address?: string; walletBalance: string|null
  usdcFact: { address: string } | undefined; onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle'|'busy'|'done'|'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const handleDeposit = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !usdcFact) return
    setErrMsg('')
    setPhase('busy')
    try {
      const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
      if (!clientKey) throw new Error('VITE_CLIENT_KEY not set — passkey transactions require a Circle Client Key.')

      const { encodeFunctionData, erc20Abi: abi, parseUnits: pu } = await import('viem')
      const parsed = pu(amount, 6)

      // Build calldata for approve + deposit
      const approveData = encodeFunctionData({ abi, functionName: 'approve', args: [GATEWAY_WALLET, parsed] })
      const depositData = encodeFunctionData({
        abi: GATEWAY_WALLET_ABI,
        functionName: 'deposit',
        args: [usdcFact.address as `0x${string}`, parsed],
      })

      // Build bundler client from stored passkey credential
      const { toWebAuthnAccount, createBundlerClient } = await import('viem/account-abstraction')
      const { toCircleSmartAccount, toModularTransport, toWebAuthnCredential, WebAuthnMode } = await import('@circle-fin/modular-wallets-core')
      const { createPublicClient } = await import('viem')
      const { arcTestnet } = await import('viem/chains')

      const MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
      const modularTransport = toModularTransport(`${MODULAR_URL}/arcTestnet`, clientKey)
      const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport })

      // Re-authenticate passkey to get a fresh credential for signing
      const passkeyTransport = (await import('@circle-fin/modular-wallets-core')).toPasskeyTransport(MODULAR_URL, clientKey)
      const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })

      const account = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential }),
      })

      const bundlerClient = createBundlerClient({
        account,
        chain: arcTestnet,
        transport: modularTransport,
      })

      // Batch approve + deposit as a single user operation (one passkey prompt).
      // Try Circle gas sponsorship first; if the paymaster returns an internal error
      // (-32603 / InternalRpcError) retry once unsponsored — on Arc, gas is USDC so
      // the smart account can pay for itself.
      let userOpHash: `0x${string}`
      try {
        userOpHash = await bundlerClient.sendUserOperation({
          account,
          calls: [
            { to: usdcFact.address as `0x${string}`, data: approveData, value: 0n },
            { to: GATEWAY_WALLET, data: depositData, value: 0n },
          ],
          paymaster: true,
        })
      } catch (paymasterErr: unknown) {
        const isInternal = (e: unknown) => {
          const err = e as { code?: number; name?: string; shortMessage?: string; message?: string } | undefined
          return err?.code === -32603 || err?.name === 'InternalRpcError'
            || /internal error/i.test(err?.shortMessage ?? err?.message ?? '')
        }
        if (!isInternal(paymasterErr)) throw paymasterErr
        // Retry without paymaster sponsorship
        userOpHash = await bundlerClient.sendUserOperation({
          account,
          calls: [
            { to: usdcFact.address as `0x${string}`, data: approveData, value: 0n },
            { to: GATEWAY_WALLET, data: depositData, value: 0n },
          ],
        })
      }

      await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
      setPhase('done')
      toast.success(`Deposited ${amount} USDC to Gateway`)
      setTimeout(onSuccess, 1500)
    } catch (e: unknown) {
      setPhase('error')
      const err = e as { code?: number; name?: string; shortMessage?: string; details?: string; message?: string } | undefined
      const raw = [err?.shortMessage, err?.details, err?.message].filter(Boolean).join(' ')
      let msg: string
      if (/NotAllowedError|cancel/i.test(raw)) {
        msg = 'Passkey prompt cancelled. Try again.'
      } else if (/insufficient|exceeds balance|AA21|AA31/i.test(raw)) {
        msg = 'Not enough USDC in your passkey wallet to cover this deposit plus network fee.'
      } else if (/AA23|AA24|signature/i.test(raw)) {
        msg = 'Passkey signature was rejected — sign out, sign back in with your passkey, then retry.'
      } else if (/internal error/i.test(raw)) {
        msg = "Circle's network returned an internal error. Please retry in a moment."
      } else {
        msg = err?.shortMessage ?? err?.message ?? String(e)
      }
      setErrMsg(msg)
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg('') }
  const busy = phase === 'busy'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:13, color:T2, lineHeight:1.6 }}>Deposit USDC into your unified Gateway balance using your passkey wallet.</div>
      <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>
          Approve + deposit are batched into <strong>one user operation</strong> — a single passkey biometric prompt covers both steps.
        </div>
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={busy}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ fontSize:11, color:T2, marginTop:6 }}>Available: <strong style={{ color:TEXT }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></div>
      </div>
      {errMsg && <div style={{ background:'rgba(255,68,68,0.08)', border:`1px solid rgba(255,68,68,0.20)`, borderRadius:10, padding:'10px 14px', fontSize:12, color:'#FF4444' }}>{errMsg}</div>}
      {busy && <div style={{ fontSize:13, color:T2, display:'flex', alignItems:'center', gap:8 }}><div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite', flexShrink:0 }} />Confirm with your passkey…</div>}
      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Deposit again</button>
      ) : (
        <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || busy}
          style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:(!amount||busy)?'not-allowed':'pointer', background:(!amount||busy)?SURF:BLUE, color:(!amount||busy)?T2:'#fff', transition:'all 0.15s' }}>
          {busy ? 'Processing…' : `Deposit ${amount||'0.00'} USDC`}
        </button>
      )}
    </div>
  )
}

// Multicall3 on Arc Testnet — batches approve + deposit into a single tx / one Circle popup
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
const MULTICALL3_ABI = [{
  type: 'function',
  name: 'aggregate3',
  inputs: [{
    name: 'calls', type: 'tuple[]',
    components: [
      { name: 'target',       type: 'address' },
      { name: 'allowFailure', type: 'bool'    },
      { name: 'callData',     type: 'bytes'   },
    ],
  }],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }],
  stateMutability: 'payable',
}] as const

// W3S SDK (user-controlled wallet) deposit — one Circle popup via Multicall3 batch
function W3SDepositTab({ address, walletBalance, usdcFact, onSuccess }: {
  address?: string; walletBalance: string|null
  usdcFact: { address: string } | undefined; onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const circleTx = useCircleTransaction()
  const { status, error } = circleTx
  const busy = status === 'creating' || status === 'approving' || status === 'polling'
  const decimals = 6

  const handleDeposit = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !usdcFact) return
    const parsed = parseUnits(amount, decimals)
    const { encodeFunctionData, erc20Abi: abi } = await import('viem')

    // Batch approve + deposit via Multicall3 → single Circle challenge = one popup
    const approveCallData = encodeFunctionData({ abi, functionName: 'approve', args: [GATEWAY_WALLET, parsed] })
    const depositCallData = encodeFunctionData({
      abi: GATEWAY_WALLET_ABI,
      functionName: 'deposit',
      args: [usdcFact.address as `0x${string}`, parsed],
    })
    const batchCallData = encodeFunctionData({
      abi: MULTICALL3_ABI,
      functionName: 'aggregate3',
      args: [[
        { target: usdcFact.address as `0x${string}`, allowFailure: false, callData: approveCallData },
        { target: GATEWAY_WALLET,                    allowFailure: false, callData: depositCallData },
      ]],
    })
    const result = await circleTx.executeContract({ contractAddress: MULTICALL3, callData: batchCallData })
    if (result) { toast.success(`Deposited ${amount} USDC to Gateway`); onSuccess() }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ fontSize:13, color:T2, lineHeight:1.6 }}>Deposit USDC into your unified Gateway balance using your Circle wallet.</div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={busy}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ fontSize:11, color:T2, marginTop:6 }}>Available: <strong style={{ color:TEXT }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></div>
      </div>
      {error && <div style={{ background:'rgba(255,68,68,0.08)', border:`1px solid rgba(255,68,68,0.20)`, borderRadius:10, padding:'10px 14px', fontSize:12, color:'#FF4444' }}>{error}</div>}
      {busy && <div style={{ fontSize:13, color:T2 }}>{status === 'approving' ? 'Approve in Circle popup…' : status === 'polling' ? 'Confirming on-chain…' : 'Preparing…'}</div>}
      <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || busy}
        style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:(!amount||busy)?'not-allowed':'pointer', background:(!amount||busy)?SURF:BLUE, color:(!amount||busy)?T2:'#fff', transition:'all 0.15s' }}>
        {busy ? 'Processing…' : `Deposit ${amount||'0.00'} USDC`}
      </button>
    </div>
  )
}

// ── Destination chain selector — custom dropdown, mobile-safe ─────────────────
function DestChainSelector({ chains, value, onChange, disabled }: {
  chains: typeof GATEWAY_CHAINS; value: number; onChange: (id: number) => void; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = chains.find(c => c.chainId === value)

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>To</div>
      <div style={{ position:'relative' }}>
        <button
          type="button"
          onClick={() => { if (!disabled) setOpen(o => !o) }}
          disabled={disabled}
          style={{
            width:'100%', padding:'12px 40px 12px 14px',
            border:`1px solid ${open ? BLUE : BDR}`, borderRadius:10,
            background:SURF2, color:TEXT, fontSize:14, fontWeight:600,
            fontFamily:F, textAlign:'left', cursor: disabled ? 'not-allowed' : 'pointer',
            outline:'none', display:'flex', alignItems:'center', justifyContent:'space-between',
            boxSizing:'border-box',
          }}
        >
          <span>{selected?.name ?? 'Select chain'}</span>
          <ChevronDown size={14} color={T2} style={{ flexShrink:0, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
        </button>
        {open && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:50,
            background:SURF2, border:`1px solid ${BDR}`, borderRadius:10,
            overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
          }}>
            {chains.map(c => (
              <button
                key={c.chainId}
                type="button"
                onClick={() => { onChange(c.chainId); setOpen(false) }}
                style={{
                  width:'100%', padding:'12px 14px', border:'none', background: c.chainId === value ? `rgba(0,102,255,0.12)` : 'transparent',
                  color: c.chainId === value ? BLUE : TEXT, fontSize:14, fontWeight: c.chainId === value ? 700 : 500,
                  fontFamily:F, textAlign:'left', cursor:'pointer', display:'block',
                  borderBottom: chains[chains.length-1]?.chainId === c.chainId ? 'none' : `1px solid ${BDR}`,
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transfer tab (EVM-to-EVM via Gateway burn intent + gatewayMint) ────────────
type TransferPhase = 'idle' | 'signing' | 'submitting' | 'minting' | 'done' | 'error'

function TransferTab({ address, gatewayBalance, onSuccess }: {
  address: `0x${string}`; gatewayBalance: string|null; onSuccess: () => void
}) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [amount, setAmount] = useState('')
  const [destChainId, setDestChainId] = useState<number>(84532) // Base Sepolia default
  const [phase, setPhase] = useState<TransferPhase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [mintTxHash, setMintTxHash] = useState<`0x${string}` | undefined>()
  const gwBal = gatewayBalance ? parseFloat(gatewayBalance) : 0

  const destChain = GATEWAY_CHAINS.find(c => c.chainId === destChainId)
  const srcChain  = GATEWAY_CHAINS.find(c => c.chainId === ARC)

  const { writeContract: doMint, data: mintHash } = useWriteContract()
  const { isSuccess: mintSuccess, isError: mintError } = useWaitForTransactionReceipt({ hash: mintHash })

  useEffect(() => {
    if (mintHash) setMintTxHash(mintHash) // eslint-disable-line react/set-state-in-effect
  }, [mintHash])

  useEffect(() => {
    if (mintSuccess) {
      setPhase('done') // eslint-disable-line react/set-state-in-effect
      toast.success(`Transferred ${amount} USDC to ${destChain?.name ?? 'destination'}`)
      setTimeout(onSuccess, 2000)
    }
  }, [mintSuccess]) // eslint-disable-line

  useEffect(() => {
    if (mintError) {
      setPhase('error') // eslint-disable-line react/set-state-in-effect
      setErrMsg('Mint transaction failed. The attestation may have already been used.') // eslint-disable-line react/set-state-in-effect
    }
  }, [mintError]) // eslint-disable-line

  const handleTransfer = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !destChain?.usdc || !srcChain?.usdc) return
    if (destChainId === ARC) { toast.error('Select a different destination chain'); return }
    setErrMsg('')
    const decimals = 6
    const parsed = parseUnits(amount, decimals)
    const srcDomain  = DOMAIN_MAP[ARC] ?? 26
    const destDomain = DOMAIN_MAP[destChainId]
    if (destDomain === undefined) { setErrMsg('Destination chain domain unknown'); return }

    try {
      // Ensure on Arc Testnet for signing
      if (chainId !== ARC) await switchChainAsync({ chainId: ARC })
      setPhase('signing')

      // maxBlockHeight: current Arc block + 2_000_000
      // Arc has ~250ms block time so 2M blocks ≈ ~6 days; Gateway requires at least ~1.2M ahead
      const currentBlock = await fetchArcBlockNumber()
      const maxBlockHeight = currentBlock + 2_000_000n
      // maxFee: Gateway uses 18-decimal precision (1e18 = 1 USDC worth of fee)
      const maxFee18 = 2n * 10n ** 18n  // 2 USDC max fee

      const burnIntent = {
        maxBlockHeight,
        maxFee: maxFee18,
        spec: {
          version: 1,
          sourceDomain:         srcDomain,
          destinationDomain:    destDomain,
          sourceContract:       toBytes32(GATEWAY_WALLET),
          destinationContract:  toBytes32(GATEWAY_MINTER),
          sourceToken:          toBytes32(srcChain.usdc.address as `0x${string}`),
          destinationToken:     toBytes32(destChain.usdc.address as `0x${string}`),
          sourceDepositor:      toBytes32(address),
          destinationRecipient: toBytes32(address),
          sourceSigner:         toBytes32(address),
          destinationCaller:    toBytes32(zeroAddress),
          value:                parsed,
          salt:                 randomHex32(),
          hookData:             '0x' as `0x${string}`,
        },
      }

      // Sign EIP-712 burn intent using eth_signTypedData_v4 directly
      const provider = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum
      if (!provider) throw new Error('No wallet provider found')

      const typedDataPayload = {
        ...BURN_INTENT_TYPED_DATA,
        message: burnIntent,
      }
      // Serialize with bigint support for the typed data payload
      const typedDataStr = JSON.stringify(
        typedDataPayload,
        (_k, v: unknown) => typeof v === 'bigint' ? (v).toString() : v,
      )
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, typedDataStr],
      }) as `0x${string}`

      setPhase('submitting')
      // EOA wallet — contractSigner: false
      const { attestation, signature: mintSignature } = await submitBurnIntent(burnIntent, signature, false)

      // Switch to destination chain and call gatewayMint
      await switchChainAsync({ chainId: destChainId })
      setPhase('minting')
      doMint({
        address: GATEWAY_MINTER,
        abi: GATEWAY_MINTER_ABI,
        functionName: 'gatewayMint',
        args: [attestation, mintSignature],
        chainId: destChainId,
      })
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Transfer failed.')
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); setMintTxHash(undefined) }

  const DEST_CHAINS = GATEWAY_CHAINS.filter(c => c.chainId !== ARC)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowLeftRight size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Transfer USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Burn on Arc, mint on destination — instant via Gateway</div>
        </div>
      </div>

      <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>
          Signs a <strong>Gateway BurnIntent</strong> (EIP-712), submits to the Gateway API, then calls <strong>gatewayMint</strong> on the destination chain. Instant — no CCTP attestation wait.
        </div>
      </div>

      {/* Source (always Arc Testnet) */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:11, color:T3, marginBottom:4, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>From</div>
        <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Arc Testnet</div>
        <div style={{ fontSize:12, color:T2, marginTop:2 }}>
          Gateway balance: <strong style={{ color:TEXT }}>{gwBal.toFixed(2)} USDC</strong>
        </div>
      </div>

      {/* Destination chain selector */}
      <DestChainSelector chains={DEST_CHAINS} value={destChainId} onChange={setDestChainId} disabled={phase !== 'idle'} />

      {/* Amount */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
          <span style={{ fontSize:11, color:T2 }}>Gateway balance: <strong style={{ color:TEXT }}>{gwBal.toFixed(2)} USDC</strong></span>
          {gwBal > 0 && <button onClick={() => setAmount(gwBal.toFixed(6))} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'7px 0', border:`1px solid ${amount===v?BLUE:BDR}`, borderRadius:8, background:amount===v?'rgba(0,102,255,0.12)':SURF, color:amount===v?BLUE:T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600 }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Progress steps */}
      {phase !== 'idle' && (
        <div style={{ border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label:'Sign BurnIntent (EIP-712)',         done: ['submitting','minting','done'].includes(phase), active: phase==='signing'    },
            { label:'Submit to Gateway API',              done: ['minting','done'].includes(phase),             active: phase==='submitting' },
            { label:`gatewayMint on ${destChain?.name}`, done: phase==='done',                                 active: phase==='minting'   },
          ].map((s, i) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom: i<2?`1px solid ${BDR}`:'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done?BLUE:SURF2, border:`1px solid ${s.done?BLUE:BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={13} color="#fff" /> : s.active ? <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color:TEXT }}>{s.label}</span>
              {s.done && i===2 && mintTxHash && (
                <a href={destChain ? destChain.explorerBase + '/tx/' + mintTxHash : '#'} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
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

      {gwBal <= 0 && phase === 'idle' && (
        <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', fontSize:12, color:T2 }}>
          Your Gateway balance is 0. Deposit USDC first to transfer cross-chain.
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Transfer again</button>
      ) : (
        <button onClick={() => void handleTransfer()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle' || gwBal<=0}
          style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle'||gwBal<=0)?'not-allowed':'pointer', background:(!amount||phase!=='idle'||gwBal<=0)?SURF:BLUE, color:(!amount||phase!=='idle'||gwBal<=0)?T2:'#fff', transition:'all 0.15s' }}>
          {phase==='signing'?'Sign in wallet…':phase==='submitting'?'Submitting to Gateway…':phase==='minting'?'Minting on destination…':`Transfer ${amount||'0.00'} USDC to ${destChain?.name ?? '…'}`}
        </button>
      )}

      {/* Contract addresses */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:11, color:T3, marginBottom:6, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Contracts (Arc Testnet)</div>
        {[
          { label:'GatewayWallet', addr: GATEWAY_WALLET },
          { label:'GatewayMinter', addr: GATEWAY_MINTER },
        ].map(({ label, addr }) => (
          <div key={addr} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:11, color:T3, width:100 }}>{label}</span>
            <span style={{ fontSize:11, fontFamily:MONO, color:T2 }}>{addr.slice(0,10)}…{addr.slice(-6)}</span>
            <button onClick={() => { void navigator.clipboard.writeText(addr); toast.success('Copied') }} style={{ background:'none', border:'none', cursor:'pointer', color:T3, padding:2 }}>
              <Copy size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Circle wallet transfer tab (passkey + W3S SDK) ───────────────────────────
// Handles EIP-712 BurnIntent signing for non-wagmi users and submits via Gateway API.
// Passkey path: bundler signTypedData (viem account-abstraction)
// W3S SDK path: useCircleTransaction signMessage (serialised typed data)
function CircleTransferTab({ address, gatewayBalance, onSuccess }: {
  address?: string; gatewayBalance: string|null; onSuccess: () => void
}) {
  const { auth } = useAppStore()
  const isPasskey = !!auth?.isPasskeyUser
  const [amount, setAmount]           = useState('')
  const [destChainId, setDestChainId] = useState<number>(84532)
  const [phase, setPhase]             = useState<TransferPhase>('idle')
  const [errMsg, setErrMsg]           = useState('')
  const [mintTxHash, setMintTxHash]   = useState<string | undefined>()
  const circleTx                      = useCircleTransaction()

  const gwBal     = gatewayBalance ? parseFloat(gatewayBalance) : 0
  const DEST_CHAINS = GATEWAY_CHAINS.filter(c => c.chainId !== ARC)
  const destChain   = GATEWAY_CHAINS.find(c => c.chainId === destChainId)
  const srcChain    = GATEWAY_CHAINS.find(c => c.chainId === ARC)

  const handleTransfer = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !destChain?.usdc || !srcChain?.usdc) return
    if (destChainId === ARC) { toast.error('Select a different destination chain'); return }
    setErrMsg('')
    const decimals   = 6
    const parsed     = parseUnits(amount, decimals)
    const srcDomain  = DOMAIN_MAP[ARC] ?? 26
    const destDomain = DOMAIN_MAP[destChainId]
    if (destDomain === undefined) { setErrMsg('Destination chain domain unknown'); return }

    try {
      setPhase('signing')

      // maxBlockHeight: current Arc block + 2_000_000 (Gateway requires at least ~1.2M ahead)
      const currentBlock = await fetchArcBlockNumber()
      const maxBlockHeight = currentBlock + 2_000_000n
      // maxFee: Gateway uses 18-decimal precision (2 * 1e18 = 2 USDC max fee)
      const maxFee18 = 2n * 10n ** 18n

      const burnIntentSpec = {
        version:              1,
        sourceDomain:         srcDomain,
        destinationDomain:    destDomain,
        sourceContract:       toBytes32(GATEWAY_WALLET),
        destinationContract:  toBytes32(GATEWAY_MINTER),
        sourceToken:          toBytes32(srcChain.usdc.address as `0x${string}`),
        destinationToken:     toBytes32(destChain.usdc.address as `0x${string}`),
        sourceDepositor:      toBytes32(address as `0x${string}`),
        destinationRecipient: toBytes32(address as `0x${string}`),
        sourceSigner:         toBytes32(address as `0x${string}`),
        destinationCaller:    toBytes32(zeroAddress),
        value:                parsed,
        salt:                 randomHex32(),
        hookData:             '0x' as `0x${string}`,
      }
      const burnIntent = {
        maxBlockHeight,
        maxFee: maxFee18,
        spec:   burnIntentSpec,
      }

      let signature: `0x${string}`

      if (isPasskey) {
        // ── Passkey path (SCA / ERC-1271) ────────────────────────────────────
        // SCAs use ERC-1271 — must pass contractSigner:true to Gateway API
        const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
        if (!clientKey) throw new Error('VITE_CLIENT_KEY not set — passkey transactions require a Circle Client Key.')
        const { toWebAuthnAccount } = await import('viem/account-abstraction')
        const { toCircleSmartAccount, toModularTransport, toWebAuthnCredential, WebAuthnMode, toPasskeyTransport } = await import('@circle-fin/modular-wallets-core')
        const { createPublicClient } = await import('viem')
        const { arcTestnet } = await import('viem/chains')
        const MODULAR_URL   = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
        const modularTransport = toModularTransport(`${MODULAR_URL}/arcTestnet`, clientKey)
        const publicClient     = createPublicClient({ chain: arcTestnet, transport: modularTransport })
        const passkeyTransport = toPasskeyTransport(MODULAR_URL, clientKey)
        const credential       = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })
        const account          = await toCircleSmartAccount({ client: publicClient, owner: toWebAuthnAccount({ credential }) })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        signature = await (account as any).signTypedData({
          domain:      BURN_INTENT_TYPED_DATA.domain,
          types:       { BurnIntent: BURN_INTENT_TYPED_DATA.types.BurnIntent, TransferSpec: BURN_INTENT_TYPED_DATA.types.TransferSpec },
          primaryType: 'BurnIntent',
          message:     burnIntent,
        })
      } else {
        // ── W3S SDK path (EOA via Circle UCW) ────────────────────────────────
        // Circle UCW signs EIP-712 typed data via the sign-message challenge.
        // We pass the full typed data JSON; the SDK signs it as personal_sign.
        const typedDataStr = JSON.stringify(
          { ...BURN_INTENT_TYPED_DATA, message: burnIntent },
          (_k, v: unknown) => typeof v === 'bigint' ? (v).toString() : v,
        )
        const result = await circleTx.signMessage(typedDataStr)
        if (!result) throw new Error(circleTx.error ?? 'Signing cancelled')
        signature = result as `0x${string}`
      }

      setPhase('submitting')
      // Pass contractSigner:true for passkey (SCA/ERC-1271); false for Circle UCW (EOA)
      const { attestation, signature: mintSignature } = await submitBurnIntent(burnIntent, signature, isPasskey)

      // ── Mint on destination via Circle wallet contract execution ─────────
      setPhase('minting')
      const { encodeFunctionData } = await import('viem')
      const mintCallData = encodeFunctionData({
        abi: GATEWAY_MINTER_ABI,
        functionName: 'gatewayMint',
        args: [attestation, mintSignature],
      })

      let txHash: string | undefined
      if (isPasskey) {
        const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
        if (!clientKey) throw new Error('VITE_CLIENT_KEY not set')
        // For passkey: find GatewayMinter on dest chain and send userOp via bundler
        const { toWebAuthnAccount, createBundlerClient } = await import('viem/account-abstraction')
        const { toCircleSmartAccount, toModularTransport, toWebAuthnCredential, WebAuthnMode, toPasskeyTransport } = await import('@circle-fin/modular-wallets-core')
        const { createPublicClient } = await import('viem')
        // Map Gateway chainId → viem chain object for bundler transport
        const viemChains = await import('viem/chains')
        // chainId → viem chain object
        const VIEM_CHAIN_MAP: Record<number, import('viem').Chain> = {
          11155111: viemChains.sepolia,
          84532:    viemChains.baseSepolia,
          421614:   viemChains.arbitrumSepolia,
          43113:    viemChains.avalancheFuji,
          80002:    viemChains.polygonAmoy,
          11155420: viemChains.optimismSepolia,
          1301:     viemChains.unichainSepolia,
        }
        // chainId → Circle modular SDK camelCase slug (must match exactly)
        const MODULAR_SLUG_MAP: Record<number, string> = {
          11155111: 'sepolia',
          84532:    'baseSepolia',
          421614:   'arbitrumSepolia',
          43113:    'avalancheFuji',
          80002:    'polygonAmoy',
          11155420: 'optimismSepolia',
          1301:     'unichainSepolia',
        }
        const destViemChain = VIEM_CHAIN_MAP[destChainId]
        if (!destViemChain) throw new Error(`No viem chain for ${destChain.name}`)
        const destChainSlug = MODULAR_SLUG_MAP[destChainId]
        if (!destChainSlug) throw new Error(`No modular SDK slug for ${destChain.name}`)
        const MODULAR_URL      = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
        const modularTransport = toModularTransport(`${MODULAR_URL}/${destChainSlug}`, clientKey)
        const publicClient     = createPublicClient({ chain: destViemChain, transport: modularTransport })
        const passkeyTransport = toPasskeyTransport(MODULAR_URL, clientKey)
        const credential       = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })
        const account          = await toCircleSmartAccount({ client: publicClient, owner: toWebAuthnAccount({ credential }) })
        const bundlerClient    = createBundlerClient({ account, chain: destViemChain, transport: modularTransport })
        const destMinter       = getProtocolContractByName('GatewayMinter', 'testnet')?.address ?? GATEWAY_MINTER

        // Resolve factory args so the bundler can deploy the SCA on first use
        const factoryArgs = await account.getFactoryArgs()
        const deployFields = factoryArgs.factory
          ? { factory: factoryArgs.factory, factoryData: factoryArgs.factoryData }
          : {}

        const isPaymasterErr = (e: unknown) => {
          const err = e as { code?: number; name?: string; shortMessage?: string; message?: string } | undefined
          return err?.code === -32603 || err?.name === 'InternalRpcError'
            || /internal error/i.test(err?.shortMessage ?? err?.message ?? '')
            || /paymaster/i.test(err?.shortMessage ?? err?.message ?? '')
        }
        let uoh: `0x${string}`
        try {
          uoh = await bundlerClient.sendUserOperation({
            account,
            calls: [{ to: destMinter as `0x${string}`, data: mintCallData, value: 0n }],
            paymaster: true,
            ...deployFields,
          })
        } catch (pmErr: unknown) {
          if (!isPaymasterErr(pmErr)) throw pmErr
          uoh = await bundlerClient.sendUserOperation({
            account,
            calls: [{ to: destMinter as `0x${string}`, data: mintCallData, value: 0n }],
            ...deployFields,
          })
        }
        const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: uoh })
        txHash = receipt.receipt.transactionHash
      } else {
        const destMinter = getProtocolContractByName('GatewayMinter', 'testnet')?.address ?? GATEWAY_MINTER
        const result = await circleTx.executeContract({ contractAddress: destMinter, callData: mintCallData })
        txHash = result ?? undefined
      }

      setMintTxHash(txHash)
      setPhase('done')
      toast.success(`Transferred ${amount} USDC to ${destChain.name}`)
      setTimeout(onSuccess, 2000)
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Transfer failed.')
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); setMintTxHash(undefined) }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:32, height:32, borderRadius:9, background:`rgba(0,102,255,0.12)`, border:`1px solid rgba(0,102,255,0.20)`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <ArrowLeftRight size={15} color={BLUE} />
        </div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Transfer USDC</div>
          <div style={{ fontSize:11, color:T2 }}>Burn on Arc, mint on destination — instant via Gateway</div>
        </div>
      </div>

      <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>
          Signs a <strong>Gateway BurnIntent</strong> using your {isPasskey ? 'passkey' : 'Circle wallet'}, submits to the Gateway API, then mints on the destination chain. Instant — no CCTP wait.
        </div>
      </div>

      {/* Source */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:11, color:T3, marginBottom:4, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>From</div>
        <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Arc Testnet</div>
        <div style={{ fontSize:12, color:T2, marginTop:2 }}>Gateway balance: <strong style={{ color:TEXT }}>{gwBal.toFixed(2)} USDC</strong></div>
      </div>

      <DestChainSelector chains={DEST_CHAINS} value={destChainId} onChange={setDestChainId} disabled={phase !== 'idle'} />

      {/* Amount */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Amount (USDC)</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'12px 56px 12px 14px', border:`1px solid ${BDR}`, borderRadius:10, background:SURF2, color:TEXT, fontSize:16, fontWeight:600, fontFamily:F, boxSizing:'border-box', outline:'none' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
          <span style={{ fontSize:11, color:T2 }}>Gateway balance: <strong style={{ color:TEXT }}>{gwBal.toFixed(2)} USDC</strong></span>
          {gwBal > 0 && <button onClick={() => setAmount(gwBal.toFixed(6))} style={{ fontSize:11, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'7px 0', border:`1px solid ${amount===v?BLUE:BDR}`, borderRadius:8, background:amount===v?'rgba(0,102,255,0.12)':SURF, color:amount===v?BLUE:T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600 }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {phase !== 'idle' && (
        <div style={{ border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label: isPasskey ? 'Sign BurnIntent (passkey)' : 'Sign BurnIntent (Circle wallet)', done: ['submitting','minting','done'].includes(phase), active: phase==='signing'    },
            { label:'Submit to Gateway API',                                                        done: ['minting','done'].includes(phase),             active: phase==='submitting' },
            { label:`gatewayMint on ${destChain?.name}`,                                           done: phase==='done',                                 active: phase==='minting'   },
          ].map((s, i) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom: i<2?`1px solid ${BDR}`:'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done?BLUE:SURF2, border:`1px solid ${s.done?BLUE:BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={13} color="#fff" /> : s.active ? <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color:TEXT }}>{s.label}</span>
              {s.done && i===2 && mintTxHash && destChain && (
                <a href={`${destChain.explorerBase}/tx/${mintTxHash}`} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
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

      {gwBal <= 0 && phase === 'idle' && (
        <div style={{ background:`rgba(0,102,255,0.06)`, border:`1px solid rgba(0,102,255,0.15)`, borderRadius:10, padding:'10px 14px', fontSize:12, color:T2 }}>
          Your Gateway balance is 0. Deposit USDC first to transfer cross-chain.
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Transfer again</button>
      ) : (
        <button onClick={() => void handleTransfer()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle' || gwBal<=0}
          style={{ width:'100%', padding:'14px 0', borderRadius:14, fontSize:14, fontWeight:600, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle'||gwBal<=0)?'not-allowed':'pointer', background:(!amount||phase!=='idle'||gwBal<=0)?SURF:BLUE, color:(!amount||phase!=='idle'||gwBal<=0)?T2:'#fff', transition:'all 0.15s' }}>
          {phase==='signing'?'Sign in wallet…':phase==='submitting'?'Submitting to Gateway…':phase==='minting'?'Minting on destination…':`Transfer ${amount||'0.00'} USDC to ${destChain?.name ?? '…'}`}
        </button>
      )}
    </div>
  )
}
