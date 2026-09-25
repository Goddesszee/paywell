import React, { useState } from 'react'
import {
  Copy, QrCode, ArrowUpRight, ArrowDownLeft, Check, ExternalLink,
  AlertCircle, X, ChevronRight, Wallet
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input, Textarea } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { useAppStore, ActivityItem } from '../../store/appStore'
import { formatAddress, formatUSDC, parseOnchainError } from '../../utils/format'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'

const ARC_TESTNET_ID = 5042002
const SANS = 'Space Grotesk, sans-serif'

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
  const { agentPermissions, addActivity } = useAppStore()
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
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto mb-4">
          <Wallet size={28} className="text-[#A0A0A0]" />
        </div>
        <h2 className="text-xl font-bold text-[#0D0D0D] mb-2" style={{ fontFamily: SANS }}>
          Connect a wallet
        </h2>
        <p className="text-sm text-[#6B6B6B]">Connect your wallet to view your balance and send USDC.</p>
      </div>
    )
  }

  if (subView === 'send' || subView === 'send_confirm' || subView === 'send_success') {
    return (
      <SendFlow
        balance={rawNum}
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
        <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: SANS }}>Wallet</h1>
        <Badge variant="default" size="sm">{chain.name}</Badge>
      </div>

      {/* Balance card */}
      <div style={{
        background: 'linear-gradient(145deg,#1a1a1a 0%,#111 50%,#1a1a1a 100%)',
        borderRadius: 16, padding: '20px 20px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>
          Total Balance
        </div>
        {isLoading ? (
          <div style={{ height: 48, width: 160, background: 'rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 16 }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-1.5px', fontFamily: 'JetBrains Mono, monospace', marginBottom: 16 }}>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setSubView('send')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, background: '#fff', color: '#0D0D0D',
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
              flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.10)',
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
        <div className="text-xs font-bold text-[#A0A0A0] uppercase tracking-wider mb-3">Wallet address</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#F7F7F8] rounded-xl px-3 py-2.5 min-w-0">
            <div className="text-sm font-mono text-[#0D0D0D] truncate">
              {address.slice(0,10)}...{address.slice(-8)}
            </div>
          </div>
          <button onClick={handleCopy} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F5F5F5] hover:bg-[#ECECEC] text-[#0D0D0D] transition-colors flex-shrink-0">
            {copied ? <Check size={16} className="text-[#1a8047]" /> : <Copy size={16} />}
          </button>
          <button onClick={() => setSubView('receive')} className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#F5F5F5] hover:bg-[#ECECEC] text-[#0D0D0D] transition-colors flex-shrink-0">
            <QrCode size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#6B6B6B]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1a8047]" />
          Connected to {chain.name}
          <a
            href={`${chain.explorerBase}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[#0D0D0D] font-semibold hover:opacity-70 transition-opacity"
          >
            Explorer <ExternalLink size={11} />
          </a>
        </div>
      </Card>
    </div>
  )
}

// ─── Send Flow ────────────────────────────────────────────────────────────────

type SendStep = 'recipient' | 'amount' | 'note' | 'review' | 'submitting' | 'success' | 'error'

function SendFlow({
  balance,
  address: _address,
  chainId,
  onBack,
  onSuccess,
  addActivity,
}: {
  balance: number
  address: string
  chainId?: number
  onBack: () => void
  onSuccess: () => void
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void
}) {
  const [step, setStep] = useState<SendStep>('recipient')
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
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const isWrongChain = chainId !== undefined && chainId !== ARC_TESTNET_ID

  React.useEffect(() => {
    if (isSuccess && txHash) {
      setStep('success')
      addActivity({
        type: 'sent',
        description: noteRef.current || 'Sent USDC',
        amount: parseFloat(amountRef.current),
        sign: '-',
        status: 'confirmed',
        counterparty: formatAddress(recipientRef.current),
        txHash,
      })
      toast.success(`Sent ${amountRef.current} USDC successfully`)
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
    if (n > balance) { setAmountError(`Insufficient balance. You have ${formatUSDC(balance)} USDC`); return false }
    setAmountError('')
    return true
  }

  const handleSend = () => {
    if (!usdcFact) return
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const parsed = parseAmount(ARC_TESTNET_ID, amount)
    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parsed.raw],
      chainId: ARC_TESTNET_ID,
    })
  }

  if (displayStep === 'success') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-[#1a8047]" />
          </div>
          <h2 className="text-2xl font-bold text-[#0D0D0D] mb-1" style={{ fontFamily: SANS }}>Payment sent</h2>
          <p className="text-[#6B6B6B] text-sm mb-4">Your USDC has been sent successfully.</p>
          <div className="bg-[#F7F7F8] rounded-2xl p-4 text-left space-y-2.5 mb-6 max-w-xs mx-auto">
            <Row label="Amount" value={`${formatUSDC(parseFloat(amount))} USDC`} mono />
            <Row label="Recipient" value={formatAddress(recipient)} mono />
            <Row label="Network" value="Arc Testnet" />
            {txHash && (
              <div className="pt-2 border-t border-black/5">
                <a
                  href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#0D0D0D] font-semibold hover:opacity-70 transition-opacity"
                >
                  <ExternalLink size={12} /> View on explorer
                </a>
              </div>
            )}
          </div>
          <Button onClick={onSuccess} fullWidth>Back to Wallet</Button>
        </div>
      </div>
    )
  }

  if (displayStep === 'submitting') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center mx-auto">
          <div className="w-7 h-7 border-2 border-[#0D0D0D] border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: SANS }}>
          {isPending ? 'Confirm in wallet' : 'Confirming…'}
        </h2>
        <p className="text-sm text-[#6B6B6B]">
          {isPending ? 'Approve the transaction in your wallet.' : 'Waiting for blockchain confirmation…'}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={displayStep === 'recipient' ? onBack : () => setStep(
            displayStep === 'review' ? 'note' : displayStep === 'note' ? 'amount' : 'recipient'
          )}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F5F5F5] text-[#0D0D0D] transition-colors"
        >
          <X size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: SANS }}>Send USDC</h1>
          <p className="text-xs text-[#6B6B6B]">
            {displayStep === 'recipient' && 'Step 1 of 4 — Recipient'}
            {displayStep === 'amount' && 'Step 2 of 4 — Amount'}
            {displayStep === 'note' && 'Step 3 of 4 — Note (optional)'}
            {displayStep === 'review' && 'Step 4 of 4 — Review'}
            {displayStep === 'error' && 'Transaction failed'}
          </p>
        </div>
      </div>

      {isWrongChain && (
        <div className="flex items-center gap-2 bg-[#FEF9C3] border border-[#FDE68A] rounded-xl px-3 py-2.5">
          <AlertCircle size={15} className="text-[#854d0e] flex-shrink-0" />
          <p className="text-sm text-[#854d0e] font-medium flex-1">Switch to Arc Testnet to send USDC.</p>
          <Button size="sm" variant="secondary" onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}>Switch</Button>
        </div>
      )}

      {displayStep === 'recipient' && (
        <Card padding="lg">
          <Input
            label="Recipient address"
            placeholder="0x..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            error={recipientError}
            autoFocus
          />
          <div className="mt-4">
            <Button fullWidth onClick={() => { if (validateRecipient()) setStep('amount') }} iconRight={<ChevronRight size={16} />}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {displayStep === 'amount' && (
        <Card padding="lg">
          <Input
            label="Amount"
            placeholder="0.00"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={amountError}
            suffix={<span className="text-xs font-bold text-[#6B6B6B]">USDC</span>}
            autoFocus
          />
          <div className="mt-2 flex items-center justify-between text-xs text-[#6B6B6B]">
            <span>Available: <span className="font-semibold text-[#0D0D0D] tabular-nums">{formatUSDC(balance)} USDC</span></span>
            <button onClick={() => setAmount(balance.toFixed(6))} className="font-semibold text-[#0D0D0D] underline underline-offset-2">Max</button>
          </div>
          <div className="flex gap-2 mt-3">
            {[5, 10, 25, 50].map((v) => (
              <button key={v} onClick={() => setAmount(v.toString())} disabled={v > balance}
                className="flex-1 h-9 text-sm font-semibold rounded-xl bg-[#F5F5F5] hover:bg-[#ECECEC] text-[#0D0D0D] disabled:opacity-40 transition-colors">
                {v}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Button fullWidth onClick={() => { if (validateAmount()) setStep('note') }} iconRight={<ChevronRight size={16} />}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {displayStep === 'note' && (
        <Card padding="lg">
          <Textarea label="Add a note (optional)" placeholder="What's this payment for?" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <div className="mt-4">
            <Button fullWidth onClick={() => setStep('review')} iconRight={<ChevronRight size={16} />}>Review</Button>
          </div>
        </Card>
      )}

      {displayStep === 'review' && (
        <Card padding="lg">
          <h2 className="text-base font-bold text-[#0D0D0D] mb-4">Review transaction</h2>
          <div className="space-y-3 mb-6">
            <Row label="Recipient" value={formatAddress(recipient)} mono />
            <Row label="Amount" value={`${formatUSDC(parseFloat(amount || '0'))} USDC`} mono />
            <Row label="Network" value="Arc Testnet" />
            {note && <Row label="Note" value={note} />}
            <div className="pt-2 border-t border-black/5">
              <Row label="Fee" value="~0.00 USDC (gas-free)" />
            </div>
          </div>
          <Button fullWidth onClick={handleSend} loading={isPending || isConfirming} disabled={isWrongChain} size="lg">
            {isWrongChain ? 'Switch Network First' : 'Confirm & Send'}
          </Button>
        </Card>
      )}

      {displayStep === 'error' && (
        <div className="space-y-3">
          <Card padding="md">
            <div className="flex items-start gap-2 text-[#DC2626]">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Transaction failed</p>
                <p className="text-xs mt-1">{parseOnchainError(writeError)}</p>
              </div>
            </div>
          </Card>
          <Button fullWidth variant="secondary" onClick={() => { reset(); setStep('review') }}>Try again</Button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[#6B6B6B]">{label}</span>
      <span className={`text-sm font-semibold text-[#0D0D0D] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function ReceiveView({ address, onBack }: { address: string; onBack: () => void }) {
  const [copied, setCopied] = useState(false)
  const [showRequest, setShowRequest] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')
  const [requestNote, setRequestNote] = useState('')

  const handleCopy = () => {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  const requestLink = requestAmount
    ? `paywell://pay?to=${address}&amount=${requestAmount}${requestNote ? `&note=${encodeURIComponent(requestNote)}` : ''}`
    : ''

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4 pb-28 lg:pb-8">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F5F5F5] text-[#0D0D0D]">
          <X size={18} />
        </button>
        <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: SANS }}>Receive USDC</h1>
      </div>

      <Card padding="lg" className="text-center">
        <div className="w-44 h-44 mx-auto mb-4 bg-[#F7F7F8] rounded-2xl flex items-center justify-center border border-black/5">
          <div className="text-center">
            <QrCode size={56} className="text-[#0D0D0D] mx-auto mb-2" />
            <p className="text-xs text-[#6B6B6B]">QR code</p>
          </div>
        </div>
        <p className="text-xs text-[#A0A0A0] font-medium mb-2">Your wallet address</p>
        <p className="text-sm font-mono text-[#0D0D0D] break-all px-2 mb-4">{address}</p>
        <div className="flex gap-2">
          <Button fullWidth variant="secondary" onClick={handleCopy} icon={copied ? <Check size={15} /> : <Copy size={15} />}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button fullWidth variant="secondary" onClick={() => { void navigator.share?.({ title: 'My Paywell Address', text: address }) }}>
            Share
          </Button>
        </div>
      </Card>

      <Card padding="md">
        <button onClick={() => setShowRequest(!showRequest)} className="w-full flex items-center justify-between">
          <span className="text-sm font-bold text-[#0D0D0D]">Create payment request</span>
          <ChevronRight size={16} className={`text-[#A0A0A0] transition-transform ${showRequest ? 'rotate-90' : ''}`} />
        </button>
        {showRequest && (
          <div className="mt-4 space-y-3">
            <Input label="Amount (USDC)" placeholder="25.00" type="number" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} suffix={<span className="text-xs font-bold text-[#6B6B6B]">USDC</span>} />
            <Input label="Description (optional)" placeholder="What's this for?" value={requestNote} onChange={(e) => setRequestNote(e.target.value)} />
            {requestAmount && (
              <div className="bg-[#F7F7F8] rounded-xl p-3">
                <p className="text-xs text-[#6B6B6B] mb-1 font-medium">Payment request link</p>
                <p className="text-sm font-bold text-[#0D0D0D]">Request {formatUSDC(parseFloat(requestAmount))} USDC</p>
                <button
                  onClick={() => { void navigator.clipboard.writeText(requestLink); toast.success('Request link copied') }}
                  className="mt-2 flex items-center gap-1.5 text-xs text-[#0D0D0D] font-semibold hover:opacity-70 transition-opacity"
                >
                  <Copy size={12} /> Copy request link
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
