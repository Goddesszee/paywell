import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Check, AlertCircle } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import { toast } from 'sonner'
import { getUsdc, getProtocolContractByName, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const WHITE = '#FFFFFF'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'
const MONO = 'JetBrains Mono, Menlo, monospace'

const ARC_TESTNET_ID = 5042002
// Gateway Wallet testnet address (all EVM chains) — from Circle docs
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const

type Tab = 'balance' | 'deposit' | 'withdraw'

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { address } = useAccount()
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const { data: rawGatewayBalance, refetch: refetchGateway } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [GATEWAY_WALLET],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!usdcFact },
  })

  const walletBalance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null

  const gatewayTvl = rawGatewayBalance !== undefined
    ? Amount.fromRaw(rawGatewayBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null

  const handleRefresh = () => { void refetch(); void refetchGateway() }

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Layers size={18} color={WHITE} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Gateway</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Unified USDC balance · Arc Testnet</div>
        </div>
        <button onClick={handleRefresh}
          style={{ width: 36, height: 36, borderRadius: 10, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          aria-label="Refresh">
          <RefreshCw size={15} color={TEXT2} />
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', background: SURFACE, borderRadius: 12, padding: 3, marginBottom: 16, gap: 2 }}>
        {([
          { id: 'balance' as Tab, label: 'Balance' },
          { id: 'deposit' as Tab, label: 'Deposit' },
          { id: 'withdraw' as Tab, label: 'Withdraw' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '7px 4px', border: 'none', borderRadius: 9, cursor: 'pointer',
            fontFamily: F, fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            background: tab === t.id ? WHITE : 'transparent',
            color: BLACK,
            boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'balance' && (
        <BalanceTab
          address={address}
          walletBalance={walletBalance}
          gatewayTvl={gatewayTvl}
          isLoading={isLoading}
        />
      )}
      {tab === 'deposit' && (
        <DepositTab address={address} walletBalance={walletBalance} onSuccess={() => { handleRefresh(); setTab('balance') }} />
      )}
      {tab === 'withdraw' && (
        <WithdrawTab address={address} onSuccess={() => { handleRefresh(); setTab('balance') }} />
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: TEXT3, marginTop: 16 }}>
        Powered by Circle Gateway · Built on Arc
      </div>
    </div>
  )
}

// ── Balance Tab ───────────────────────────────────────────────────────────────

function BalanceTab({ address, walletBalance, gatewayTvl, isLoading }: {
  address?: string
  walletBalance: string | null
  gatewayTvl: string | null
  isLoading: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* My balance card */}
      <div style={{ background: BLACK, borderRadius: 20, padding: '28px 24px', color: WHITE }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10, fontFamily: MONO }}>
          My USDC Balance
        </div>
        {!address ? (
          <div style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '-1px', fontFamily: MONO }}>—</div>
        ) : isLoading ? (
          <div style={{ height: 44, width: 160, background: 'rgba(255,255,255,0.08)', borderRadius: 10 }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 700, color: WHITE, letterSpacing: '-1.5px', fontFamily: MONO }}>
            {walletBalance ?? '0.00'} <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)' }}>USDC</span>
          </div>
        )}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {address ? `${address.slice(0, 8)}...${address.slice(-6)} · Arc Testnet` : 'Connect a wallet to view your balance'}
        </div>
      </div>

      {/* Gateway wallet info */}
      <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BLACK, marginBottom: 10 }}>Gateway Wallet (Testnet)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: SURFACE, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: TEXT3, marginBottom: 4 }}>Contract TVL</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BLACK, fontFamily: MONO }}>{gatewayTvl ?? '—'} <span style={{ fontSize: 11, color: TEXT2 }}>USDC</span></div>
          </div>
          <div style={{ background: SURFACE, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: TEXT3, marginBottom: 4 }}>Transfer speed</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: BLACK }}>&lt;500ms</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: TEXT2, fontFamily: MONO, wordBreak: 'break-all', lineHeight: 1.5 }}>
          {GATEWAY_WALLET}
        </div>
        <a href={`https://testnet.arcscan.app/address/${GATEWAY_WALLET}`} target="_blank" rel="noreferrer"
          style={{ fontSize: 11, color: BLACK, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, textDecoration: 'none' }}>
          View on explorer <ExternalLink size={10} />
        </a>
      </div>

      {!address && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: TEXT3 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: BLACK }}>Connect your wallet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Connect to view your USDC balance and use Gateway</div>
        </div>
      )}
    </div>
  )
}

// ── Deposit Tab ───────────────────────────────────────────────────────────────

function DepositTab({ address, walletBalance, onSuccess }: {
  address?: string
  walletBalance: string | null
  onSuccess: () => void
}) {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<'idle' | 'approving' | 'depositing' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const decimals = usdcDecimalsFor(ARC_TESTNET_ID)
  const parsed = amount && parseFloat(amount) > 0 ? parseUnits(amount, decimals) : 0n

  // Step 1: Approve GatewayWallet to spend USDC
  const { writeContract: approve, data: approveTxHash, isPending: isApproving, reset: resetApprove } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveError } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Step 2: Transfer USDC to GatewayWallet (deposit = transfer)
  const { writeContract: deposit, data: depositTxHash, isPending: isDepositing, reset: resetDeposit } = useWriteContract()
  const { isSuccess: depositSuccess, isError: depositError } = useWaitForTransactionReceipt({ hash: depositTxHash })

  // Approval succeeded → execute deposit
  useEffect(() => {
    if (approveSuccess && parsed > 0n && usdcFact) {
      setPhase('depositing')
      deposit({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [GATEWAY_WALLET, parsed],
        chainId: ARC_TESTNET_ID,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  useEffect(() => {
    if (depositSuccess) {
      setPhase('done')
      toast.success(`Deposited ${amount} USDC to Gateway`)
      setTimeout(onSuccess, 1500)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositSuccess])

  useEffect(() => {
    if (approveError || depositError) {
      setPhase('error')
      setErrMsg('Transaction rejected or failed.')
    }
  }, [approveError, depositError])

  const handleDeposit = async () => {
    if (!address || !usdcFact || !amount || parseFloat(amount) <= 0) return
    setErrMsg('')
    try {
      if (chainId !== ARC_TESTNET_ID) await switchChainAsync({ chainId: ARC_TESTNET_ID })
      setPhase('approving')
      approve({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [GATEWAY_WALLET, parsed],
        chainId: ARC_TESTNET_ID,
      })
    } catch (e: unknown) {
      setPhase('error')
      setErrMsg(e instanceof Error ? e.message : 'Failed to deposit.')
    }
  }

  const reset = () => { setPhase('idle'); setAmount(''); setErrMsg(''); resetApprove(); resetDeposit() }

  if (!address) return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: TEXT3 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>Connect your wallet to deposit</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowDownToLine size={15} color={BLACK} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>Deposit USDC to Gateway</div>
          <div style={{ fontSize: 11, color: TEXT2 }}>Transfer USDC from your wallet into the Gateway contract</div>
        </div>
      </div>

      {/* Amount input */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, color: BLACK, fontSize: 16, fontWeight: 600, fontFamily: F, boxSizing: 'border-box', outline: 'none' }} />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: TEXT2 }}>USDC</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2 }}>Available: <strong style={{ color: BLACK }}>{walletBalance ?? '—'} USDC</strong></span>
          {walletBalance && <button onClick={() => setAmount(walletBalance)} style={{ fontSize: 11, fontWeight: 600, color: BLACK, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Max</button>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['1', '5', '10', '25'].map(v => (
            <button key={v} onClick={() => setAmount(v)} disabled={phase !== 'idle'}
              style={{ flex: 1, padding: '6px 0', border: `1px solid ${BORDER}`, borderRadius: 8, background: amount === v ? BLACK : SURFACE, color: amount === v ? WHITE : BLACK, fontSize: 13, cursor: 'pointer', fontFamily: F }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Steps */}
      {phase !== 'idle' && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            { label: 'Approve USDC', active: phase === 'approving', done: phase === 'depositing' || phase === 'done' },
            { label: 'Transfer to Gateway', active: phase === 'depositing', done: phase === 'done' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i === 0 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? BLACK : SURFACE, border: `1px solid ${s.done ? BLACK : BORDER}`, flexShrink: 0 }}>
                {s.done ? <Check size={13} color={WHITE} /> : s.active ? <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${BLACK}`, borderTopColor: 'transparent', animation: 'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize: 11, color: TEXT2 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: BLACK }}>{s.label}</span>
              {s.done && i === 1 && depositTxHash && (
                <a href={buildTxExplorerUrl(ARC_TESTNET_ID, depositTxHash)} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: TEXT2, display: 'flex', alignItems: 'center', gap: 3 }}>
                  View <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} color={BLACK} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: BLACK }}>{errMsg}</span>
        </div>
      )}

      {/* Done */}
      {phase === 'done' ? (
        <button onClick={reset} style={{ width: '100%', padding: '14px 0', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, fontSize: 14, fontWeight: 600, color: BLACK, cursor: 'pointer', fontFamily: F }}>
          Deposit again
        </button>
      ) : (
        <button onClick={() => void handleDeposit()} disabled={!amount || parseFloat(amount) <= 0 || phase !== 'idle'}
          style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: !amount || phase !== 'idle' ? 'not-allowed' : 'pointer', fontFamily: F, border: 'none', background: !amount || phase !== 'idle' ? SURFACE : BLACK, color: !amount || phase !== 'idle' ? TEXT2 : WHITE, transition: 'all 0.15s' }}>
          {phase === 'approving' ? 'Approving…' : phase === 'depositing' ? 'Depositing…' : `Deposit ${amount || '0.00'} USDC`}
        </button>
      )}
    </div>
  )
}

// ── Withdraw Tab ──────────────────────────────────────────────────────────────

function WithdrawTab({ address, onSuccess }: { address?: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const decimals = usdcDecimalsFor(ARC_TESTNET_ID)

  // Read user's balance inside Gateway (what they deposited)
  const { data: rawDeposited } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const depositedBalance = rawDeposited !== undefined
    ? formatUnits(rawDeposited, decimals)
    : null

  if (!address) return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: TEXT3 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>Connect your wallet to withdraw</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowUpFromLine size={15} color={BLACK} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>Withdraw from Gateway</div>
          <div style={{ fontSize: 11, color: TEXT2 }}>Withdraw USDC from Gateway back to your wallet</div>
        </div>
      </div>

      {/* Amount */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, color: BLACK, fontSize: 16, fontWeight: 600, fontFamily: F, boxSizing: 'border-box', outline: 'none' }} />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: TEXT2 }}>USDC</span>
        </div>
        {depositedBalance && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: TEXT2 }}>Balance: <strong style={{ color: BLACK }}>{parseFloat(depositedBalance).toFixed(2)} USDC</strong></span>
            <button onClick={() => setAmount(parseFloat(depositedBalance).toFixed(6))} style={{ fontSize: 11, fontWeight: 600, color: BLACK, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Max</button>
          </div>
        )}
      </div>

      {/* Notice */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
        <AlertCircle size={13} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
          Full Gateway withdrawals require a burn intent and Circle API attestation. This requires configuring your Circle Kit Key. The 7-day trustless withdrawal path is also available via the Gateway Minter contract directly.{' '}
          <a href="https://developers.circle.com/gateway" target="_blank" rel="noreferrer" style={{ color: BLACK, fontWeight: 600 }}>Read the docs</a>
        </div>
      </div>

      <button
        disabled={!amount || parseFloat(amount) <= 0}
        onClick={() => toast.info('Withdrawal requires Circle Kit Key configuration. See Gateway docs.')}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, fontFamily: F, border: 'none', background: !amount || parseFloat(amount) <= 0 ? SURFACE : BLACK, color: !amount || parseFloat(amount) <= 0 ? TEXT2 : WHITE, cursor: !amount || parseFloat(amount) <= 0 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
        Withdraw {amount || '0.00'} USDC
      </button>

      <div style={{ fontSize: 11, color: TEXT3, textAlign: 'center' }}>
        Gateway contract: <span style={{ fontFamily: MONO }}>{GATEWAY_WALLET.slice(0, 10)}…{GATEWAY_WALLET.slice(-6)}</span>
      </div>
    </div>
  )
}
