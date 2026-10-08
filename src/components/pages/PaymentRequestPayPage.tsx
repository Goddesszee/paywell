/**
 * Public payment-link page — no NAN account required.
 * Three payment methods: Connect Wallet, Scan QR, Copy Address.
 */
import React, { useState, useEffect } from 'react'
import {
  CheckCircle2, AlertCircle, Clock, XCircle,
  ArrowUpRight, ExternalLink, Copy, Check,
  Wallet, Smartphone,
} from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { useAppStore, PaymentRequest } from '../../store/appStore'
import { NanLogo } from '../NanLogo'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const BLUE = '#0066FF'
const ARC_TESTNET_ID = 5042002
const USDC_ADDRESS   = '0x3600000000000000000000000000000000000000' as `0x${string}`
const USDC_DECIMALS  = 6

function fmt(n: number) {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Status banner ──────────────────────────────────────────────────────────────
function StatusBanner({ req }: { req: PaymentRequest }) {
  if (req.status === 'paid') return (
    <div style={{ background: '#e8f8ef', border: '1px solid #b6e8cb', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 24 }}>
      <CheckCircle2 size={18} color="#1a7a42" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a7a42', marginBottom: 2 }}>Payment received</div>
        <div style={{ fontSize: 12, color: '#2d6a4f' }}>
          Paid on {req.paidAt ? new Date(req.paidAt).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}.
        </div>
        {req.paidTxHash && (
          <div style={{ fontSize: 11, color: '#2d6a4f', fontFamily: MONO, marginTop: 3 }}>
            Tx: {req.paidTxHash.slice(0, 12)}…{req.paidTxHash.slice(-8)}
          </div>
        )}
      </div>
    </div>
  )
  if (req.status === 'cancelled') return (
    <div style={{ background: '#fee8e8', border: '1px solid #f5c6c6', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 24 }}>
      <XCircle size={18} color='#c0392b' style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b' }}>Request cancelled</div>
        <div style={{ fontSize: 12, color: '#922b21' }}>This payment request has been cancelled.</div>
      </div>
    </div>
  )
  if (req.status === 'expired') return (
    <div style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 24 }}>
      <AlertCircle size={18} color='#888' style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#555' }}>Request expired</div>
        <div style={{ fontSize: 12, color: '#777' }}>The due date for this request has passed.</div>
      </div>
    </div>
  )
  return null
}

// ── Method tab button ──────────────────────────────────────────────────────────
function MethodTab({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '12px 8px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
        background: active ? '#fff' : 'transparent',
        border: active ? '1px solid #e0e0e0' : '1px solid transparent',
        boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
        color: active ? '#111' : '#888',
      }}
    >
      <div style={{ color: active ? BLUE : '#aaa', transition: 'color 0.15s' }}>{icon}</div>
      <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, fontFamily: F, letterSpacing: '0.01em' }}>{label}</span>
    </button>
  )
}

// ── Connect-wallet panel ───────────────────────────────────────────────────────
function WalletPanel({
  req, onSuccess,
}: {
  req: PaymentRequest
  onSuccess: (txHash: string) => void
}) {
  const { address, isConnected } = useAccount()
  const { markPaymentRequestPaid, addActivity } = useAppStore()
  const [paying, setPaying] = useState(false)

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess && txHash) {
      markPaymentRequestPaid(req.id, txHash, req.amount, `act-${Date.now()}`)
      addActivity({
        type: 'received',
        description: `Payment for ${req.title}`,
        amount: req.amount,
        sign: '+',
        status: 'confirmed',
        counterparty: address,
        txHash,
        chain: 'Arc Testnet',
      })
      setPaying(false)
      onSuccess(txHash)
      toast.success('Payment sent!')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  const handlePay = () => {
    if (!isConnected || !address) return
    const dest = req.creatorAddress
    if (!dest || !isAddress(dest)) {
      toast.error("Requester's wallet address is missing.")
      return
    }
    setPaying(true)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [dest, BigInt(Math.round(req.amount * 10 ** USDC_DECIMALS))],
      chainId: ARC_TESTNET_ID,
    })
  }

  const isDisabled = paying || isPending || isConfirming

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.5 }}>
          Connect any EVM wallet to pay instantly with USDC on Arc Testnet.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ConnectKitButton />
        </div>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 14 }}>
          MetaMask, Coinbase Wallet, WalletConnect, and more
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#666', marginBottom: 14 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00C853', display: 'inline-block', flexShrink: 0 }} />
        Connected: {address.slice(0, 10)}…{address.slice(-6)}
      </div>

      {writeError && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fee8e8', border: '1px solid #f5c6c6', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <AlertCircle size={14} color='#c0392b' style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: '#c0392b' }}>
            {writeError.message?.includes('rejected') ? 'Rejected in wallet.' : 'Transaction failed. Please try again.'}
          </span>
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={isDisabled}
        style={{
          width: '100%', height: 52, borderRadius: 14,
          background: isDisabled ? '#d0d0d0' : BLUE,
          border: 'none', color: '#fff', fontSize: 16, fontWeight: 700,
          cursor: isDisabled ? 'not-allowed' : 'pointer', fontFamily: F,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: isDisabled ? 'none' : '0 4px 20px rgba(0,102,255,0.30)',
          transition: 'all 0.15s',
        }}
      >
        {isPending ? 'Approve in wallet…' :
         isConfirming ? (
           <>
             <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'nan-spin 0.8s linear infinite' }} />
             Confirming…
           </>
         ) : (
           <><ArrowUpRight size={18} /> Pay {fmt(req.amount)} {req.currency}</>
         )}
      </button>

      {writeError && (
        <button onClick={() => { reset(); setPaying(false) }} style={{ marginTop: 8, width: '100%', height: 40, borderRadius: 12, background: 'none', border: '1px solid #ddd', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
          Try again
        </button>
      )}
    </div>
  )
}

// ── QR panel ───────────────────────────────────────────────────────────────────
function QrPanel({ req }: { req: PaymentRequest }) {
  const addr = req.creatorAddress ?? ''
  // EIP-681 style URI for USDC transfer — wallets like MetaMask Mobile can parse this
  const amountHex = `0x${(BigInt(Math.round(req.amount * 10 ** USDC_DECIMALS))).toString(16)}`
  const qrValue = addr
    ? `ethereum:${USDC_ADDRESS}/transfer?address=${addr}&uint256=${amountHex}`
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
      {addr ? (
        <>
          <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <QRCodeSVG
              value={qrValue}
              size={188}
              bgColor="#ffffff"
              fgColor="#111111"
              level="M"
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 4 }}>
              Scan with your wallet app
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
              Open MetaMask, Trust Wallet, or any EVM wallet.<br />
              Tap <strong>Scan</strong> and point at this code.
            </div>
          </div>
          <div style={{ background: '#f7f8fa', border: '1px solid #eee', borderRadius: 10, padding: '8px 14px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pre-fills amount</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', fontFamily: MONO }}>
              {fmt(req.amount)} {req.currency}
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa', fontSize: 13 }}>
          <AlertCircle size={32} color='#ddd' style={{ marginBottom: 10 }} />
          <div>No wallet address on this request.</div>
        </div>
      )}
    </div>
  )
}

// ── Copy-address panel ─────────────────────────────────────────────────────────
function CopyPanel({ req }: { req: PaymentRequest }) {
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [copiedAmt, setCopiedAmt]   = useState(false)
  const addr = req.creatorAddress ?? ''

  const copy = (text: string, which: 'addr' | 'amt') => {
    void navigator.clipboard.writeText(text)
    if (which === 'addr') { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000) }
    else                  { setCopiedAmt(true);  setTimeout(() => setCopiedAmt(false),  2000) }
    toast.success('Copied!')
  }

  const steps = [
    { n: '1', text: 'Open your wallet app or exchange' },
    { n: '2', text: `Send exactly ${fmt(req.amount)} ${req.currency} (USDC on Arc Testnet)` },
    { n: '3', text: 'Paste the address below as the recipient' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Instructions */}
      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '14px 16px' }}>
        {steps.map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: s.n !== '3' ? 10 : 0 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</span>
            <span style={{ fontSize: 13, color: '#444', lineHeight: 1.4 }}>{s.text}</span>
          </div>
        ))}
      </div>

      {/* Amount row */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Amount</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, background: '#f7f8fa', border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 15, fontWeight: 700, color: '#111' }}>
            {fmt(req.amount)} {req.currency}
          </div>
          <button
            onClick={() => copy(`${req.amount}`, 'amt')}
            style={{ width: 40, height: 40, borderRadius: 10, background: copiedAmt ? '#e8f8ef' : '#f7f8fa', border: `1px solid ${copiedAmt ? '#b6e8cb' : '#e8e8e8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
          >
            {copiedAmt ? <Check size={15} color='#1a7a42' /> : <Copy size={15} color='#666' />}
          </button>
        </div>
      </div>

      {/* Address row */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recipient address (USDC · Arc Testnet)</div>
        {addr ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: '#f7f8fa', border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 14px', fontFamily: MONO, fontSize: 12, color: '#111', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {addr}
            </div>
            <button
              onClick={() => copy(addr, 'addr')}
              style={{ width: 40, height: 40, borderRadius: 10, background: copiedAddr ? '#e8f8ef' : '#f7f8fa', border: `1px solid ${copiedAddr ? '#b6e8cb' : '#e8e8e8'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            >
              {copiedAddr ? <Check size={15} color='#1a7a42' /> : <Copy size={15} color='#666' />}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#aaa', padding: '10px 0' }}>No address provided on this request.</div>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', paddingTop: 4 }}>
        After sending, share the transaction hash with the requester to confirm payment.
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function PaymentRequestPayPage({
  requestId = '',
  payAddress = '',
  amount: amountProp = 0,
  note: noteProp = '',
  currency: currencyProp = 'USDC',
}: {
  requestId?: string
  payAddress?: string
  amount?: number
  note?: string
  currency?: 'USDC' | 'EURC'
}) {
  const { paymentRequests, updatePaymentRequest } = useAppStore()

  // Look up the request in the local store first; fall back to URL params so
  // any payer — even without a NAN account — can open the link and pay.
  const storeReq = paymentRequests.find(r => r.id === requestId) ?? null
  const req: PaymentRequest | null = storeReq ?? (
    (payAddress && amountProp > 0)
      ? {
          id: requestId || 'external',
          title: noteProp || 'Payment Request',
          amount: amountProp,
          currency: currencyProp,
          status: 'pending',
          createdAt: Date.now(),
          creatorAddress: payAddress,
        }
      : null
  )

  type Method = 'wallet' | 'qr' | 'copy'
  const [method, setMethod] = useState<Method>('qr')
  const [successHash, setSuccessHash] = useState<string | null>(null)

  // Mark as viewed on open (only for store requests)
  useEffect(() => {
    if (storeReq && storeReq.status === 'pending') {
      updatePaymentRequest(storeReq.id, { status: 'viewed' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeReq?.id])

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!req) {
    return (
      <div style={{ minHeight: '100dvh', background: '#f4f6fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: F }}>
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e4e4e4', padding: '40px 28px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 32px rgba(0,0,0,0.08)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertCircle size={24} color='#c0392b' />
          </div>
          <div style={{ marginBottom: 16 }}><NanLogo height={20} /></div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111', marginBottom: 8 }}>Request not found</h2>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
            This payment link is invalid or has expired. Contact the person who sent it.
          </p>
        </div>
      </div>
    )
  }

  const isActive = req.status === 'pending' || req.status === 'viewed'

  // ── Success ──────────────────────────────────────────────────────────────────
  if (successHash) {
    return (
      <div style={{ minHeight: '100dvh', background: '#f4f6fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: F }}>
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e4e4e4', padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
          <div style={{ marginBottom: 24 }}><NanLogo height={24} /></div>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(0,200,83,0.10)', border: '2px solid rgba(0,200,83,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle2 size={34} color='#00C853' />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111', letterSpacing: '-0.03em', marginBottom: 8 }}>Payment sent!</h2>
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 24 }}>
            You successfully paid <strong>{fmt(req.amount)} {req.currency}</strong><br />for "{req.title}".
          </p>
          <a
            href={`https://explorer.testnet.arc.io/tx/${successHash}`}
            target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none', background: 'rgba(0,102,255,0.06)', padding: '8px 16px', borderRadius: 10 }}
          >
            <ExternalLink size={13} /> View on explorer
          </a>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.45 }}>
          <NanLogo height={13} />
          <span style={{ fontSize: 11, color: '#555', fontFamily: F }}>Powered by NAN</span>
        </div>
      </div>
    )
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#f4f6fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '32px 16px 48px', fontFamily: F }}>

      {/* Card */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e8e8e8', width: '100%', maxWidth: 460, boxShadow: '0 8px 40px rgba(0,0,0,0.09)', overflow: 'hidden' }}>

        {/* Top header — NAN branding */}
        <div style={{ background: '#111', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <NanLogo height={22} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: MONO, letterSpacing: '0.04em' }}>Arc Testnet</span>
        </div>

        {/* Request info */}
        <div style={{ padding: '24px 28px 0' }}>

          {/* From */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Payment request from</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>
              {req.creatorName || (req.creatorAddress ? `${req.creatorAddress.slice(0, 10)}…${req.creatorAddress.slice(-6)}` : 'NAN User')}
            </div>
          </div>

          {/* Amount hero */}
          <div style={{ background: '#f7f8fa', borderRadius: 14, padding: '20px 22px', marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Amount due</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#111', letterSpacing: '-0.04em', fontFamily: MONO, lineHeight: 1 }}>
                {fmt(req.amount)}
              </div>
              <div style={{ fontSize: 15, color: '#888', fontWeight: 600, marginTop: 4 }}>{req.currency} · USDC</div>
            </div>
            {req.dueDate && isActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '6px 10px' }}>
                <Clock size={12} color='#b45309' />
                <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                  Due {new Date(req.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {/* Detail rows */}
          {([
            { label: 'Description', value: req.title },
            ...(req.note       ? [{ label: 'Note',      value: req.note }]      : []),
            ...(req.reference  ? [{ label: 'Reference', value: req.reference }] : []),
          ] as { label: string; value: string }[]).map(({ label, value }, i, arr) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid #f2f2f2' : 'none', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#999', whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111', textAlign: 'right' }}>{value}</span>
            </div>
          ))}

          {/* Status banner for inactive requests */}
          <div style={{ marginTop: 16 }}>
            <StatusBanner req={req} />
          </div>
        </div>

        {/* Payment section — only when active */}
        {isActive && (
          <div style={{ padding: '0 28px 28px' }}>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 20px' }}>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
              <span style={{ fontSize: 11, color: '#bbb', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>No account needed — choose how to pay</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
            </div>

            {/* Method tabs */}
            <div style={{ display: 'flex', gap: 6, background: '#f4f4f4', borderRadius: 14, padding: 4, marginBottom: 22 }}>
              <MethodTab icon={<Smartphone size={18} />} label="Scan QR"     active={method === 'qr'}     onClick={() => setMethod('qr')} />
              <MethodTab icon={<Copy size={18} />}       label="Copy Address" active={method === 'copy'}   onClick={() => setMethod('copy')} />
              <MethodTab icon={<Wallet size={18} />}     label="Wallet"       active={method === 'wallet'} onClick={() => setMethod('wallet')} />
            </div>

            {/* Panel content */}
            {method === 'qr'     && <QrPanel req={req} />}
            {method === 'copy'   && <CopyPanel req={req} />}
            {method === 'wallet' && <WalletPanel req={req} onSuccess={setSuccessHash} />}

          </div>
        )}

      </div>

      {/* Powered by NAN footer */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 7, opacity: 0.4 }}>
        <NanLogo height={14} />
        <span style={{ fontSize: 11, color: '#555', fontFamily: F }}>Powered by NAN</span>
      </div>

      {/* Spinner animation */}
      <style>{`@keyframes nan-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
