/**
 * PaymentRequestPage
 * Full-page send flow shown when someone opens a payment link:
 *   https://nan-puce.vercel.app/?pay=0x...&amount=25&note=Rent
 * Works for both connected wallet users and new visitors.
 */
import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowUpRight, Check, Copy, ExternalLink, AlertCircle, X, ChevronRight, Wallet } from 'lucide-react'
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { useAppStore } from '../../store/appStore'
import { formatAddress, formatUSDC, parseOnchainError } from '../../utils/format'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'

// ── Resolve a ?pr=<id> payment request from the store ─────────────────────────
function usePrRequest(prId: string | null) {
  const { paymentRequests, updatePaymentRequest } = useAppStore()
  if (!prId) return null
  const req = paymentRequests.find(r => r.id === prId) ?? null
  // Mark as viewed (payer opened the link)
  if (req && req.status === 'pending') {
    updatePaymentRequest(req.id, { status: 'viewed' })
  }
  return req
}

const ARC_TESTNET_ID = 5042002
const FONT = "'Inter', -apple-system, sans-serif"
const BLACK = 'var(--nan-text)'
const SURFACE = 'var(--nan-surface)'
const BORDER = 'var(--nan-bdr)'
const TEXT2 = 'var(--nan-text2)'
const TEXT3 = 'var(--nan-text3)'

interface PaymentParams {
  to: string
  amount?: string
  note?: string
  prId?: string   // ?pr=<id> from a NAN payment request link
}

function parsePaymentParams(): PaymentParams | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const to = params.get('pay')
  if (!to || !isAddress(to)) return null
  return {
    to,
    amount: params.get('amount') ?? undefined,
    note: params.get('note') ?? undefined,
    prId: params.get('pr') ?? undefined,
  }
}

function useUsdcBalance(address: string) {
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  const { data: rawBalance } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })
  if (rawBalance === undefined) return 0
  return parseFloat(Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(6))
}

type Step = 'review' | 'edit_amount' | 'submitting' | 'success' | 'error'

export function PaymentRequestPage({ params }: { params: PaymentParams }) {
  const { address, chainId } = useAccount()
  const { addActivity, setActiveView, markPaymentRequestPaid } = useAppStore()
  const balance = useUsdcBalance(address ?? '')
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  // If this is a NAN payment request link, load the stored request
  const storedReq = usePrRequest(params.prId ?? null)

  const [step, setStep] = useState<Step>('review')
  const [amount, setAmount] = useState(params.amount ?? '')
  const [amountError, setAmountError] = useState('')
  const [copied, setCopied] = useState(false)

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const isWrongChain = !!chainId && chainId !== ARC_TESTNET_ID
  const displayStep: Step = (isPending || isConfirming) ? 'submitting' : step

  // Guard: expired or cancelled request
  const isBlocked = storedReq && (storedReq.status === 'expired' || storedReq.status === 'cancelled' || storedReq.status === 'paid')

  useEffect(() => {
    if (isSuccess && txHash) {
      setStep('success')
      addActivity({
        type: 'sent',
        description: params.note || `Payment to ${formatAddress(params.to)}`,
        amount: parseFloat(amount),
        sign: '-',
        status: 'confirmed',
        counterparty: formatAddress(params.to),
        txHash,
      })
      // Mark the payment request as paid
      if (params.prId) {
        markPaymentRequestPaid(params.prId, txHash, parseFloat(amount))
      }
      toast.success(`Sent ${formatUSDC(parseFloat(amount))} USDC`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  useEffect(() => {
    if (writeError) {
      const msg = parseOnchainError(writeError)
      if (!msg.includes('cancelled')) { setStep('error'); toast.error(msg) }
      else { setStep('review'); reset() }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError])

  const handleSend = () => {
    if (!usdcFact || !isAddress(params.to)) return
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) { setAmountError('Enter a valid amount'); return }
    if (n > balance) { setAmountError(`Insufficient balance (${formatUSDC(balance)} USDC)`); return }
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const parsed = parseAmount(ARC_TESTNET_ID, amount)
    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [params.to, parsed.raw],
      chainId: ARC_TESTNET_ID,
    })
  }

  const copyAddress = () => {
    void navigator.clipboard.writeText(params.to)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  // ── Success ──
  if (displayStep === 'success') {
    return (
      <FullPage>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Check size={28} color={BLACK} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: BLACK, fontFamily: FONT, marginBottom: 8 }}>Payment sent</h1>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 24 }}>
            {formatUSDC(parseFloat(amount))} USDC sent to {formatAddress(params.to)}
          </p>
          {params.note && (
            <p style={{ fontSize: 13, color: TEXT3, marginBottom: 20 }}>"{params.note}"</p>
          )}
          {txHash && (
            <a
              href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BLACK, textDecoration: 'none', marginBottom: 28 }}
            >
              <ExternalLink size={13} /> View on explorer
            </a>
          )}
          <button
            onClick={() => setActiveView('home')}
            style={{ display: 'block', width: '100%', padding: '14px', background: '#0066FF', color: '#fff', borderRadius: 12, border: 'none', fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Back to NAN
          </button>
        </div>
      </FullPage>
    )
  }

  // ── Submitting ──
  if (displayStep === 'submitting') {
    return (
      <FullPage>
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <div style={{ width: 26, height: 26, border: `2px solid ${BLACK}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BLACK, fontFamily: FONT }}>
            {isPending ? 'Confirm in wallet…' : 'Confirming…'}
          </h2>
          <p style={{ fontSize: 13, color: TEXT2, marginTop: 8 }}>
            {isPending ? 'Approve the transaction in your wallet.' : 'Waiting for blockchain confirmation…'}
          </p>
        </div>
      </FullPage>
    )
  }

  // ── Blocked state (expired / cancelled / already paid) ─────────────────────
  if (isBlocked && storedReq) {
    const msgMap: Record<string, { title: string; body: string }> = {
      expired:   { title: 'Request Expired',   body: 'This payment request has passed its due date.' },
      cancelled: { title: 'Request Cancelled', body: 'This payment request has been cancelled.' },
      paid:      { title: 'Already Paid',      body: 'This payment request has already been settled.' },
    }
    const msg = msgMap[storedReq.status] ?? { title: 'Unavailable', body: 'This payment link is no longer active.' }
    return (
      <FullPage>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--nan-text)', marginBottom: 12 }}>{msg.title}</div>
          <p style={{ fontSize: 14, color: TEXT2, marginBottom: 28 }}>{msg.body}</p>
          <button onClick={() => setActiveView('home')} style={{ padding: '12px 28px', background: '#0066FF', color: '#fff', borderRadius: 12, border: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Go to NAN
          </button>
        </div>
      </FullPage>
    )
  }

  return (
    <FullPage>
      {/* NAN wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--nan-text)' }}>NAN</span>
        <span style={{ fontSize: 11, color: TEXT3, background: SURFACE, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>Arc Testnet</span>
      </div>

      {/* Request card */}
      <div style={{ background: BLACK, borderRadius: 20, padding: '24px 20px', marginBottom: 20, textAlign: 'center' }}>
        {/* If opened from a NAN payment request, show requester info */}
        {storedReq && (
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>Payment requested by</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{storedReq.recipientName}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{storedReq.refNumber}</div>
          </div>
        )}

        {/* QR */}
        <div style={{ width: 140, height: 140, background: '#0066FF', borderRadius: 14, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QRCodeSVG value={params.to} size={120} bgColor="#08090B" fgColor="#ffffff" level="M" />
        </div>

        {/* Amount */}
        <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: FONT, letterSpacing: '-1px', marginBottom: 4 }}>
          {amount ? `${formatUSDC(parseFloat(amount))} USDC` : 'Any amount'}
        </div>
        {(storedReq?.title || params.note) && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
            "{storedReq?.title ?? params.note}"
          </div>
        )}

        {/* To address */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px' }}>
          <Wallet size={14} color="rgba(255,255,255,0.5)" />
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>
            {params.to.slice(0, 10)}…{params.to.slice(-8)}
          </span>
          <button
            onClick={copyAddress}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            {copied ? <Check size={13} color="rgba(255,255,255,0.7)" /> : <Copy size={13} color="rgba(255,255,255,0.5)" />}
          </button>
        </div>
      </div>

      {/* Not connected */}
      {!address && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: BLACK, fontWeight: 600, fontFamily: FONT, marginBottom: 4 }}>Connect a wallet to pay</p>
          <p style={{ fontSize: 12, color: TEXT2, marginBottom: 14 }}>You need a connected wallet to send USDC on Arc Testnet.</p>
          <button
            onClick={() => setActiveView('wallet')}
            style={{ padding: '10px 24px', background: '#0066FF', color: '#fff', borderRadius: 10, border: 'none', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Connect wallet
          </button>
        </div>
      )}

      {/* Wrong chain */}
      {address && isWrongChain && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
          <AlertCircle size={14} color={BLACK} />
          <p style={{ fontSize: 13, color: BLACK, flex: 1, fontFamily: FONT }}>Switch to Arc Testnet to send USDC.</p>
          <button
            onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
            style={{ padding: '6px 14px', background: '#0066FF', color: '#fff', borderRadius: 8, border: 'none', fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Switch
          </button>
        </div>
      )}

      {/* Amount editor */}
      {address && (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
          {step === 'edit_amount' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: TEXT3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                Amount (USDC)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setAmountError('') }}
                  autoFocus
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--nan-bdr)', borderRadius: 10, fontFamily: FONT, fontSize: 16, fontWeight: 600, background: 'var(--nan-surface2)', color: 'var(--nan-text)', outline: 'none' }}
                  placeholder="0.00"
                />
                <button
                  onClick={() => setStep('review')}
                  style={{ padding: '10px 16px', background: '#0066FF', color: '#fff', borderRadius: 10, border: 'none', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Set
                </button>
              </div>
              {amountError && <p style={{ fontSize: 12, color: BLACK, marginTop: 6 }}>{amountError}</p>}
              <p style={{ fontSize: 12, color: TEXT3, marginTop: 8 }}>
                Your balance: <span style={{ fontWeight: 700, color: BLACK }}>{formatUSDC(balance)} USDC</span>
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: TEXT2, fontFamily: FONT }}>You pay</span>
                {!params.amount && (
                  <button
                    onClick={() => setStep('edit_amount')}
                    style={{ fontSize: 12, color: BLACK, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, textDecoration: 'underline' }}
                  >
                    Change
                  </button>
                )}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: BLACK, fontFamily: FONT, letterSpacing: '-0.5px' }}>
                {amount ? `${formatUSDC(parseFloat(amount))} USDC` : '—'}
              </div>
              <div style={{ fontSize: 12, color: TEXT3, marginTop: 4 }}>
                Balance: {formatUSDC(balance)} USDC
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {step === 'error' && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={15} color={BLACK} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: BLACK, fontFamily: FONT }}>Payment failed</p>
            <p style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{parseOnchainError(writeError)}</p>
          </div>
          <button onClick={() => { reset(); setStep('review') }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <X size={14} color={TEXT3} />
          </button>
        </div>
      )}

      {/* CTA */}
      {address && (
        <button
          onClick={handleSend}
          disabled={!amount || isWrongChain || parseFloat(amount) <= 0}
          style={{
            width: '100%', padding: '16px', background: (!amount || parseFloat(amount) <= 0) ? 'var(--nan-surface)' : '#0066FF',
            color: (!amount || parseFloat(amount) <= 0) ? TEXT3 : '#fff',
            border: 'none', borderRadius: 14, fontFamily: FONT, fontSize: 16, fontWeight: 800,
            cursor: (!amount || parseFloat(amount) <= 0) ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s', letterSpacing: '-0.01em',
          }}
        >
          <ArrowUpRight size={18} />
          {isWrongChain ? 'Switch Network' : `Pay ${amount ? formatUSDC(parseFloat(amount)) + ' USDC' : 'now'}`}
          {!isWrongChain && amount && <ChevronRight size={16} />}
        </button>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: TEXT3 }} />
        <span style={{ fontSize: 11, color: TEXT3, fontFamily: FONT }}>Secured by NAN · Built on Arc · Powered by Circle</span>
      </div>
    </FullPage>
  )
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--nan-bg)', fontFamily: FONT,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 20px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {children}
      </div>
    </div>
  )
}

// Auto-detect payment link params and export a hook
export function usePaymentRequestParams(): PaymentParams | null {
  const [params, setParams] = useState<PaymentParams | null>(null)
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { setParams(parsePaymentParams()) }, [])
  return params
}
