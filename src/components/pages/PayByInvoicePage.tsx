/**
 * PayByInvoicePage — public invoice payment page.
 * Accessed via ?invoice=<id> — no NAN account needed.
 *
 * Three payment methods:
 *  1. Crypto address — copy address, scan QR, or use WalletConnect deep-link
 *  2. NAN name — type a .nan name, resolve onchain, confirm
 *  3. Buy with card — Circle onramp deep-link
 */
import React, { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  FileText, CreditCard, CheckCircle2, ExternalLink,
  Copy, AlertCircle, Loader, QrCode, AtSign,
  ChevronRight, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type Invoice } from '../../store/appStore'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { usePublicPage } from '../../hooks/usePublicPage'

const F     = "'Inter', -apple-system, sans-serif"
const BLUE  = '#0866F5'
const GREEN = '#22C55E'
const RED   = '#EF4444'
const AMBER = '#F59E0B'
const ARC   = 5042

function fmtAmt(n: number, cur = 'USDC') {
  return `${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}
function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}
function shortAddr(a: string) {
  if (!a) return ''
  return `${a.slice(0, 8)}...${a.slice(-6)}`
}

interface Props { invoiceId: string }

function NotFound() {
  return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, padding: '48px 24px' }}>
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

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'address' | 'nan' | 'card'

export function PayByInvoicePage({ invoiceId }: Props) {
  usePublicPage()

  // ── Remote fetch ──────────────────────────────────────────────────────────
  const { invoices, updateInvoice, recordInvoicePayment } = useAppStore()

  const localInvoice: Invoice | undefined = invoices.find(i => i.id === invoiceId)
  const [remoteInvoice, setRemoteInvoice] = useState<Invoice | null>(null)
  const [fetchDone, setFetchDone] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/invoices/${invoiceId}`)
      .then(r => r.json())
      .then((data: { success: boolean; invoice?: Invoice }) => {
        if (data.success && data.invoice) {
          setRemoteInvoice(data.invoice)
        } else if (!localInvoice) {
          setNotFound(true)
        }
      })
      .catch(() => { if (!localInvoice) setNotFound(true) })
      .finally(() => setFetchDone(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  const loading = !localInvoice && !fetchDone
  const invoice: Invoice | undefined = remoteInvoice ?? localInvoice ?? undefined

  const [tab, setTab] = useState<Tab>('address')
  const [showQr, setShowQr] = useState(false)
  const [nanPaid, setNanPaid] = useState(false)

  // success state
  const [paid, setPaid] = useState(false)
  const [paidTx, setPaidTx] = useState('')

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr)
      .then(() => toast.success('Address copied'))
      .catch(() => {})
  }

  // Mark as paid (called from NAN name confirm or when invoice already paid)
  const markPaid = (txHash?: string) => {
    setPaid(true)
    if (txHash) setPaidTx(txHash)
    if (invoice && localInvoice) {
      recordInvoicePayment(invoice.id, { date: new Date().toISOString(), amount: invoice.amountDue, txHash: txHash ?? '', note: 'Paid via pay link' })
      updateInvoice(invoice.id, { status: 'paid', amountPaid: invoice.total, amountDue: 0, updatedAt: new Date().toISOString() })
    }
  }

  if (loading) return <LoadingScreen />
  if (notFound || !invoice) return <NotFound />

  const isPaidAlready = invoice.status === 'paid' || invoice.amountDue <= 0

  // ── Success ────────────────────────────────────────────────────────────────
  if (paid || isPaidAlready || nanPaid) return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, padding: '48px 24px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle2 size={32} color={GREEN} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Payment sent!</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.5 }}>
          {fmtAmt(invoice.total, invoice.currency)} is on its way to {invoice.businessName}.
        </div>
        {paidTx && (
          <a href={buildTxExplorerUrl(ARC, paidTx)} target="_blank" rel="noopener noreferrer"
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#0A0E1A', fontFamily: F, padding: '24px 16px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>

      {/* NAN brand header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, width: '100%', maxWidth: 480 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        <div style={{ background: BLUE, padding: '20px 22px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Invoice {invoice.number}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{invoice.businessName}</div>
          {invoice.businessEmail && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{invoice.businessEmail}</div>}
        </div>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1 }}>
            {fmtAmt(invoice.amountDue, invoice.currency)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Due {fmtDate(invoice.dueDate)}</div>
        </div>
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
        {invoice.items.map(item => (
          <div key={item.id} style={{ padding: '10px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{item.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.quantity} × {fmtAmt(item.unitPrice, invoice.currency)}</div>
            </div>
          </div>
        ))}
        {invoice.notes && (
          <div style={{ padding: '12px 22px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{invoice.notes}</div>
          </div>
        )}
      </div>

      {/* Payment section */}
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Tab bar — 3 tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {([
            ['address', <QrCode key="q" size={13} />, 'Send crypto'],
            ['nan',     <AtSign  key="a" size={13} />, 'NAN name'],
            ['card',    <CreditCard key="c" size={13} />, 'Card'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ height: 38, background: tab === id ? '#fff' : 'transparent', color: tab === id ? '#111' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ── Tab 1: Send crypto (address + QR + WalletConnect) ── */}
        {tab === 'address' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>
            {invoice.payToAddress ? (
              <>
                {/* Wallet address row */}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Wallet address</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', marginBottom: 4 }}>
                  <div style={{ flex: 1, fontSize: 12, color: '#fff', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>{invoice.payToAddress}</div>
                  <button onClick={() => copyAddress(invoice.payToAddress!)}
                    style={{ flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, fontFamily: F }}>
                    <Copy size={13} /> Copy
                  </button>
                </div>

                {/* Network */}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
                  Network: <span style={{ color: BLUE, fontWeight: 600 }}>Arc (USDC)</span>
                </div>

                {/* Instructions */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  {['Open your wallet app (MetaMask, Trust, Phantom, etc.)',
                    `Send exactly ${fmtAmt(invoice.amountDue, invoice.currency)}`,
                    'Paste the address above as the recipient',
                    'Select Arc network and confirm',
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 3 ? 10 : 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{step}</div>
                    </div>
                  ))}
                </div>

                {/* QR toggle */}
                <button onClick={() => setShowQr(v => !v)}
                  style={{ width: '100%', height: 44, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: showQr ? 16 : 0 }}>
                  <QrCode size={15} /> {showQr ? 'Hide QR code' : 'Show QR code to scan'}
                </button>

                {/* QR code */}
                {showQr && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 4px' }}>
                    <div style={{ background: '#fff', padding: 16, borderRadius: 14, marginBottom: 10 }}>
                      <QRCodeSVG
                        value={invoice.payToAddress}
                        size={180}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.4 }}>
                      Scan with your wallet app<br />to auto-fill the address
                    </div>
                  </div>
                )}

                {/* Already paid button */}
                <button onClick={() => markPaid()}
                  style={{ width: '100%', marginTop: 16, height: 44, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, color: GREEN, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <CheckCircle2 size={15} /> I've sent the payment
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 0' }}>
                <AlertCircle size={15} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  The invoice issuer hasn't added a wallet address yet. Ask them to update the invoice.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: Pay with NAN name ── */}
        {tab === 'nan' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>

            {!nanPaid ? (
              <>
                {/* What is NAN? */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="14" height="21">
                      <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                      <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Pay with your NAN wallet</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Send directly from your NAN account</div>
                  </div>
                </div>

                {/* Payment summary */}
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>To</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{invoice.businessName}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Amount</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>{fmtAmt(invoice.amountDue, invoice.currency)}</div>
                  </div>
                </div>

                {/* How it works */}
                <div style={{ marginBottom: 20 }}>
                  {[
                    'Tap the button below to open NAN',
                    'Log in or create a free wallet (takes 30 seconds)',
                    'Send the payment — it arrives instantly',
                    'Come back and tap "I\'ve paid" below',
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i < 3 ? 10 : 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: BLUE, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{step}</div>
                    </div>
                  ))}
                </div>

                {/* Open NAN CTA */}
                {invoice.payToAddress ? (
                  <a
                    href={`https://nanarc.xyz/?send=1&to=${encodeURIComponent(invoice.payToAddress)}&amount=${invoice.amountDue}&note=${encodeURIComponent(`Invoice ${invoice.number ?? ''} — ${invoice.businessName ?? ''}`)}&currency=${invoice.currency ?? 'USDC'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 52, background: BLUE, color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, textDecoration: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                  >
                    Open NAN to pay <ChevronRight size={17} />
                  </a>
                ) : (
                  <div style={{ fontSize: 13, color: RED, textAlign: 'center', marginBottom: 12 }}>No wallet address on this invoice.</div>
                )}

                {/* Already paid */}
                <button onClick={() => setNanPaid(true)}
                  style={{ width: '100%', height: 44, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12, color: GREEN, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <CheckCircle2 size={15} /> I've paid
                </button>
              </>
            ) : (
              /* Thank-you mini state */
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <CheckCircle2 size={28} color={GREEN} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Thanks!</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                  Your payment to {invoice.businessName} is on its way.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3: Buy with card ── */}
        {tab === 'card' && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 20 }}>
              Don't have crypto? Buy USDC with your card or bank account — it will be sent directly to the merchant.
            </div>
            {invoice.payToAddress ? (
              <a
                href={`https://nanarc.xyz/?onramp=1&to=${encodeURIComponent(invoice.payToAddress)}&amount=${invoice.amountDue}&note=${encodeURIComponent(`Invoice ${invoice.number}`)}&currency=${invoice.currency}`}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        input::placeholder { color: rgba(255,255,255,0.25) }
      `}</style>
    </div>
  )
}
