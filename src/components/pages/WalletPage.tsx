import React, { useState, useRef } from 'react'
import {
  Copy, ArrowUpRight, ArrowDownLeft, Check, ExternalLink,
  AlertCircle, X, ChevronRight, Wallet, Share2, Activity,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { QRCodeSVG } from 'qrcode.react'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { formatAddress, formatUSDC, parseOnchainError } from '../../utils/format'
import { TokenLogo } from '../ui/TokenLogo'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

const ARC_TESTNET_ID = 5042002
const SANS = 'Inter, -apple-system, sans-serif'

// ── Supported send tokens ─────────────────────────────────────────────────────
const SEND_TOKENS = [
  { symbol: 'USDC', label: 'USD Coin',  address: '0x3600000000000000000000000000000000000000' as `0x${string}`, decimals: 6, color: '#2775CA' },
  { symbol: 'EURC', label: 'Euro Coin', address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`, decimals: 6, color: '#0099CC' },
] as const
type SendToken = typeof SEND_TOKENS[number]

function useTokenBalance(tokenAddress: `0x${string}`, decimals: number, address: string) {
  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })
  const rawNum = rawBalance !== undefined ? Number(rawBalance) / 10 ** decimals : 0
  const balance = rawBalance !== undefined ? (Number(rawBalance) / 10 ** decimals).toFixed(2) : null
  return { balance, rawNum, isLoading, refetch }
}

function useWalletBalance(address: string) {
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })
  const rawNum = rawBalance !== undefined
    ? parseFloat(Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(6))
    : 0
  const balance = rawBalance !== undefined
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
    : null
  return { balance, rawNum, isLoading, refetch }
}

type WalletSubView = 'main' | 'send' | 'send_confirm' | 'send_success' | 'receive'

export function WalletPage({ initialSubView = 'main' }: { initialSubView?: WalletSubView }) {
  const [subView, setSubView] = useState<WalletSubView>(initialSubView)
  const { agentPermissions, addActivity, activity } = useAppStore()
  const { address, chainId } = useAccount()
  const [copied, setCopied] = useState(false)
  const chain = requireChain(ARC_TESTNET_ID)
  const { balance, rawNum, isLoading, refetch } = useWalletBalance(address ?? '')

  const handleCopy = () => {
    if (!address) return
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  if (!address) {
    return (
      <div style={{ maxWidth: 400, margin: '0 auto', padding: '48px 24px', textAlign: 'center', fontFamily: SANS }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Wallet size={28} color="var(--nan-text3)" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Connect your wallet
        </h2>
        <p style={{ fontSize: 14, color: 'var(--nan-text2)', marginBottom: 28, lineHeight: 1.5 }}>
          Connect a wallet to view your balance, send and receive USDC.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  if (subView === 'send' || subView === 'send_confirm' || subView === 'send_success') {
    return (
      <SendFlow
        address={address}
        chainId={chainId}
        onBack={() => setSubView('main')}
        onSuccess={() => { void refetch(); setSubView('main') }}
        addActivity={addActivity}
      />
    )
  }

  if (subView === 'receive') {
    return <ReceiveView address={address} onBack={() => setSubView('main')} />
  }

  const agentReserved = agentPermissions.dailyLimit
  const available = Math.max(0, rawNum - agentReserved)

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-nan" style={{ fontFamily: SANS }}>Wallet</h1>
        <Badge variant="default" size="sm">{chain.name}</Badge>
      </div>

      {/* Balance card */}
      <div style={{
        background: 'linear-gradient(145deg,var(--nan-surface) 0%,var(--nan-surface2) 50%,var(--nan-surface) 100%)',
        borderRadius: 16, padding: '20px 20px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'JetBrains Mono, Menlo, monospace' }}>
          Total Balance
        </div>
        {isLoading ? (
          <div style={{ height: 48, width: 160, background: 'rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 16 }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-1.5px', fontFamily: 'JetBrains Mono, Menlo, monospace', marginBottom: 16 }}>
            {balance ?? '0.00'} <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>USDC</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Available', val: `${formatUSDC(available)} USDC` },
            { label: 'Agent reserved', val: `${formatUSDC(agentReserved)} USDC` },
          ].map(({ label, val }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, Menlo, monospace' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setSubView('send')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, background: '#0066FF', color: '#ffffff',
              fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: SANS,
            }}
          >
            <ArrowUpRight size={16} /> Send
          </button>
          <button
            onClick={() => setSubView('receive')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, background: 'var(--nan-surface2)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: SANS,
            }}
          >
            <ArrowDownLeft size={16} /> Receive
          </button>
        </div>
      </div>

      {/* Wallet address */}
      <Card padding="md">
        <div className="text-xs font-bold text-nan3 uppercase tracking-wider mb-3">Wallet address</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 nan-surface-fix rounded-xl px-3 py-2.5 min-w-0">
            <div className="text-sm font-mono text-nan truncate">
              {address.slice(0,10)}...{address.slice(-8)}
            </div>
          </div>
          <button onClick={handleCopy} className="w-10 h-10 flex items-center justify-center rounded-xl nan-surface-fix hover:nan-surface2-fix text-nan transition-colors flex-shrink-0">
            {copied ? <Check size={16} className="text-nan" /> : <Copy size={16} />}
          </button>
          <button onClick={() => setSubView('receive')} className="w-10 h-10 flex items-center justify-center rounded-xl nan-surface-fix hover:nan-surface2-fix text-nan transition-colors flex-shrink-0">
            <Share2 size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-nan2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
          Connected to {chain.name}
          <a
            href={`${chain.explorerBase}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 font-semibold hover:opacity-70 transition-opacity"
          >
            Explorer <ExternalLink size={11} />
          </a>
        </div>
      </Card>

      {/* Token list */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 8px', fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Assets
        </div>
        {[
          { name: 'USD Coin',  symbol: 'USDC', balance: balance ?? '0.00', color: '#2775CA' },
          { name: 'Euro Coin', symbol: 'EURC', balance: '0.00',            color: '#0099CC' },
          { name: 'Tether',    symbol: 'USDT', balance: '0.00',            color: '#26A17B' },
        ].map((token, i) => (
          <div key={token.symbol} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px',
            borderTop: i === 0 ? 'none' : '1px solid var(--nan-bdr)',
          }}>
            <TokenLogo symbol={token.symbol} size={38} radius={12} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', marginBottom: 2 }}>{token.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: token.color }}>{token.symbol}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', fontFamily: 'JetBrains Mono, monospace' }}>{token.balance}</div>
              <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>{token.symbol}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent transactions */}
      <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 8px', fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Recent Transactions
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--nan-surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <Activity size={16} color="var(--nan-text3)" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 3 }}>No transactions yet</div>
            <div style={{ fontSize: 11, color: 'var(--nan-text3)' }}>Send or receive USDC to get started</div>
          </div>
        ) : (
          activity.slice(0, 5).map((item, i) => {
            const isIn = item.sign === '+'
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid var(--nan-bdr)',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isIn ? 'rgba(0,200,83,0.10)' : 'rgba(255,59,59,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isIn
                    ? <ArrowDownLeft size={15} color="#00C853" />
                    : <ArrowUpRight size={15} color="#FF3B3B" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nan-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 1 }}>{item.counterparty || new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
                </div>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: isIn ? '#00C853' : '#FF3B3B', flexShrink: 0 }}>
                  {item.sign}{item.amount}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Send Flow ────────────────────────────────────────────────────────────────

type SendStep = 'recipient' | 'amount' | 'note' | 'review' | 'submitting' | 'success' | 'error'

function useIsDesktop() {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 769px)') : null
  const [isDesktop, setIsDesktop] = React.useState(mq ? mq.matches : false)
  React.useEffect(() => {
    if (!mq) return
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return isDesktop
}

function SendFlow({
  address: _address,
  chainId,
  onBack,
  onSuccess,
  addActivity,
}: {
  address: string
  chainId?: number
  onBack: () => void
  onSuccess: () => void
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void
}) {
  const isDesktop = useIsDesktop()
  const [step, setStep] = useState<SendStep>('recipient')
  const [selectedToken, setSelectedToken] = useState<SendToken>(SEND_TOKENS[0])
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [recipientError, setRecipientError] = useState('')
  const [amountError, setAmountError] = useState('')
  const recipientRef = React.useRef(recipient)
  const amountRef = React.useRef(amount)
  const noteRef = React.useRef(note)
  React.useEffect(() => { recipientRef.current = recipient }, [recipient])
  React.useEffect(() => { amountRef.current = amount }, [amount])
  React.useEffect(() => { noteRef.current = note }, [note])

  const { switchChain } = useSwitchChain()
  const { rawNum } = useTokenBalance(selectedToken.address, selectedToken.decimals, _address)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const isWrongChain = chainId !== undefined && chainId !== ARC_TESTNET_ID

  React.useEffect(() => {
    if (isSuccess && txHash) {
      setStep('success')
      addActivity({
        type: 'sent',
        description: noteRef.current || `Sent ${selectedToken.symbol}`,
        amount: parseFloat(amountRef.current),
        sign: '-',
        status: 'confirmed',
        counterparty: formatAddress(recipientRef.current),
        txHash,
      })
      toast.success(`Sent ${amountRef.current} ${selectedToken.symbol} successfully`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  React.useEffect(() => {
    if (writeError) {
      const msg = parseOnchainError(writeError)
      if (!msg.includes('cancelled')) {
        setStep('error')
        toast.error(msg)
      } else {
        setStep('review')
        reset()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError])

  const displayStep: SendStep = (isPending || isConfirming) ? 'submitting' : step

  const validateRecipient = () => {
    if (!recipient) { setRecipientError('Recipient address is required'); return false }
    if (!isAddress(recipient)) { setRecipientError('Enter a valid Ethereum address (0x...)'); return false }
    setRecipientError('')
    return true
  }

  const validateAmount = () => {
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) { setAmountError('Enter a valid amount'); return false }
    if (n > rawNum) { setAmountError(`Insufficient balance. You have ${formatUSDC(rawNum)} ${selectedToken.symbol}`); return false }
    setAmountError('')
    return true
  }

  const handleSend = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** selectedToken.decimals))
    writeContract({
      address: selectedToken.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, rawAmount],
      chainId: ARC_TESTNET_ID,
    })
  }

  // ── desktop numpad key handler ─────────────────────────────────────────────
  const handleKey = (key: string) => {
    setAmountError('')
    if (key === 'backspace') { setAmount(a => a.slice(0, -1)); return }
    if (key === '.' && amount.includes('.')) return
    if (key === '.' && amount === '') { setAmount('0.'); return }
    if (amount === '0' && key !== '.') { setAmount(key); return }
    if (amount.split('.')[1]?.length >= 6) return
    setAmount(a => a + key)
  }

  // ── success ────────────────────────────────────────────────────────────────
  if (displayStep === 'success') {
    return (
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SANS, padding: '32px 24px',
      }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <Check size={32} color="#00C853" />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--nan-text)', letterSpacing: '-0.03em', marginBottom: 6 }}>Sent!</h2>
          <p style={{ fontSize: 14, color: 'var(--nan-text2)', marginBottom: 28 }}>
            {formatUSDC(parseFloat(amount))} {selectedToken.symbol} sent to {formatAddress(recipient)}
          </p>
          <div style={{
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
            borderRadius: 16, padding: '16px 20px', marginBottom: 24, textAlign: 'left',
          }}>
            {[
              { label: 'Amount', value: `${formatUSDC(parseFloat(amount))} ${selectedToken.symbol}` },
              { label: 'To', value: formatAddress(recipient) },
              { label: 'Network', value: 'Arc Testnet' },
              { label: 'Fee', value: '~0.00 USDC' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--nan-bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--nan-text2)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
              </div>
            ))}
            {txHash && (
              <div style={{ paddingTop: 8 }}>
                <a href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#0066FF', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                  <ExternalLink size={12} /> View on explorer
                </a>
              </div>
            )}
          </div>
          <button onClick={onSuccess} style={{
            width: '100%', height: 50, borderRadius: 12, background: '#0066FF',
            color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', fontFamily: SANS,
          }}>Back to Wallet</button>
        </div>
      </div>
    )
  }

  // ── submitting ─────────────────────────────────────────────────────────────
  if (displayStep === 'submitting') {
    return (
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, fontFamily: SANS,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 28, height: 28, border: '2px solid #0066FF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--nan-text)', margin: 0 }}>
          {isPending ? 'Confirm in wallet' : 'Confirming…'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--nan-text2)', margin: 0 }}>
          {isPending ? 'Approve the transaction in your wallet.' : 'Waiting for blockchain confirmation…'}
        </p>
      </div>
    )
  }

  // ── DESKTOP layout ─────────────────────────────────────────────────────────
  if (isDesktop) {
    const numVal = parseFloat(amount) || 0
    const canProceedAmount = amount !== '' && numVal > 0 && numVal <= rawNum
    const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','backspace']

    return (
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SANS, padding: '24px',
        background: 'var(--nan-bg)',
      }}>
        <div style={{
          width: '100%', maxWidth: 900,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
          alignItems: 'start',
        }}>

          {/* ── Left: amount entry + numpad ── */}
          <div style={{
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
            borderRadius: 24, padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 0,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--nan-text)', letterSpacing: '-0.03em', margin: 0 }}>Send</h2>
              <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} color="var(--nan-text2)" />
              </button>
            </div>

            {/* Amount display */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: amount ? 'var(--nan-text)' : 'rgba(255,255,255,0.2)', letterSpacing: '-0.04em', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span>{amount || '0'}</span>
                <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{selectedToken.symbol}</span>
              </div>
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--nan-surface2)', borderRadius: 100, padding: '5px 14px' }}>
                <span style={{ fontSize: 13, color: 'var(--nan-text2)' }}>$ {(numVal).toFixed(2)}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--nan-text3)', marginBottom: 20 }}>
              {formatUSDC(rawNum)} {selectedToken.symbol} available
            </div>
            {amountError && <p style={{ fontSize: 12, color: '#FF3B3B', textAlign: 'center', marginBottom: 8 }}>{amountError}</p>}

            {/* Quick amounts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {['25%', '50%', '75%', 'Max'].map((lbl) => (
                <button key={lbl} onClick={() => {
                  const pct = lbl === 'Max' ? 1 : parseFloat(lbl) / 100
                  setAmount((rawNum * pct).toFixed(6).replace(/\.?0+$/, ''))
                  setAmountError('')
                }} style={{
                  height: 44, borderRadius: 12,
                  background: 'var(--nan-surface2)', border: '1px solid var(--nan-bdr)',
                  color: 'var(--nan-text)', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: SANS,
                }}>{lbl}</button>
              ))}
            </div>

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {KEYS.map((k) => (
                <button key={k} onClick={() => handleKey(k)} style={{
                  height: 60, borderRadius: 14,
                  background: k === 'backspace' ? 'transparent' : 'var(--nan-surface2)',
                  border: k === 'backspace' ? 'none' : '1px solid var(--nan-bdr)',
                  color: 'var(--nan-text)', fontSize: k === 'backspace' ? 18 : 22,
                  fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.1s',
                }}>
                  {k === 'backspace' ? '⌫' : k}
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: recipient + confirm ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Recipient input */}
            <div style={{
              background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
              borderRadius: 24, padding: '28px',
            }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
                Recipient Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={recipient}
                onChange={e => { setRecipient(e.target.value); setRecipientError('') }}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  background: 'var(--nan-surface2)', border: `1px solid ${recipientError ? '#FF3B3B' : 'var(--nan-bdr)'}`,
                  color: 'var(--nan-text)', fontSize: 14, fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {recipientError && <p style={{ fontSize: 12, color: '#FF3B3B', marginTop: 6 }}>{recipientError}</p>}
            </div>

            {/* Note (optional) */}
            <div style={{
              background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
              borderRadius: 24, padding: '28px',
            }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--nan-text3)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginBottom: 12 }}>
                Note (optional)
              </label>
              <input
                type="text"
                placeholder="What's this for?"
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  background: 'var(--nan-surface2)', border: '1px solid var(--nan-bdr)',
                  color: 'var(--nan-text)', fontSize: 14, fontFamily: SANS,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Summary */}
            {(amount || recipient) && (
              <div style={{
                background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)',
                borderRadius: 24, padding: '20px 24px',
              }}>
                {[
                  { label: 'Sending', value: amount ? `${formatUSDC(numVal)} ${selectedToken.symbol}` : '—' },
                  { label: 'To', value: recipient ? formatAddress(recipient) : '—' },
                  { label: 'Fee', value: '~0.00 USDC' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--nan-bdr)' }}>
                    <span style={{ fontSize: 13, color: 'var(--nan-text2)' }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Wrong chain */}
            {isWrongChain && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 12, padding: '12px 16px' }}>
                <AlertCircle size={15} color="#FF3B3B" />
                <span style={{ fontSize: 13, color: '#FF3B3B', flex: 1 }}>Switch to Arc Testnet to send.</span>
                <button onClick={() => switchChain({ chainId: ARC_TESTNET_ID })} style={{ fontSize: 12, fontWeight: 700, color: '#FF3B3B', background: 'none', border: 'none', cursor: 'pointer' }}>Switch</button>
              </div>
            )}

            {/* Confirm button */}
            <button
              disabled={!canProceedAmount || !recipient}
              onClick={() => {
                if (!validateAmount() || !validateRecipient()) return
                handleSend()
              }}
              style={{
                width: '100%', height: 56, borderRadius: 16,
                background: canProceedAmount && recipient ? '#0066FF' : 'var(--nan-surface2)',
                border: 'none', cursor: canProceedAmount && recipient ? 'pointer' : 'not-allowed',
                color: canProceedAmount && recipient ? '#fff' : 'var(--nan-text3)',
                fontSize: 16, fontWeight: 700, fontFamily: SANS,
                boxShadow: canProceedAmount && recipient ? '0 4px 20px rgba(0,102,255,0.35)' : 'none',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <ArrowUpRight size={18} />
              {isWrongChain ? 'Switch Network First' : 'Confirm & Send'}
            </button>

            {displayStep === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 12, padding: '12px 16px' }}>
                <AlertCircle size={15} color="#FF3B3B" />
                <span style={{ fontSize: 13, color: '#FF3B3B' }}>{parseOnchainError(writeError)}</span>
                <button onClick={() => { reset(); setStep('review') }} style={{ fontSize: 12, fontWeight: 700, color: '#FF3B3B', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>Retry</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── MOBILE layout ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 100px', fontFamily: SANS }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={displayStep === 'recipient' ? onBack : () => setStep(
            displayStep === 'review' ? 'note' : displayStep === 'note' ? 'amount' : 'recipient'
          )}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={16} color="var(--nan-text)" />
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--nan-text)', letterSpacing: '-0.02em' }}>
            Send {selectedToken.symbol}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nan-text3)', marginTop: 1 }}>
            {displayStep === 'recipient' && 'Step 1 of 4 — Recipient'}
            {displayStep === 'amount' && 'Step 2 of 4 — Amount'}
            {displayStep === 'note' && 'Step 3 of 4 — Note'}
            {displayStep === 'review' && 'Step 4 of 4 — Review'}
            {displayStep === 'error' && 'Transaction failed'}
          </div>
        </div>
      </div>

      {isWrongChain && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
          <AlertCircle size={14} color="#FF3B3B" />
          <span style={{ fontSize: 13, color: '#FF3B3B', flex: 1 }}>Switch to Arc Testnet first.</span>
          <button onClick={() => switchChain({ chainId: ARC_TESTNET_ID })} style={{ fontSize: 12, fontWeight: 700, color: '#FF3B3B', background: 'none', border: 'none', cursor: 'pointer' }}>Switch</button>
        </div>
      )}

      {/* ── Step: recipient ── */}
      {displayStep === 'recipient' && (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px' }}>
          {/* Token selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Token</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SEND_TOKENS.map(tok => (
                <button key={tok.symbol} onClick={() => setSelectedToken(tok)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '10px 12px', borderRadius: 12,
                  background: selectedToken.symbol === tok.symbol ? 'rgba(0,102,255,0.12)' : 'var(--nan-surface2)',
                  border: `1.5px solid ${selectedToken.symbol === tok.symbol ? 'rgba(0,102,255,0.4)' : 'var(--nan-bdr)'}`,
                  cursor: 'pointer', fontFamily: SANS,
                }}>
                  <TokenLogo symbol={tok.symbol} size={20} radius={6} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: selectedToken.symbol === tok.symbol ? '#0066FF' : 'var(--nan-text)' }}>{tok.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Recipient Address</div>
          <input
            type="text"
            placeholder="0x..."
            value={recipient}
            onChange={e => { setRecipient(e.target.value); setRecipientError('') }}
            autoFocus
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12, boxSizing: 'border-box',
              background: 'var(--nan-surface2)', border: `1.5px solid ${recipientError ? '#FF3B3B' : 'var(--nan-bdr)'}`,
              color: 'var(--nan-text)', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', outline: 'none',
            }}
          />
          {recipientError && <p style={{ fontSize: 12, color: '#FF3B3B', marginTop: 6 }}>{recipientError}</p>}
          <button
            onClick={() => { if (validateRecipient()) setStep('amount') }}
            style={{
              width: '100%', height: 50, borderRadius: 12, marginTop: 16,
              background: '#0066FF', border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >Continue <ChevronRight size={16} /></button>
        </div>
      )}

      {/* ── Step: amount ── */}
      {displayStep === 'amount' && (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Amount</div>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={e => { setAmount(e.target.value); setAmountError('') }}
              autoFocus
              style={{
                width: '100%', padding: '14px 72px 14px 16px', borderRadius: 12, boxSizing: 'border-box',
                background: 'var(--nan-surface2)', border: `1.5px solid ${amountError ? '#FF3B3B' : 'var(--nan-bdr)'}`,
                color: 'var(--nan-text)', fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: 'var(--nan-text3)' }}>
              {selectedToken.symbol}
            </span>
          </div>
          {amountError && <p style={{ fontSize: 12, color: '#FF3B3B', marginTop: 6 }}>{amountError}</p>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--nan-text3)' }}>
              Available: <strong style={{ color: 'var(--nan-text)' }}>{formatUSDC(rawNum)} {selectedToken.symbol}</strong>
            </span>
            <button onClick={() => { setAmount(rawNum.toFixed(6)); setAmountError('') }}
              style={{ fontSize: 13, fontWeight: 700, color: '#0066FF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS }}>
              MAX
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['20%', '50%', '75%'].map(pct => (
              <button key={pct} onClick={() => {
                const p = parseFloat(pct) / 100
                setAmount((rawNum * p).toFixed(6).replace(/\.?0+$/, ''))
                setAmountError('')
              }} style={{
                flex: 1, height: 40, borderRadius: 10,
                background: 'var(--nan-surface2)', border: '1px solid var(--nan-bdr)',
                color: 'var(--nan-text)', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: SANS,
              }}>{pct}</button>
            ))}
          </div>

          <button
            onClick={() => { if (validateAmount()) setStep('note') }}
            style={{
              width: '100%', height: 50, borderRadius: 12,
              background: '#0066FF', border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >Continue <ChevronRight size={16} /></button>
        </div>
      )}

      {/* ── Step: note ── */}
      {displayStep === 'note' && (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px' }}>
          <Textarea label="Add a note (optional)" placeholder="What's this payment for?" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <button onClick={() => setStep('review')} style={{
            width: '100%', height: 50, borderRadius: 12, marginTop: 16,
            background: '#0066FF', border: 'none', color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>Review <ChevronRight size={16} /></button>
        </div>
      )}

      {/* ── Step: review ── */}
      {displayStep === 'review' && (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '20px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--nan-text)', marginBottom: 16 }}>Review transaction</div>
          {[
            { label: 'Token', value: selectedToken.symbol },
            { label: 'Recipient', value: formatAddress(recipient) },
            { label: 'Amount', value: `${formatUSDC(parseFloat(amount || '0'))} ${selectedToken.symbol}` },
            { label: 'Network', value: 'Arc Testnet' },
            ...(note ? [{ label: 'Note', value: note }] : []),
            { label: 'Fee', value: '~0.00 (gas-free)' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--nan-bdr)' }}>
              <span style={{ fontSize: 13, color: 'var(--nan-text2)' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nan-text)', fontFamily: label === 'Recipient' || label === 'Amount' ? 'JetBrains Mono, monospace' : SANS }}>{value}</span>
            </div>
          ))}
          <button
            onClick={handleSend}
            disabled={isPending || isConfirming || isWrongChain}
            style={{
              width: '100%', height: 50, borderRadius: 12, marginTop: 16,
              background: isPending || isConfirming ? 'var(--nan-surface2)' : '#0066FF',
              border: 'none', color: isPending || isConfirming ? 'var(--nan-text3)' : '#fff',
              fontSize: 15, fontWeight: 700, cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', fontFamily: SANS,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : isWrongChain ? 'Switch Network First' : 'Confirm & Send'}
          </button>
        </div>
      )}

      {/* ── Step: error ── */}
      {displayStep === 'error' && (
        <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle size={16} color="#FF3B3B" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FF3B3B', marginBottom: 4 }}>Transaction failed</div>
              <div style={{ fontSize: 12, color: '#FF3B3B' }}>{parseOnchainError(writeError)}</div>
            </div>
          </div>
          <button onClick={() => { reset(); setStep('review') }} style={{
            width: '100%', height: 44, borderRadius: 10, marginTop: 12,
            background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
          }}>Try again</button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-nan2">{label}</span>
      <span className={`text-sm font-semibold text-nan ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function ReceiveView({ address, onBack }: { address: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const shortAddr = `${address.slice(0, 8)}...${address.slice(-6)}`

  const copyAddress = () => {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  const nativeShare = () => {
    void navigator.share?.({
      title: 'My NAN Wallet',
      text: `Send me USDC on Arc Testnet: ${address}`,
      url: window.location.href,
    })
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex', flexDirection: 'column',
      maxWidth: 480, margin: '0 auto',
      padding: '20px 20px 32px',
      fontFamily: SANS,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, WebkitTapHighlightColor: 'transparent',
        }}>
          <X size={22} color="var(--nan-text)" />
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--nan-text)', marginLeft: 12, letterSpacing: '-0.02em' }}>
          Receive
        </h1>
      </div>

      {/* QR code — large, centered */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div ref={qrRef} style={{
          width: 260, height: 260,
          background: 'var(--nan-surface)',
          borderRadius: 24,
          padding: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        }}>
          <QRCodeSVG
            value={address}
            size={220}
            bgColor="transparent"
            fgColor="#ffffff"
            level="M"
          />
        </div>

        {/* Network + address */}
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--nan-text)' }}>Arc Testnet</span>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--nan-text3)', display: 'inline-block' }} />
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--nan-text3)', fontFamily: 'JetBrains Mono, monospace' }}>{shortAddr}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--nan-text3)' }}>Only send USDC on Arc Testnet to this address</p>
        </div>
      </div>

      {/* Bottom buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32 }}>
        <button
          onClick={copyAddress}
          style={{
            width: '100%', height: 54, borderRadius: 100,
            background: copied ? '#00C853' : '#0066FF',
            border: 'none', cursor: 'pointer',
            fontSize: 16, fontWeight: 700, color: '#fff',
            fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 0.2s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
        <button
          onClick={nativeShare}
          style={{
            width: '100%', height: 54, borderRadius: 100,
            background: 'var(--nan-surface)',
            border: '1px solid var(--nan-bdr)',
            cursor: 'pointer',
            fontSize: 16, fontWeight: 700, color: 'var(--nan-text)',
            fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Share2 size={18} />
          Share
        </button>
      </div>
    </div>
  )
}
