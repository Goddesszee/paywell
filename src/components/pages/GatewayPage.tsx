import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowLeftRight, ExternalLink, Check, AlertCircle, Copy, Info, ChevronDown } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
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
const BLUE = '#0866F5'
const BLUE_DIM = 'rgba(8,102,245,0.10)'
const BLUE_BD  = 'rgba(8,102,245,0.20)'
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
  domain: { name: 'GatewayWallet', version: '1' } as const,
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
  } as const,
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

// Domain IDs for testnet — must match Circle's CCTP domain registry exactly.
// Arbitrum Sepolia is domain 3 but has no cctpDomain in onchain-facts; add it here
// so DOMAIN_MAP[421614] is never undefined when it is chosen as the destination.
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
// Circle Gateway balance API: POST /v1/balances
// Omitting `domain` from each source returns balances across ALL domains for
// that depositor in a single round-trip — no need to fan out per domain.
// Returns { available, pending } where pending = unfinalized deposits.
async function fetchGatewayBalance(address: string): Promise<{ available: string; pending: string }> {
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address }] }),
  })
  if (!res.ok) return { available: '0.000000', pending: '0.000000' }
  const json = await res.json() as {
    balances?: { balance?: string; pendingBatch?: string }[]
  }
  let available = 0
  let pending = 0
  for (const b of json.balances ?? []) {
    available += parseFloat(b.balance ?? '0')
    pending   += parseFloat(b.pendingBatch ?? '0')
  }
  return { available: available.toFixed(6), pending: pending.toFixed(6) }
}


/**
 * Submit a burn intent to the Gateway API and return attestation + signature.
 * Body is an array of { burnIntent, signature, contractSigner? } per the Circle reference.
 * Pass contractSigner=true for SCA/ERC-1271 signers (passkey, modular wallets).
 * bigints are serialised as decimal strings via the JSON replacer.
 */
async function submitBurnIntent(
  burnIntent: unknown,
  signature: string,
  contractSigner = false,
  enableForwarder = false,
): Promise<{ attestation: `0x${string}` | null; signature: `0x${string}` | null; transferId?: string }> {
  const item: Record<string, unknown> = { burnIntent, signature }
  if (contractSigner) item.contractSigner = true

  const url = enableForwarder ? `${GATEWAY_API}/transfer?enableForwarder=true` : `${GATEWAY_API}/transfer`
  const res = await fetch(url, {
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

  // Inline response (non-forwarded): attestation + signature at top level
  if (json.attestation && json.signature) {
    return { attestation: json.attestation, signature: json.signature, transferId: json.transferId }
  }

  // Forwarding Service or async response — poll GET /v1/transfer/{id}.
  // When enableForwarder=true Circle mints on the destination chain; the caller
  // should treat attestation=null as "forwarded, no manual mint needed".
  const transferId = json.transferId
  if (!transferId) throw new Error('Gateway API returned no attestation and no transferId')

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const poll = await fetch(`${GATEWAY_API}/transfer/${transferId}`)
      if (!poll.ok) continue
      const record = await poll.json() as {
        status?: string
        message?: string
        attestation?: { payload?: `0x${string}`; signature?: `0x${string}` }
      }
      // Terminal failure — surface immediately
      if (record.status === 'failed') {
        throw new Error(`Gateway transfer failed: ${record.message ?? 'unknown reason'}`)
      }
      // Forwarded: 'confirmed' or 'finalized' means the forwarder minted on dest
      if (enableForwarder && (record.status === 'confirmed' || record.status === 'finalized')) {
        return { attestation: null, signature: null, transferId }
      }
      // Non-forwarded async: attestation arrives in the record once confirmed
      const att = record.attestation
      if (att?.payload && att?.signature) {
        return { attestation: att.payload, signature: att.signature, transferId }
      }
    } catch (e) {
      if ((e as Error)?.message?.startsWith('Gateway transfer failed')) throw e
      // network blip — keep polling
    }
  }
  throw new Error('Timed out waiting for Gateway attestation. Your funds are safe — check your balance in a few minutes.')
}

type Tab = 'balance' | 'deposit' | 'transfer'

/**
 * Applies an amount / destination chain requested by the NAN Agent ("deposit 20 USDC to Gateway",
 * "transfer 5 USDC to Base") when a tab mounts, then clears it. The user still confirms with the
 * button — nothing is sent without their approval.
 */
function useGatewayPrefill(
  mode: 'deposit' | 'transfer',
  setAmount: (v: string) => void,
  setDestChainId?: (id: number) => void,
) {
  useEffect(() => {
    const gp = useAppStore.getState().gatewayPrefill
    if (!gp || gp.mode !== mode) return
    if (gp.amount) setAmount(gp.amount)
    if (gp.toChain && setDestChainId) {
      const q = gp.toChain.toLowerCase().replace(/[^a-z ]/g, ' ').trim()
      const hit = GATEWAY_CHAINS.find(c => c.chainId !== ARC && q && (
        c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0])))
      if (hit) setDestChainId(hit.chainId)
    }
    useAppStore.getState().setGatewayPrefill(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>(() => useAppStore.getState().gatewayPrefill?.mode ?? 'balance')
  const [infoOpen, setInfoOpen] = useState(false)
  const { address: wagmiAddress } = useAccount()
  const { auth } = useAppStore()

  const isCircleUser = !!(
    auth?.isPasskeyUser ||
    auth?.userToken ||
    auth?.circleWalletAddress ||
    auth?.circleWalletId
  )
  const address = isCircleUser
    ? (auth?.circleWalletAddress as `0x${string}` | undefined)
    : wagmiAddress
  const usdcFact = getUsdc(ARC)

  const [gatewayBalance, setGatewayBalance] = useState<{ available: string; pending: string } | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

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
      setGatewayBalance({ available: '0.000000', pending: '0.000000' }) // eslint-disable-line react/set-state-in-effect
    } finally {
      setBalanceLoading(false) // eslint-disable-line react/set-state-in-effect
    }
  }

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (address) { void doFetchBalance(address) } }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadGatewayBalance = () => { if (address) void doFetchBalance(address) }
  const refetchAll = () => { void refetchWallet(); loadGatewayBalance() }
  const isLoading = walletLoading || balanceLoading

  const gwAvail   = gatewayBalance?.available ?? null
  const gwPending = gatewayBalance?.pending   ?? null
  const display   = gwAvail   ? parseFloat(gwAvail).toFixed(2)   : '0.00'
  const pending   = gwPending ? parseFloat(gwPending).toFixed(2) : '0.00'
  const hasPending = parseFloat(pending) > 0
  const handleBack = () => { refetchAll(); setTab('balance') }

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', paddingBottom: 88 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'20px 0 18px' }}>
        <div style={{ width:38, height:38, borderRadius:11, background:BLUE, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:`0 4px 14px rgba(8,102,245,0.35)` }}>
          <Layers size={18} color="#fff" />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:TEXT, letterSpacing:'-0.025em' }}>Gateway</div>
          <div style={{ fontSize:12, color:T2, marginTop:1 }}>Circle Gateway · Unified USDC</div>
        </div>
        <button onClick={refetchAll} style={{ width:36, height:36, borderRadius:10, background:SURF, border:`1px solid ${BDR}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'background 0.15s' }}>
          <RefreshCw size={14} color={T2} />
        </button>
      </div>

      {/* ── Balance hero card ── */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:20, padding:'22px 22px 18px', marginBottom:14 }}>
        <div style={{ fontSize:10, fontWeight:700, color:T3, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12 }}>Gateway Balance</div>

        {!address ? (
          <div style={{ padding:'12px 0 8px' }}>
            <div style={{ fontSize:32, fontWeight:700, color:T3, fontVariantNumeric:'tabular-nums' }}>—</div>
            <div style={{ fontSize:12, color:T3, marginTop:6 }}>Connect your wallet to view your unified balance</div>
          </div>
        ) : isLoading ? (
          <div style={{ padding:'8px 0' }}>
            <div style={{ height:42, width:160, background:'rgba(255,255,255,0.06)', borderRadius:10, animation:'nan-shimmer 1.4s ease infinite', marginBottom:8 }} />
            <div style={{ height:14, width:100, background:'rgba(255,255,255,0.04)', borderRadius:6, animation:'nan-shimmer 1.4s ease infinite' }} />
          </div>
        ) : (
          <>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ fontSize:42, fontWeight:800, color:TEXT, letterSpacing:'-0.04em', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{display}</span>
              <span style={{ fontSize:16, fontWeight:600, color:T3, letterSpacing:'0.02em' }}>USDC</span>
            </div>
            {hasPending && (
              <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#F59E0B' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#F59E0B', flexShrink:0 }} />
                {pending} USDC pending finalization
              </div>
            )}
            {!hasPending && (
              <div style={{ marginTop:6, fontSize:12, color:T3 }}>
                {parseFloat(display) > 0 ? 'Available across all supported chains' : 'Deposit USDC to build your unified balance'}
              </div>
            )}
          </>
        )}

        {address && (
          <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${BDR}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:11, color:T3, fontFamily:MONO }}>{address.slice(0,8)}…{address.slice(-6)}</span>
            <span style={{ fontSize:11, color:T3 }}>Arc Testnet</span>
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <button
          onClick={() => setTab(tab === 'deposit' ? 'balance' : 'deposit')}
          style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px 0', borderRadius:14, border: tab==='deposit' ? 'none' : `1px solid ${BDR}`, background: tab==='deposit' ? BLUE : SURF, color: tab==='deposit' ? '#fff' : TEXT, fontSize:14, fontWeight:600, fontFamily:F, cursor:'pointer', transition:'all 0.15s', boxShadow: tab==='deposit' ? `0 4px 16px rgba(8,102,245,0.28)` : 'none' }}>
          <ArrowDownToLine size={15} />
          Deposit
        </button>
        <button
          onClick={() => setTab(tab === 'transfer' ? 'balance' : 'transfer')}
          style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px 0', borderRadius:14, border: tab==='transfer' ? `1px solid ${BLUE}` : `1px solid ${BDR}`, background: tab==='transfer' ? BLUE_DIM : SURF, color: tab==='transfer' ? BLUE : TEXT, fontSize:14, fontWeight:600, fontFamily:F, cursor:'pointer', transition:'all 0.15s' }}>
          <ArrowLeftRight size={15} />
          Transfer
        </button>
      </div>

      {/* ── Action panels ── */}
      {tab === 'deposit' && (!isCircleUser && wagmiAddress
        ? <DepositTab address={address} walletBalance={walletBalance} usdcFact={usdcFact} onSuccess={handleBack} />
        : <CircleDepositTab address={address} walletBalance={walletBalance} usdcFact={usdcFact} onSuccess={handleBack} />)}
      {tab === 'transfer' && (!isCircleUser && wagmiAddress
        ? <TransferTab address={wagmiAddress} gatewayBalance={gwAvail} onSuccess={handleBack} />
        : <CircleTransferTab address={address} gatewayBalance={gwAvail} onSuccess={handleBack} />)}

      {/* ── Idle state: wallet balance + info panel ── */}
      {tab === 'balance' && address && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:13, color:T2 }}>Wallet USDC</span>
          <span style={{ fontSize:14, fontWeight:700, color:TEXT, fontVariantNumeric:'tabular-nums' }}>
            {isLoading ? '…' : `${walletBalance ? parseFloat(walletBalance).toFixed(2) : '0.00'} USDC`}
          </span>
        </div>
      )}

      {tab === 'balance' && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, overflow:'hidden' }}>
          <button
            onClick={() => setInfoOpen(o => !o)}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'transparent', border:'none', cursor:'pointer', fontFamily:F }}>
            <span style={{ fontSize:13, fontWeight:600, color:TEXT }}>What is Gateway?</span>
            <ChevronDown size={15} color={T2} style={{ transform: infoOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
          </button>
          {infoOpen && (
            <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${BDR}` }}>
              <div style={{ fontSize:13, color:T2, lineHeight:1.65, paddingTop:12 }}>
                Circle Gateway holds a unified USDC balance across multiple chains. Deposit on any supported chain and transfer instantly to any other — no CCTP wait time, no destination-chain gas required.
              </div>
              <div style={{ marginTop:12, display:'flex', gap:6, flexWrap:'wrap' }}>
                {['Arc', 'Ethereum', 'Base', 'Arbitrum', 'Polygon', 'OP', 'Avalanche', 'Unichain'].map(c => (
                  <span key={c} style={{ fontSize:11, fontWeight:600, color:BLUE, background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:20, padding:'3px 10px' }}>{c}</span>
                ))}
              </div>
            </div>
          )}
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
  const { chainId } = useAccount()
  const [amount, setAmount] = useState('')
  useGatewayPrefill('deposit', setAmount)
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
      if (chainId !== ARC) {
        const arcChainInfo = ONCHAIN_CHAINS.find(c => c.chainId === ARC)!
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await (window as any).ethereum?.request({ method: 'wallet_addEthereumChain', params: [{ chainId: `0x${ARC.toString(16)}`, chainName: arcChainInfo.name, nativeCurrency: arcChainInfo.nativeCurrency, rpcUrls: arcChainInfo.rpcUrls, blockExplorerUrls: [arcChainInfo.explorerBase] }] })
      }
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
    <div style={{ textAlign:'center', padding:'40px 0', color:T3 }}>
      <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Connect your wallet to deposit</div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:12, padding:'11px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.55 }}>
          Approves USDC spend then calls <strong style={{ color:TEXT }}>GatewayWallet.deposit</strong> — credits your unified cross-chain balance.
        </div>
      </div>

      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Amount</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'13px 58px 13px 14px', border:`1px solid ${amount ? BLUE_BD : BDR}`, borderRadius:12, background:SURF2, color:TEXT, fontSize:22, fontWeight:700, fontFamily:F, boxSizing:'border-box', outline:'none', fontVariantNumeric:'tabular-nums', transition:'border-color 0.15s' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:7 }}>
          <span style={{ fontSize:12, color:T2 }}>Available: <strong style={{ color:TEXT, fontVariantNumeric:'tabular-nums' }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></span>
          {walletBalance && <button onClick={() => setAmount(parseFloat(walletBalance).toFixed(6))} style={{ fontSize:12, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'8px 0', border:`1px solid ${amount===v ? BLUE : BDR}`, borderRadius:10, background:amount===v ? BLUE_DIM : SURF, color:amount===v ? BLUE : T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, transition:'all 0.12s' }}>{v}</button>
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label:'Approve USDC spend', done: phase==='depositing'||phase==='done', active: phase==='approving' },
            { label:'Deposit to Gateway', done: phase==='done', active: phase==='depositing' },
          ].map((s,i) => (
            <div key={i} style={{ padding:'12px 16px', borderBottom: i===0 ? `1px solid ${BDR}` : 'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done ? BLUE : SURF2, border:`1px solid ${s.done ? BLUE : BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={12} color="#fff" /> : s.active ? <div style={{ width:11, height:11, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color: s.active ? TEXT : s.done ? TEXT : T2 }}>{s.label}</span>
              {s.done && i===1 && depositTxHash && (
                <a href={buildTxExplorerUrl(ARC, depositTxHash)} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={14} color="#EF4444" style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:'#EF4444' }}>{errMsg}</span>
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Deposit again</button>
      ) : (
        <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle'}
          style={{ width:'100%', padding:'15px 0', borderRadius:14, fontSize:15, fontWeight:700, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle') ? 'not-allowed' : 'pointer', background:(!amount||phase!=='idle') ? SURF : BLUE, color:(!amount||phase!=='idle') ? T2 : '#fff', transition:'all 0.15s', boxShadow:(!amount||phase!=='idle') ? 'none' : `0 4px 16px rgba(8,102,245,0.30)` }}>
          {phase==='approving' ? 'Approving…' : phase==='depositing' ? 'Depositing…' : `Deposit ${amount||'0.00'} USDC`}
        </button>
      )}
      <div style={{ fontSize:11, color:T3, textAlign:'center' }}>Powered by Circle Gateway</div>
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
  useGatewayPrefill('deposit', setAmount)
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
      <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:12, padding:'11px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.55 }}>
          Approve + deposit batched into <strong style={{ color:TEXT }}>one user operation</strong> — a single passkey prompt covers both steps.
        </div>
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Amount</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={busy}
            style={{ width:'100%', padding:'13px 58px 13px 14px', border:`1px solid ${amount ? BLUE_BD : BDR}`, borderRadius:12, background:SURF2, color:TEXT, fontSize:22, fontWeight:700, fontFamily:F, boxSizing:'border-box', outline:'none', fontVariantNumeric:'tabular-nums', transition:'border-color 0.15s' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ fontSize:12, color:T2, marginTop:7 }}>Available: <strong style={{ color:TEXT, fontVariantNumeric:'tabular-nums' }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={busy}
              style={{ flex:1, padding:'8px 0', border:`1px solid ${amount===v ? BLUE : BDR}`, borderRadius:10, background:amount===v ? BLUE_DIM : SURF, color:amount===v ? BLUE : T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, transition:'all 0.12s' }}>{v}</button>
          ))}
        </div>
      </div>
      {errMsg && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#EF4444' }}>{errMsg}</div>
      )}
      {busy && (
        <div style={{ fontSize:13, color:T2, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite', flexShrink:0 }} />
          Confirm with your passkey…
        </div>
      )}
      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Deposit again</button>
      ) : (
        <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || busy}
          style={{ width:'100%', padding:'15px 0', borderRadius:14, fontSize:15, fontWeight:700, border:'none', fontFamily:F, cursor:(!amount||busy) ? 'not-allowed' : 'pointer', background:(!amount||busy) ? SURF : BLUE, color:(!amount||busy) ? T2 : '#fff', transition:'all 0.15s', boxShadow:(!amount||busy) ? 'none' : `0 4px 16px rgba(8,102,245,0.30)` }}>
          {busy ? 'Processing…' : `Deposit ${amount||'0.00'} USDC`}
        </button>
      )}
    </div>
  )
}

// Multicall3 on Arc Testnet — kept for reference
const _MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
void _MULTICALL3
const _MULTICALL3_ABI = [{
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

// W3S SDK (user-controlled wallet) deposit — approve, then deposit (two Circle approvals)
function W3SDepositTab({ address, walletBalance, usdcFact, onSuccess }: {
  address?: string; walletBalance: string|null
  usdcFact: { address: string } | undefined; onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  useGatewayPrefill('deposit', setAmount)
  const circleTx = useCircleTransaction()
  const { status, error } = circleTx
  const busy = status === 'creating' || status === 'approving' || status === 'polling'
  const decimals = 6

  const handleDeposit = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !usdcFact) return
    const parsed = parseUnits(amount, decimals)
    const { encodeFunctionData, erc20Abi: abi } = await import('viem')

    // Two separate Circle transactions: approve USDC, then deposit.
    // NOTE: do NOT batch these through Multicall3 — for a Circle smart-account wallet, Multicall3
    // becomes msg.sender, so the approval would come from Multicall3 (no funds) and the deposit's
    // transferFrom would revert.
    const approveCallData = encodeFunctionData({ abi, functionName: 'approve', args: [GATEWAY_WALLET, parsed] })
    const depositCallData = encodeFunctionData({
      abi: GATEWAY_WALLET_ABI,
      functionName: 'deposit',
      args: [usdcFact.address as `0x${string}`, parsed],
    })
    const approved = await circleTx.executeContract({ contractAddress: usdcFact.address, callData: approveCallData })
    if (!approved) return
    const result = await circleTx.executeContract({ contractAddress: GATEWAY_WALLET, callData: depositCallData })
    if (result) { toast.success(`Deposited ${amount} USDC to Gateway`); onSuccess() }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:12, padding:'11px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.55 }}>Two Circle approvals required: first USDC spending, then the deposit.</div>
      </div>
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Amount</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={busy}
            style={{ width:'100%', padding:'13px 58px 13px 14px', border:`1px solid ${amount ? BLUE_BD : BDR}`, borderRadius:12, background:SURF2, color:TEXT, fontSize:22, fontWeight:700, fontFamily:F, boxSizing:'border-box', outline:'none', fontVariantNumeric:'tabular-nums', transition:'border-color 0.15s' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ fontSize:12, color:T2, marginTop:7 }}>Available: <strong style={{ color:TEXT, fontVariantNumeric:'tabular-nums' }}>{walletBalance ? parseFloat(walletBalance).toFixed(2) : '—'} USDC</strong></div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={busy}
              style={{ flex:1, padding:'8px 0', border:`1px solid ${amount===v ? BLUE : BDR}`, borderRadius:10, background:amount===v ? BLUE_DIM : SURF, color:amount===v ? BLUE : T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, transition:'all 0.12s' }}>{v}</button>
          ))}
        </div>
      </div>
      {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#EF4444' }}>{error}</div>}
      {busy && <div style={{ fontSize:13, color:T2, display:'flex', alignItems:'center', gap:7 }}><div style={{ width:11, height:11, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite', flexShrink:0 }} />{status === 'approving' ? 'Approve in Circle popup…' : status === 'polling' ? 'Confirming on-chain…' : 'Preparing…'}</div>}
      <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount)<=0 || busy}
        style={{ width:'100%', padding:'15px 0', borderRadius:14, fontSize:15, fontWeight:700, border:'none', fontFamily:F, cursor:(!amount||busy) ? 'not-allowed' : 'pointer', background:(!amount||busy) ? SURF : BLUE, color:(!amount||busy) ? T2 : '#fff', transition:'all 0.15s', boxShadow:(!amount||busy) ? 'none' : `0 4px 16px rgba(8,102,245,0.30)` }}>
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
      <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Destination</div>
      <div style={{ position:'relative' }}>
        <button
          type="button"
          onClick={() => { if (!disabled) setOpen(o => !o) }}
          disabled={disabled}
          style={{
            width:'100%', padding:'13px 40px 13px 14px',
            border:`1px solid ${open ? BLUE : BDR}`, borderRadius:12,
            background:SURF2, color:TEXT, fontSize:14, fontWeight:600,
            fontFamily:F, textAlign:'left', cursor: disabled ? 'not-allowed' : 'pointer',
            outline:'none', display:'flex', alignItems:'center', justifyContent:'space-between',
            boxSizing:'border-box', transition:'border-color 0.15s',
          }}
        >
          <span>{selected?.name ?? 'Select chain'}</span>
          <ChevronDown size={14} color={T2} style={{ flexShrink:0, transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
        </button>
        {open && (
          <div style={{
            position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:50,
            background:SURF2, border:`1px solid ${BDR}`, borderRadius:12,
            overflow:'hidden', boxShadow:'0 12px 32px rgba(0,0,0,0.5)',
          }}>
            {chains.map(c => (
              <button
                key={c.chainId}
                type="button"
                onClick={() => { onChange(c.chainId); setOpen(false) }}
                style={{
                  width:'100%', padding:'12px 14px', border:'none',
                  background: c.chainId === value ? BLUE_DIM : 'transparent',
                  color: c.chainId === value ? BLUE : TEXT,
                  fontSize:14, fontWeight: c.chainId === value ? 700 : 400,
                  fontFamily:F, textAlign:'left', cursor:'pointer', display:'flex',
                  alignItems:'center', justifyContent:'space-between',
                  borderBottom: chains[chains.length-1]?.chainId === c.chainId ? 'none' : `1px solid ${BDR}`,
                }}
              >
                <span>{c.name}</span>
                {c.chainId === value && <Check size={14} color={BLUE} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Transfer tab (EVM-to-EVM via Gateway burn intent + gatewayMint) ────────────
// Per Circle docs, the Forwarding Service handles the dest-chain mint —
// the user only needs Arc Testnet native tokens (USDC) to sign.
// No dest-chain gas required at all.
type TransferPhase = 'idle' | 'estimating' | 'signing' | 'submitting' | 'minting' | 'forwarding' | 'done' | 'error'

function TransferTab({ address, gatewayBalance, onSuccess }: {
  address: `0x${string}`; gatewayBalance: string|null; onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [destChainId, setDestChainId] = useState<number>(84532)
  useGatewayPrefill('transfer', setAmount, setDestChainId)
  const [phase, setPhase] = useState<TransferPhase>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [transferId, setTransferId] = useState<string | undefined>()
  const gwBal = gatewayBalance ? parseFloat(gatewayBalance) : 0

  const destChain = GATEWAY_CHAINS.find(c => c.chainId === destChainId)
  const srcChain  = GATEWAY_CHAINS.find(c => c.chainId === ARC)

  const handleTransfer = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !destChain?.usdc || !srcChain?.usdc) return
    if (!destChainId || isNaN(destChainId) || destChainId === ARC) { toast.error('Select a different destination chain'); return }
    setErrMsg(''); setTransferId(undefined)
    const parsed = parseUnits(amount, 6)
    const srcDomain  = DOMAIN_MAP[ARC] ?? 26
    const destDomain = DOMAIN_MAP[destChainId]
    if (destDomain === undefined) { setErrMsg('Destination chain domain unknown'); return }

    // All wallet calls go through window.ethereum directly.
    // wagmi/viem hooks call assertCurrentChain which reads connector.chain.id —
    // on MetaMask mobile in-app browser that value is permanently NaN.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const provider = (window as any).ethereum
    if (!provider) { setErrMsg('No injected wallet — please open in MetaMask browser'); return }

    // Switch chain without going through viem's chain-ID validator.
    const switchToChain = async (chainId: number) => {
      const hexId = `0x${chainId.toString(16)}`
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] })
      } catch (e) {
        if ((e as { code?: number })?.code !== 4902) throw e
        const chain = ONCHAIN_CHAINS.find(c => c.chainId === chainId)
        if (!chain) throw new Error(`Chain ${chainId} not configured`)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: hexId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls, blockExplorerUrls: [chain.explorerBase] }],
        })
      }
    }

    try {
      // Build the spec (addresses NOT yet padded — padded version used for API calls)
      const spec = {
        version:              1,
        sourceDomain:         srcDomain,
        destinationDomain:    destDomain,
        sourceContract:       GATEWAY_WALLET,
        destinationContract:  GATEWAY_MINTER,
        sourceToken:          srcChain.usdc.address as `0x${string}`,
        destinationToken:     destChain.usdc.address as `0x${string}`,
        sourceDepositor:      address,
        destinationRecipient: address,
        sourceSigner:         address,
        destinationCaller:    zeroAddress,
        value:                parsed,
        salt:                 randomHex32(),
        hookData:             '0x' as `0x${string}`,
      }

      // Padded spec — bytes32 fields as per Circle docs
      const specBytes32 = {
        ...spec,
        sourceContract:       toBytes32(spec.sourceContract),
        destinationContract:  toBytes32(spec.destinationContract),
        sourceToken:          toBytes32(spec.sourceToken),
        destinationToken:     toBytes32(spec.destinationToken),
        sourceDepositor:      toBytes32(spec.sourceDepositor),
        destinationRecipient: toBytes32(spec.destinationRecipient),
        sourceSigner:         toBytes32(spec.sourceSigner),
        destinationCaller:    toBytes32(spec.destinationCaller),
      }

      // ── Step 1: Estimate fees (Circle docs: always estimate before signing) ──
      setPhase('estimating')
      const estimateRes = await fetch(`${GATEWAY_API}/estimate?enableForwarder=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        body: JSON.stringify([{ spec: specBytes32 }], (_k, v) => typeof v === 'bigint' ? v.toString() : v),
      })
      if (!estimateRes.ok) throw new Error(`Estimate failed: ${await estimateRes.text()}`)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const estimateJson = await estimateRes.json()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const estimated = estimateJson?.body?.[0]?.burnIntent
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      const maxFee         = BigInt(estimated?.maxFee        ?? '7060000')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      const maxBlockHeight = BigInt(estimated?.maxBlockHeight ?? (2n ** 256n - 1n).toString())

      const burnIntent = { maxBlockHeight, maxFee, spec: specBytes32 }

      // ── Step 2: Switch to Arc and sign ──────────────────────────────────────
      setPhase('signing')
      await switchToChain(ARC)

      // eth_signTypedData_v4 directly on provider — bypasses assertCurrentChain entirely
      const typedDataStr = JSON.stringify(
        { domain: BURN_INTENT_TYPED_DATA.domain, types: BURN_INTENT_TYPED_DATA.types, primaryType: BURN_INTENT_TYPED_DATA.primaryType, message: burnIntent },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        (_k, v) => typeof v === 'bigint' ? `0x${v.toString(16)}` : v,
      )
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const signature: string = await provider.request({ method: 'eth_signTypedData_v4', params: [address, typedDataStr] })

      // ── Step 3: Submit with enableForwarder=true ────────────────────────────
      // The Forwarding Service handles the dest-chain mint — no dest-chain tx needed.
      setPhase('submitting')
      const transferRes = await fetch(`${GATEWAY_API}/transfer?enableForwarder=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          [{ burnIntent, signature }],
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          (_k, v) => typeof v === 'bigint' ? v.toString() : v,
        ),
      })
      if (!transferRes.ok) throw new Error(`Gateway API error: ${await transferRes.text()}`)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const transferJson = await transferRes.json()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const tid: string = transferJson?.transferId
      if (!tid) throw new Error('Gateway API returned no transferId')
      setTransferId(tid)

      // ── Step 4: Poll until confirmed/finalized ──────────────────────────────
      // Circle Forwarding Service mints on dest chain — we just poll.
      setPhase('forwarding')
      const POLL_INTERVAL = 5_000
      const POLL_TIMEOUT  = 300_000
      const pollStart = Date.now()
      while (Date.now() - pollStart < POLL_TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL))
        const pollRes  = await fetch(`${GATEWAY_API}/transfer/${tid}`)
        if (!pollRes.ok) continue
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const details  = await pollRes.json()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const status   = details?.status as string | undefined
        if (status === 'confirmed' || status === 'finalized') {
          setPhase('done')
          toast.success(`Transferred ${amount} USDC to ${destChain?.name ?? 'destination'}`)
          setTimeout(onSuccess, 2000)
          return
        }
        if (status === 'failed') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const reason = (details?.forwardingDetails as { failureReason?: string } | undefined)?.failureReason ?? 'unknown'
          throw new Error(`Transfer failed: ${reason}`)
        }
        if (status === 'expired') throw new Error('Transfer attestation expired before forwarding completed')
      }
      throw new Error('Timed out waiting for forwarding. Your balance is intact — check Gateway balance and retry.')

    } catch (e: unknown) {
      setPhase('error')
      const msg = (e as { message?: string })?.message ?? 'Transfer failed.'
      setErrMsg(msg.includes('User rejected') || msg.includes('user rejected')
        ? 'Wallet prompt rejected — tap Transfer again to retry.'
        : msg)
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); setTransferId(undefined) }

  const DEST_CHAINS = GATEWAY_CHAINS.filter(c => c.chainId !== ARC)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:12, padding:'11px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.55 }}>
          Signs a <strong style={{ color:TEXT }}>Gateway BurnIntent</strong> on Arc. Circle's Forwarding Service mints on the destination — <strong style={{ color:TEXT }}>no dest-chain gas needed</strong>.
        </div>
      </div>

      {/* From / To route card */}
      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BDR}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:T3, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:3 }}>From</div>
            <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Arc Testnet</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:700, color:T3, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:3 }}>Gateway Balance</div>
            <div style={{ fontSize:14, fontWeight:700, color:TEXT, fontVariantNumeric:'tabular-nums' }}>{gwBal.toFixed(2)} USDC</div>
          </div>
        </div>
        <div style={{ padding:'12px 16px' }}>
          <DestChainSelector chains={DEST_CHAINS} value={destChainId} onChange={setDestChainId} disabled={phase !== 'idle'} />
        </div>
      </div>

      {/* Amount */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Amount</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'13px 58px 13px 14px', border:`1px solid ${amount ? BLUE_BD : BDR}`, borderRadius:12, background:SURF2, color:TEXT, fontSize:22, fontWeight:700, fontFamily:F, boxSizing:'border-box', outline:'none', fontVariantNumeric:'tabular-nums', transition:'border-color 0.15s' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:7 }}>
          <span style={{ fontSize:12, color:T2 }}>Available: <strong style={{ color:TEXT, fontVariantNumeric:'tabular-nums' }}>{gwBal.toFixed(2)} USDC</strong></span>
          {gwBal > 0 && <button onClick={() => setAmount(gwBal.toFixed(6))} style={{ fontSize:12, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'8px 0', border:`1px solid ${amount===v ? BLUE : BDR}`, borderRadius:10, background:amount===v ? BLUE_DIM : SURF, color:amount===v ? BLUE : T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, transition:'all 0.12s' }}>{v}</button>
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label:'Estimate fees',                                      done: ['signing','submitting','forwarding','done'].includes(phase), active: phase==='estimating' },
            { label:'Sign BurnIntent',                                    done: ['submitting','forwarding','done'].includes(phase),           active: phase==='signing'    },
            { label:'Submit to Gateway API',                              done: ['forwarding','done'].includes(phase),                       active: phase==='submitting' },
            { label:`Minting on ${destChain?.name ?? 'destination'}`,    done: phase==='done',                                              active: phase==='forwarding' },
          ].map((s, i) => (
            <div key={i} style={{ padding:'11px 16px', borderBottom: i<3 ? `1px solid ${BDR}` : 'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done ? BLUE : SURF2, border:`1px solid ${s.done ? BLUE : BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={12} color="#fff" /> : s.active ? <div style={{ width:11, height:11, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color: s.active ? TEXT : s.done ? TEXT : T2 }}>{s.label}</span>
              {s.done && i===3 && transferId && (
                <a href={`https://gateway-api-testnet.circle.com/v1/transfer/${transferId}`} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>Details <ExternalLink size={10} /></a>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={14} color="#EF4444" style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:'#EF4444' }}>{errMsg}</span>
        </div>
      )}

      {gwBal <= 0 && phase === 'idle' && (
        <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:10, padding:'11px 14px', fontSize:12, color:T2 }}>
          Gateway balance is 0. Deposit USDC first.
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Transfer again</button>
      ) : (
        <button onClick={() => void handleTransfer()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle' || gwBal<=0}
          style={{ width:'100%', padding:'15px 0', borderRadius:14, fontSize:15, fontWeight:700, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle'||gwBal<=0) ? 'not-allowed' : 'pointer', background:(!amount||phase!=='idle'||gwBal<=0) ? SURF : BLUE, color:(!amount||phase!=='idle'||gwBal<=0) ? T2 : '#fff', transition:'all 0.15s', boxShadow:(!amount||phase!=='idle'||gwBal<=0) ? 'none' : `0 4px 16px rgba(8,102,245,0.30)` }}>
          {phase==='estimating' ? 'Estimating fees…' : phase==='signing' ? 'Sign in wallet…' : phase==='submitting' ? 'Submitting…' : phase==='forwarding' ? 'Forwarding…' : `Transfer ${amount||'0.00'} USDC to ${destChain?.name ?? '…'}`}
        </button>
      )}

      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, padding:'12px 14px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:T3, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.1em' }}>Contracts</div>
        {[
          { label:'GatewayWallet', addr: GATEWAY_WALLET },
          { label:'GatewayMinter', addr: GATEWAY_MINTER },
        ].map(({ label, addr }) => (
          <div key={addr} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
            <span style={{ fontSize:11, color:T3, minWidth:90 }}>{label}</span>
            <span style={{ fontSize:11, fontFamily:MONO, color:T2, flex:1 }}>{addr.slice(0,10)}…{addr.slice(-6)}</span>
            <button onClick={() => { void navigator.clipboard.writeText(addr); toast.success('Copied') }} style={{ background:'none', border:'none', cursor:'pointer', color:T3, padding:2, marginLeft:'auto' }}>
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
// Passkey path: modular SDK signTypedData for signing; wagmi writeContract for gatewayMint
// W3S SDK path: useCircleTransaction signMessage (serialised typed data) + contract execution
function CircleTransferTab({ address, gatewayBalance, onSuccess }: {
  address?: string; gatewayBalance: string|null; onSuccess: () => void
}) {
  const { auth } = useAppStore()
  const isPasskey = !!auth?.isPasskeyUser
  const [amount, setAmount]           = useState('')
  const [destChainId, setDestChainId] = useState<number>(84532)
  useGatewayPrefill('transfer', setAmount, setDestChainId)
  const [phase, setPhase]             = useState<TransferPhase>('idle')
  const [errMsg, setErrMsg]           = useState('')
  const [mintTxHash, setMintTxHash]   = useState<string | undefined>() // 'forwarded' for forwarder path
  const circleTx = useCircleTransaction()


  const gwBal     = gatewayBalance ? parseFloat(gatewayBalance) : 0
  const DEST_CHAINS = GATEWAY_CHAINS.filter(c => c.chainId !== ARC)
  const destChain   = GATEWAY_CHAINS.find(c => c.chainId === destChainId)
  const srcChain    = GATEWAY_CHAINS.find(c => c.chainId === ARC)

  const handleTransfer = async () => {
    if (!address || !amount || parseFloat(amount) <= 0 || !destChain?.usdc || !srcChain?.usdc) return
    if (!destChainId || isNaN(destChainId) || destChainId === ARC) { toast.error('Select a different destination chain'); return }
    setErrMsg('')
    const srcDomain  = DOMAIN_MAP[ARC] ?? 26
    const destDomain = DOMAIN_MAP[destChainId]
    if (destDomain === undefined) { setErrMsg('Destination chain domain unknown'); return }

    try {
      setPhase('signing')

      // Build burn intent with bigints (required for viem signTypedData with uint256 fields).
      // For the UCW/Circle path we serialise to JSON string with bigint→string replacer.
      const burnIntent = {
        maxBlockHeight: 2n ** 256n - 1n,
        maxFee: 7_060000n, // covers forwarder fee (0.05) + gas (~0.01) + transfer fee
        spec: {
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
          value:                parseUnits(amount, 6),
          salt:                 randomHex32(),
          hookData:             '0x' as `0x${string}`,
        },
      }

      // JSON string for Circle UCW signTypedData — bigints become decimal strings.
      // Per Circle's sign-typed-data docs and the Gateway ERC-1271 how-to, `types` MUST include
      // EIP712Domain alongside TransferSpec and BurnIntent. Stripping it (as before) leaves Circle's
      // signer unable to build the domain separator, and the challenge fails.
      const typedDataStr = JSON.stringify(
        { types: BURN_INTENT_TYPED_DATA.types, domain: BURN_INTENT_TYPED_DATA.domain, primaryType: BURN_INTENT_TYPED_DATA.primaryType, message: burnIntent },
        (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v,
      )

      let signature: `0x${string}`

      if (isPasskey) {
        // ── Passkey path (Circle Modular Wallet / SCA) ────────────────────────
        // The modular SDK makes JSON-RPC calls to modular-sdk.circle.com which
        // requires the app domain to be whitelisted in Circle Console.
        // We route those calls through /api/gateway-proxy to avoid CORS failures.
        const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
        if (!clientKey) throw new Error('VITE_CLIENT_KEY not set — add it to your Vercel environment variables.')

        const { toWebAuthnAccount } = await import('viem/account-abstraction')
        const { toCircleSmartAccount, toWebAuthnCredential, WebAuthnMode, toPasskeyTransport, toModularTransport } = await import('@circle-fin/modular-wallets-core')
        const { createPublicClient: mkPublic, http: httpTransport } = await import('viem')
        const viemChains = await import('viem/chains')

        const MODULAR_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
        const arcChain = viemChains.arcTestnet ?? { id: ARC, name: 'Arc Testnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } } }

        // Use a plain HTTP public client for chain reads (nonce, receipts).
        // toModularTransport is only needed for user-op bundler calls — we pass
        // it to toCircleSmartAccount so signTypedData goes via the bundler correctly.
        const arcHttpClient = mkPublic({ chain: arcChain, transport: httpTransport('https://rpc.testnet.arc.io') })
        const arcModularTransport = toModularTransport(`${MODULAR_URL}/arcTestnet`, clientKey)
        const arcBundlerClient   = mkPublic({ chain: arcChain, transport: arcModularTransport })

        // Authenticate the passkey — toPasskeyTransport calls WebAuthn (browser-native,
        // not a CORS-blocked fetch) so this works from any origin.
        const passkeyTransport = toPasskeyTransport(MODULAR_URL, clientKey)
        const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
        const arcAccount = await (toCircleSmartAccount as any)({
          client: arcBundlerClient,
          owner: toWebAuthnAccount({ credential }),
        })
        void arcHttpClient

        // Sign the burn intent — EIP712Domain must NOT be in types (viem derives it)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        signature = await (arcAccount).signTypedData({
          domain:      BURN_INTENT_TYPED_DATA.domain,
          types:       { BurnIntent: BURN_INTENT_TYPED_DATA.types.BurnIntent, TransferSpec: BURN_INTENT_TYPED_DATA.types.TransferSpec } as const,
          primaryType: 'BurnIntent' as const,
          message:     burnIntent,
        })

        setPhase('submitting')
        // Submit via our proxy to avoid CORS on the Gateway API too
        const gwRes = await fetch('/api/gateway-proxy?action=gateway-transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ burnIntent: burnIntent, signature, contractSigner: true }],
            enableForwarder: true,
          }, (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v),
        })
        if (!gwRes.ok) {
          const errJson = await gwRes.json() as { error?: string }
          throw new Error(errJson.error ?? `Gateway API error ${gwRes.status}`)
        }
        const gwJson = await gwRes.json() as { attestation?: string; signature?: string; transferId?: string; error?: string }
        if (gwJson.error) throw new Error(gwJson.error)

        const transferId = gwJson.transferId

        // Forwarding Service handles the mint. Poll via proxy until confirmed/finalized.
        setPhase('minting')
        if (transferId) {
          const deadline = Date.now() + 120_000
          let done = false
          while (Date.now() < deadline && !done) {
            await new Promise(r => setTimeout(r, 3000))
            try {
              const pollRes = await fetch('/api/gateway-proxy?action=gateway-poll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transferId }),
              })
              if (!pollRes.ok) continue
              const rec = await pollRes.json() as { status?: string; message?: string }
              if (rec.status === 'confirmed' || rec.status === 'finalized') { done = true; break }
              if (rec.status === 'failed') throw new Error(`Gateway transfer failed: ${rec.message ?? 'unknown reason'}`)
            } catch (pollErr) {
              if ((pollErr as Error)?.message?.startsWith('Gateway transfer failed')) throw pollErr
            }
          }
          if (!done) throw new Error('Timed out waiting for Gateway to confirm. Your funds are safe — check your balance in a few minutes.')
        } else if (gwJson.attestation && gwJson.signature) {
          // Non-forwarded: got attestation immediately — this shouldn't happen with enableForwarder=true
          // but handle it gracefully
          setMintTxHash('forwarded')
        }

        setPhase('done')
        toast.success(`Transferred ${amount} USDC to ${destChain?.name}`)
        setTimeout(onSuccess, 2000)
        return
      } else {
        // ── W3S / Circle UCW path (email / Google) ────────────────────────────
        // UCW wallets are SCA — sign with signTypedData challenge (eth_signTypedData_v4).
        const result = await circleTx.signTypedData(typedDataStr)
        if (!result) throw new Error(circleTx.error ?? 'Signing cancelled or signature not returned. Make sure VITE_CIRCLE_APP_ID is set and your Circle session is active.')
        signature = result as `0x${string}`
      }

      setPhase('submitting')
      // UCW wallets are SCA (Smart Contract Accounts) — the Gateway API must
      // validate the signature via ERC-1271, so contractSigner:true is required.
      // Without it the API rejects with a signature verification error.
      const { attestation, signature: mintSignature } = await submitBurnIntent(burnIntent, signature, true)

      setPhase('minting')

      // UCW path mint: Circle UCW executes gatewayMint on destination chain directly
      const destScpBlockchain = destChain.scpBlockchain
      if (!destScpBlockchain) throw new Error(`No SCP blockchain ID for ${destChain.name}`)
      const ucwWalletAddress = auth?.circleWalletAddress
      if (!ucwWalletAddress) throw new Error('Circle wallet address not found — please log in again')

      // Use pre-encoded callData rather than abiFunctionSignature+abiParameters:
      // the Circle UCW SDK ABI-encodes abiParameters server-side, which would
      // double-encode the raw `bytes` hex values for attestation and mintSignature.
      const { encodeFunctionData: encodeGatewayMint } = await import('viem')
      // attestation and mintSignature are non-null when enableForwarder=false (UCW path)
      const gatewayMintCallData = encodeGatewayMint({
        abi: GATEWAY_MINTER_ABI,
        functionName: 'gatewayMint',
        args: [attestation!, mintSignature!],
      })
      const txHash = await circleTx.executeContract({
        contractAddress: GATEWAY_MINTER,
        callData: gatewayMintCallData,
        blockchain: destScpBlockchain,
        walletAddress: ucwWalletAddress,
      })

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
      <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:12, padding:'11px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <Info size={13} color={BLUE} style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:T2, lineHeight:1.55 }}>
          Signs a <strong style={{ color:TEXT }}>Gateway BurnIntent</strong> using your {isPasskey ? 'passkey' : 'Circle wallet'}. Circle mints on the destination — <strong style={{ color:TEXT }}>no dest-chain gas needed</strong>.
        </div>
      </div>

      <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BDR}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:T3, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:3 }}>From</div>
            <div style={{ fontSize:14, fontWeight:600, color:TEXT }}>Arc Testnet</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:700, color:T3, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:3 }}>Gateway Balance</div>
            <div style={{ fontSize:14, fontWeight:700, color:TEXT, fontVariantNumeric:'tabular-nums' }}>{gwBal.toFixed(2)} USDC</div>
          </div>
        </div>
        <div style={{ padding:'12px 16px' }}>
          <DestChainSelector chains={DEST_CHAINS} value={destChainId} onChange={setDestChainId} disabled={phase !== 'idle'} />
        </div>
      </div>

      <div>
        <div style={{ fontSize:11, fontWeight:600, color:T3, marginBottom:7, textTransform:'uppercase', letterSpacing:'0.07em' }}>Amount</div>
        <div style={{ position:'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width:'100%', padding:'13px 58px 13px 14px', border:`1px solid ${amount ? BLUE_BD : BDR}`, borderRadius:12, background:SURF2, color:TEXT, fontSize:22, fontWeight:700, fontFamily:F, boxSizing:'border-box', outline:'none', fontVariantNumeric:'tabular-nums', transition:'border-color 0.15s' }} />
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:13, fontWeight:600, color:T2 }}>USDC</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:7 }}>
          <span style={{ fontSize:12, color:T2 }}>Available: <strong style={{ color:TEXT, fontVariantNumeric:'tabular-nums' }}>{gwBal.toFixed(2)} USDC</strong></span>
          {gwBal > 0 && <button onClick={() => setAmount(gwBal.toFixed(6))} style={{ fontSize:12, fontWeight:600, color:BLUE, background:'none', border:'none', cursor:'pointer' }}>Max</button>}
        </div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          {['1','5','10','25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex:1, padding:'8px 0', border:`1px solid ${amount===v ? BLUE : BDR}`, borderRadius:10, background:amount===v ? BLUE_DIM : SURF, color:amount===v ? BLUE : T2, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, transition:'all 0.12s' }}>{v}</button>
          ))}
        </div>
      </div>

      {phase !== 'idle' && (
        <div style={{ background:SURF, border:`1px solid ${BDR}`, borderRadius:12, overflow:'hidden' }}>
          {[
            { label: isPasskey ? 'Sign BurnIntent (passkey)' : 'Sign BurnIntent', done: ['submitting','minting','done'].includes(phase), active: phase==='signing'    },
            { label: 'Submit to Gateway API',                                       done: ['minting','done'].includes(phase),             active: phase==='submitting' },
            { label: `Mint on ${destChain?.name ?? 'destination'}`,                done: phase==='done',                                 active: phase==='minting'   },
          ].map((s, i) => (
            <div key={i} style={{ padding:'11px 16px', borderBottom: i<2 ? `1px solid ${BDR}` : 'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:s.done ? BLUE : SURF2, border:`1px solid ${s.done ? BLUE : BDR}`, flexShrink:0 }}>
                {s.done ? <Check size={12} color="#fff" /> : s.active ? <div style={{ width:11, height:11, borderRadius:'50%', border:`2px solid ${BLUE}`, borderTopColor:'transparent', animation:'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize:11, color:T3 }}>{i+1}</span>}
              </div>
              <span style={{ fontSize:13, color: s.active ? TEXT : s.done ? TEXT : T2 }}>{s.label}</span>
              {s.done && i===2 && mintTxHash && destChain && (
                <a href={`${destChain.explorerBase}/tx/${mintTxHash}`} target="_blank" rel="noreferrer" style={{ marginLeft:'auto', fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}>View <ExternalLink size={10} /></a>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', borderRadius:10, padding:'10px 14px', display:'flex', gap:8 }}>
          <AlertCircle size={14} color="#EF4444" style={{ flexShrink:0, marginTop:1 }} />
          <span style={{ fontSize:12, color:'#EF4444' }}>{errMsg}</span>
        </div>
      )}

      {gwBal <= 0 && phase === 'idle' && (
        <div style={{ background:BLUE_DIM, border:`1px solid ${BLUE_BD}`, borderRadius:10, padding:'11px 14px', fontSize:12, color:T2 }}>
          Gateway balance is 0. Deposit USDC first.
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width:'100%', padding:'14px 0', background:SURF, border:`1px solid ${BDR}`, borderRadius:14, fontSize:14, fontWeight:600, color:TEXT, cursor:'pointer', fontFamily:F }}>Transfer again</button>
      ) : (
        <button onClick={() => void handleTransfer()} disabled={!amount || parseFloat(amount)<=0 || phase!=='idle' || gwBal<=0}
          style={{ width:'100%', padding:'15px 0', borderRadius:14, fontSize:15, fontWeight:700, border:'none', fontFamily:F, cursor:(!amount||phase!=='idle'||gwBal<=0) ? 'not-allowed' : 'pointer', background:(!amount||phase!=='idle'||gwBal<=0) ? SURF : BLUE, color:(!amount||phase!=='idle'||gwBal<=0) ? T2 : '#fff', transition:'all 0.15s', boxShadow:(!amount||phase!=='idle'||gwBal<=0) ? 'none' : `0 4px 16px rgba(8,102,245,0.30)` }}>
          {phase==='signing' ? 'Sign in wallet…' : phase==='submitting' ? 'Submitting…' : phase==='minting' ? 'Minting on destination…' : `Transfer ${amount||'0.00'} USDC to ${destChain?.name ?? '…'}`}
        </button>
      )}
    </div>
  )
}
