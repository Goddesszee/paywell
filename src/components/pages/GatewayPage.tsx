import React, { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ExternalLink, Check, AlertCircle } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

const F = "'Inter', -apple-system, sans-serif"
const BLACK = '#ffffff'
const WHITE = '#111111'
const SURFACE = '#1a1a1a'
const BORDER = 'rgba(0,0,0,0.08)'
const TEXT2 = '#5C5C6B'
const TEXT3 = '#9898A6'
const MONO = 'JetBrains Mono, Menlo, monospace'

const ARC_TESTNET_ID = 5042002
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const

type Tab = 'balance' | 'deposit' | 'withdraw'

export function GatewayPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const { address } = useAccount()
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  // Gateway balance = USDC held by the Gateway contract itself (user's deposited share tracked off-chain)
  // We show the user's own wallet balance for reference, and separately the Gateway contract balance
  const { data: rawWalletBalance, isLoading, refetch: refetchWallet } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const decimals = usdcDecimalsFor(ARC_TESTNET_ID)

  // Format only wallet balance — Gateway balance requires the Circle API
  const walletBalance = rawWalletBalance !== undefined
    ? (Number(rawWalletBalance) / 10 ** decimals).toFixed(2)
    : null

  const handleRefresh = () => { void refetchWallet() }

  return (
    <div style={{ fontFamily: F, maxWidth: 520, margin: '0 auto', padding: '0 0 88px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Layers size={18} color={WHITE} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: BLACK, letterSpacing: '-0.02em' }}>Gateway</div>
          <div style={{ fontSize: 12, color: TEXT2 }}>Unified USDC · Arc Testnet</div>
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
        <BalanceTab address={address} walletBalance={walletBalance} isLoading={isLoading} />
      )}
      {tab === 'deposit' && (
        <DepositTab address={address} walletBalance={walletBalance}
          onSuccess={() => { handleRefresh(); setTab('balance') }} />
      )}
      {tab === 'withdraw' && (
        <WithdrawTab address={address} onSuccess={() => { handleRefresh(); setTab('balance') }} />
      )}
    </div>
  )
}

// ── Balance Tab ───────────────────────────────────────────────────────────────

function BalanceTab({ address, walletBalance, isLoading }: {
  address?: string
  walletBalance: string | null
  isLoading: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Gateway deposited balance card */}
      <div style={{ background: BLACK, borderRadius: 20, padding: '28px 24px', color: WHITE }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10, fontFamily: MONO }}>
          Gateway Balance
        </div>
        {!address ? (
          <div style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '-1px', fontFamily: MONO }}>—</div>
        ) : isLoading ? (
          <div style={{ height: 44, width: 120, background: 'rgba(255,255,255,0.08)', borderRadius: 10 }} />
        ) : (
          <>
            <div style={{ fontSize: 40, fontWeight: 700, color: WHITE, letterSpacing: '-1.5px', fontFamily: MONO }}>
              0.00 <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)' }}>USDC</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              Deposit USDC to build your Gateway balance
            </div>
          </>
        )}
        {address && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            {address.slice(0, 8)}...{address.slice(-6)} · Arc Testnet
          </div>
        )}
      </div>

      {/* Wallet balance reference */}
      {address && (
        <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: TEXT2 }}>Wallet USDC available</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: BLACK, fontFamily: MONO }}>
            {isLoading ? '…' : `${walletBalance ?? '0.00'} USDC`}
          </span>
        </div>
      )}

      {!address && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: TEXT3 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>Connect your wallet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Connect to view your Gateway balance</div>
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

  const { writeContract: approve, data: approveTxHash, reset: resetApprove } = useWriteContract()
  const { isSuccess: approveSuccess, isError: approveError } = useWaitForTransactionReceipt({ hash: approveTxHash })

  const { writeContract: deposit, data: depositTxHash, reset: resetDeposit } = useWriteContract()
  const { isSuccess: depositSuccess, isError: depositError } = useWaitForTransactionReceipt({ hash: depositTxHash })

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
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>Deposit USDC</div>
          <div style={{ fontSize: 11, color: TEXT2 }}>Transfer USDC into the Gateway contract</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)} disabled={phase !== 'idle'}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, color: BLACK, fontSize: 16, fontWeight: 600, fontFamily: F, boxSizing: 'border-box', outline: 'none' }} />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: TEXT2 }}>USDC</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
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

      {phase !== 'idle' && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            { label: 'Approve USDC', done: phase === 'depositing' || phase === 'done', active: phase === 'approving' },
            { label: 'Transfer to Gateway', done: phase === 'done', active: phase === 'depositing' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i === 0 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.done ? BLACK : SURFACE, border: `1px solid ${s.done ? BLACK : BORDER}`, flexShrink: 0 }}>
                {s.done ? <Check size={13} color={WHITE} /> : s.active ? <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${BLACK}`, borderTopColor: 'transparent', animation: 'nan-spin 0.8s linear infinite' }} /> : <span style={{ fontSize: 11, color: TEXT2 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 13, color: BLACK }}>{s.label}</span>
              {s.done && i === 1 && depositTxHash && (
                <a href={buildTxExplorerUrl(ARC_TESTNET_ID, depositTxHash)} target="_blank" rel="noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 11, color: TEXT2, display: 'flex', alignItems: 'center', gap: 3 }}>
                  View <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
          <AlertCircle size={14} color={BLACK} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: BLACK }}>{errMsg}</span>
        </div>
      )}

      {phase === 'done' ? (
        <button onClick={reset} style={{ width: '100%', padding: '14px 0', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, fontSize: 14, fontWeight: 600, color: BLACK, cursor: 'pointer', fontFamily: F }}>
          Deposit again
        </button>
      ) : (
        <button onClick={() => void handleDeposit()}
          disabled={!amount || parseFloat(amount) <= 0 || phase !== 'idle'}
          style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, border: 'none', fontFamily: F, cursor: !amount || phase !== 'idle' ? 'not-allowed' : 'pointer', background: !amount || phase !== 'idle' ? SURFACE : BLACK, color: !amount || phase !== 'idle' ? TEXT2 : WHITE, transition: 'all 0.15s' }}>
          {phase === 'approving' ? 'Approving…' : phase === 'depositing' ? 'Depositing…' : `Deposit ${amount || '0.00'} USDC`}
        </button>
      )}
    </div>
  )
}

// ── Withdraw Tab ──────────────────────────────────────────────────────────────

function WithdrawTab({ address, onSuccess: _onSuccess }: { address?: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState('')

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
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK }}>Withdraw USDC</div>
          <div style={{ fontSize: 11, color: TEXT2 }}>Withdraw from Gateway back to your wallet</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USDC)</div>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', padding: '12px 56px 12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10, background: WHITE, color: BLACK, fontSize: 16, fontWeight: 600, fontFamily: F, boxSizing: 'border-box', outline: 'none' }} />
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 600, color: TEXT2 }}>USDC</span>
        </div>
      </div>

      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 8 }}>
        <AlertCircle size={13} color={TEXT2} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>
          Withdrawals require a Circle Kit Key for the burn intent and attestation flow.{' '}
          <a href="https://developers.circle.com/gateway" target="_blank" rel="noreferrer" style={{ color: BLACK, fontWeight: 600 }}>Read docs</a>
        </div>
      </div>

      <button
        disabled={!amount || parseFloat(amount) <= 0}
        onClick={() => toast.info('Withdrawal requires Circle Kit Key configuration.')}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, fontSize: 14, fontWeight: 600, fontFamily: F, border: 'none', background: !amount || parseFloat(amount) <= 0 ? SURFACE : BLACK, color: !amount || parseFloat(amount) <= 0 ? TEXT2 : WHITE, cursor: !amount || parseFloat(amount) <= 0 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
        Withdraw {amount || '0.00'} USDC
      </button>
    </div>
  )
}
