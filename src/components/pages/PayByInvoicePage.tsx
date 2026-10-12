/**
 * PayByInvoicePage — public invoice payment page.
 * Accessed via ?invoice=<id> — no NAN account needed.
 * Shows invoice details and lets anyone pay with crypto or card.
 */
import React, { useState, useEffect } from 'react'
import { FileText, CreditCard, Wallet, CheckCircle2, ExternalLink, Copy, AlertCircle, Loader } from 'lucide-react'
import { toast } from 'sonner'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { useAppStore, type Invoice } from '../../store/appStore'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount } from '@/onchain-money'
import { usePublicPage } from '../../hooks/usePublicPage'

const F    = "'Inter', -apple-system, sans-serif"
const BLUE = '#0866F5'
const GREEN = '#22C55E'
const RED  = '#EF4444'
const ARC  = 5042

function fmtAmt(n: number, cur = 'USDC') {
  return `${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return iso }
}

interface Props { invoiceId: string }

function NotFound() {
  return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, padding: '48px 24px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <FileText size={24} color="rgba(255,255,255,0.3)" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Invoice not found</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>This invoice link may have expired or doesn't exist.</div>
        <a href="https://nanarc.xyz" style={{ display: 'inline-block', marginTop: 20, fontSize: 13, fontWeight: 600, color: BLUE }}>Go to NAN →</a>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Loader size={28} color={BLUE} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading invoice…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export function PayByInvoicePage({ invoiceId }: Props) {
  usePublicPage()

  const { invoices, updateInvoice, recordInvoicePayment } = useAppStore()
  const localInvoice: Invoice | undefined = invoices.find(i => i.id === invoiceId)

  // Always fetch from the server — the local store may be empty (different device)
  // or stale (invoice updated after link was shared). Local copy used as instant
  // pre-render; server response is authoritative and replaces it once it arrives.
  const [remoteInvoice, setRemoteInvoice] = useState<Invoice | null>(null)
  const [fetchDone, setFetchDone] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/invoice/${invoiceId}`)
      .then(r => r.json())
      .then((data: { success: boolean; invoice?: Invoice }) => {
        if (data.success && data.invoice) {
          setRemoteInvoice(data.invoice)
        } else if (!localInvoice) {
          // Only mark not-found if we also have nothing locally
          setNotFound(true)
        }
      })
      .catch(() => { if (!localInvoice) setNotFound(true) })
      .finally(() => setFetchDone(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  // Show loading only when: no local copy AND server hasn't replied yet
  const loading = !localInvoice && !fetchDone

  // Prefer server copy (authoritative) once available, else local
  const invoice: Invoice | undefined = remoteInvoice ?? localInvoice ?? undefined

  const { address } = useAccount()
  const usdcFact = getUsdc(ARC)
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  const [tab, setTab] = useState<'crypto' | 'card'>('crypto')
  const [paid, setPaid] = useState(false)

  // Mark paid when tx confirms
  if (isSuccess && txHash && !paid && invoice) {
    setPaid(true)
    if (localInvoice) {
      recordInvoicePayment(invoice.id, { date: new Date().toISOString(), amount: invoice.amountDue, txHash, note: 'Paid via pay link' })
      updateInvoice(invoice.id, { status: 'paid', amountPaid: invoice.total, amountDue: 0, updatedAt: new Date().toISOString() })
    }
  }

  if (loading) return <LoadingScreen />
  if (notFound || !invoice) return <NotFound />

  const isPaidAlready = invoice.status === 'paid' || invoice.amountDue <= 0

  const sendPayment = () => {
    if (!address || !usdcFact || !invoice.payToAddress) return
    const raw = parseAmount(ARC, invoice.amountDue.toString()).raw
    writeContract({ address: usdcFact.address as `0x${string}`, abi: erc20Abi, functionName: 'transfer', args: [invoice.payToAddress as `0x${string}`, raw], chainId: ARC })
  }

  const copyAddress = () => {
    if (!invoice.payToAddress) return
    navigator.clipboard.writeText(invoice.payToAddress).then(() => toast.success('Address copied')).catch(() => {})
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (paid || isPaidAlready) return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, padding: '48px 24px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle2 size={32} color={GREEN} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Payment received!</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.5 }}>
          {fmtAmt(invoice.total, invoice.currency)} has been sent to {invoice.businessName}.
        </div>
        {txHash && (
          <a href={buildTxExplorerUrl(ARC, txHash)} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>
            View transaction <ExternalLink size={13} />
          </a>
        )}
        <div style={{ marginTop: 28 }}>
          <a href="https://nanarc.xyz" style={{ display: 'inline-block', padding: '12px 28px', background: BLUE, color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Get NAN wallet
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', fontFamily: F, padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>

      {/* NAN brand header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, width: '100%', maxWidth: 480 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="12" height="18">
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>NAN</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Secure payment</span>
      </div>

      {/* Invoice card */}
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, overflow: 'hidden', marginBottom: 20 }}>

        {/* Invoice header */}
        <div style={{ background: BLUE, padding: '20px 22px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Invoice {invoice.number}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{invoice.businessName}</div>
          {invoice.businessEmail && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{invoice.businessEmail}</div>}
        </div>

        {/* Amount + details */}
        <div style={{ padding: '20px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {fmtAmt(invoice.amountDue, invoice.currency)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Due {fmtDate(invoice.dueDate)}</div>
        </div>

        {/* Bill to */}
        <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Bill to</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{invoice.customerName}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Invoice</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{invoice.number}</div>
          </div>
        </div>

        {/* Line items summary */}
        {invoice.items.map(item => (
          <div key={item.id} style={{ padding: '10px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{item.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.quantity} × {fmtAmt(item.unitPrice, invoice.currency)}</div>
            </div>
          </div>
        ))}

        {/* Notes */}
        {invoice.notes && (
          <div style={{ padding: '12px 22px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{invoice.notes}</div>
          </div>
        )}
      </div>

      {/* Payment method tabs */}
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {([['crypto', <Wallet key="w" size={14} />, 'Crypto wallet'], ['card', <CreditCard key="c" size={14} />, 'Buy with card']] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, height: 38, background: tab === id ? '#fff' : 'transparent', color: tab === id ? '#111' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s' }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Crypto tab */}
        {tab === 'crypto' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>
            {invoice.payToAddress ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Send to</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
                  <div style={{ flex: 1, fontSize: 12, color: '#fff', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoice.payToAddress}</div>
                  <button onClick={copyAddress} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center' }}>
                    <Copy size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.5 }}>
                  Send exactly <strong style={{ color: '#fff' }}>{fmtAmt(invoice.amountDue, invoice.currency)}</strong> to the address above on the Arc network.
                </div>
                {address ? (
                  <button
                    onClick={sendPayment}
                    disabled={isPending || isConfirming}
                    style={{ width: '100%', height: 50, background: isPending || isConfirming ? 'rgba(8,102,245,0.5)' : BLUE, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', fontFamily: F }}
                  >
                    {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : `Pay ${fmtAmt(invoice.amountDue, invoice.currency)}`}
                  </button>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.5 }}>
                    Connect a wallet (MetaMask, WalletConnect) to pay with crypto, or use the card option above.
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 0' }}>
                <AlertCircle size={15} color="rgba(245,158,11,0.8)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  The invoice issuer hasn't added a USDC wallet address yet. Ask them to update the invoice with their payment address.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card tab — Circle onramp */}
        {tab === 'card' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 20 }}>
              Don't have crypto? Buy USDC with your card or bank account and it will be sent directly to the merchant.
            </div>
            {invoice.payToAddress ? (
              <a
                href={`https://nanarc.xyz/?pay=${invoice.payToAddress}&amount=${invoice.amountDue}&note=${encodeURIComponent(`Invoice ${invoice.number}`)}`}
                style={{ display: 'block', width: '100%', height: 50, background: BLUE, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center', lineHeight: '50px', boxSizing: 'border-box' }}
              >
                Buy &amp; pay with card
              </a>
            ) : (
              <div style={{ fontSize: 13, color: RED, textAlign: 'center' }}>No wallet address on this invoice.</div>
            )}
          </div>
        )}

        {/* Powered by */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          Powered by <a href="https://nanarc.xyz" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontWeight: 600 }}>NAN</a> · Circle · Arc
        </div>
      </div>
    </div>
  )
}
