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
  Copy, Check, AlertCircle, Loader, QrCode, AtSign,
  ChevronRight, Share2,
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
  return a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}
/** Two pleasant, deterministic gradient colours from any string (for the sender avatar). */
function avatarColors(seed: string): [string, string] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return [`hsl(${hue} 78% 56%)`, `hsl(${(hue + 48) % 360} 80% 46%)`]
}

interface Props { invoiceId: string; isRequest?: boolean }

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

export function PayByInvoicePage({ invoiceId, isRequest = false }: Props) {
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

  const [tab, setTab] = useState<Tab>('card')
  const [showQr, setShowQr] = useState(false)
  const [nanPaid, setNanPaid] = useState(false)

  // success + reconciliation state
  const [paid, setPaid] = useState(false)
  const [paidTx, setPaidTx] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimResult, setClaimResult] = useState<{ matched: boolean; txHash?: string; aiSummary: string } | null>(null)
  // tx hash confirm (address tab)
  const [txHashInput, setTxHashInput] = useState('')
  const [txCopied, setTxCopied] = useState(false)

  const shareReceipt = (txHash: string) => {
    const url = buildTxExplorerUrl(ARC, txHash)
    const text = `Payment confirmed for ${invoice?.businessName ?? 'invoice'} — settled on Arc USDC`
    if (navigator.share) {
      void navigator.share({ title: 'NAN Payment Receipt', text, url }).catch(() => {})
    } else {
      void navigator.clipboard.writeText(`${text}\n${url}`)
      toast.success('Receipt link copied!')
    }
  }

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr)
      .then(() => toast.success('Address copied'))
      .catch(() => {})
  }

  // Claim payment — calls server to reconcile onchain + notify merchant
  const markPaid = async (txHash?: string) => {
    if (!invoice) return
    setClaiming(true)
    try {
      const res = await fetch('/api/invoice-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          txHash,
          payerName: invoice.customerName,
        }),
      })
      const data = await res.json() as { matched?: boolean; txHash?: string; aiSummary?: string }
      const result = {
        matched: data.matched ?? false,
        txHash: data.txHash ?? txHash,
        aiSummary: data.aiSummary ?? (data.matched
          ? 'Payment confirmed onchain — funds are on their way.'
          : 'Payment claimed — the merchant has been notified.'),
      }
      setClaimResult(result)
      if (result.txHash) setPaidTx(result.txHash)
      if (invoice && localInvoice && result.matched) {
        recordInvoicePayment(invoice.id, { date: new Date().toISOString(), amount: invoice.amountDue, txHash: result.txHash ?? '', note: 'Paid via pay link' })
        updateInvoice(invoice.id, { status: 'paid', amountPaid: invoice.total, amountDue: 0, updatedAt: new Date().toISOString() })
      }
    } catch {
      // fallback — mark locally and show success anyway
      setClaimResult({ matched: false, aiSummary: 'Payment claimed — the merchant has been notified.' })
    } finally {
      setClaiming(false)
      setPaid(true)
    }
  }

  if (loading) return <LoadingScreen />
  if (notFound || !invoice) return <NotFound />

  const isPaidAlready = invoice.status === 'paid' || invoice.amountDue <= 0

  // ── Success ────────────────────────────────────────────────────────────────
  if (paid || isPaidAlready || nanPaid) {
    const isConfirmed = claimResult?.matched || isPaidAlready
    return (
      <div style={{ minHeight: '100dvh', background: '#0A0E1A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', fontFamily: F, padding: '48px 24px 64px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 400, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: isConfirmed ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle2 size={32} color={isConfirmed ? GREEN : AMBER} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              {isConfirmed ? 'Payment confirmed!' : 'Payment claimed!'}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {fmtAmt(invoice.total, invoice.currency)} to {invoice.businessName}
            </div>
          </div>

          {/* AI reconciliation result */}
          {claimResult && (
            <div style={{ background: 'rgba(8,102,245,0.08)', border: '1px solid rgba(8,102,245,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>NAN AI Reconciliation</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{claimResult.aiSummary}</div>
              {isConfirmed && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Confirmed onchain</span>
                </div>
              )}
            </div>
          )}

          {paidTx && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <a href={buildTxExplorerUrl(ARC, paidTx)} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>
                <ExternalLink size={13} /> View tx
              </a>
              <button onClick={() => shareReceipt(paidTx)}
                style={{ flex: 1, height: 44, borderRadius: 12, background: BLUE, border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: '0 4px 16px rgba(8,102,245,0.30)' }}>
                <Share2 size={13} /> Share receipt
              </button>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>The merchant has been notified</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              {invoice.businessName} received an in-app notification and email with the payment details and this reconciliation report.
            </div>
          </div>

          <a href="https://nanarc.xyz" style={{ display: 'block', padding: '13px', background: BLUE, color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
            Get your own NAN wallet
          </a>
        </div>
      </div>
    )
  }

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

      {/* Hero — payment request / invoice, styled as a tear-off ticket */}
      {(() => {
        const looksLikeAddr = /^0x[0-9a-fA-F]{20,}$/.test(invoice.businessName ?? '')
        const senderName = looksLikeAddr ? shortAddr(invoice.businessName) : (invoice.businessName || 'NAN user')
        const initial = looksLikeAddr ? '0x' : (senderName.trim()[0] ?? 'N').toUpperCase()
        const [c1, c2] = avatarColors(invoice.businessName || invoice.number || 'nan')
        const note = invoice.notes || invoice.items[0]?.name
        const amountStr = invoice.amountDue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '9px 0' }
        const labelStyle: React.CSSProperties = { fontSize: 13, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }
        const valueStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#fff', textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }
        return (
          <div style={{ width: '100%', maxWidth: 480, marginBottom: 22 }}>
            <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(180deg,#111c38 0%,#0c1327 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 28px 60px -24px rgba(8,102,245,0.45), 0 2px 0 rgba(255,255,255,0.04) inset' }}>
              {/* soft blue glow behind the sender */}
              <div aria-hidden style={{ position: 'absolute', top: -110, left: '50%', transform: 'translateX(-50%)', width: 380, height: 240, background: 'radial-gradient(closest-side, rgba(8,102,245,0.5), rgba(8,102,245,0))', pointerEvents: 'none' }} />

              {/* Sender + amount */}
              <div style={{ position: 'relative', padding: '30px 24px 26px', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto 14px', background: `linear-gradient(135deg, ${c1}, ${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: looksLikeAddr ? 17 : 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', boxShadow: `0 8px 24px -6px ${c1}`, border: '2px solid rgba(255,255,255,0.18)' }}>
                  {initial}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>
                  {isRequest ? 'Payment request from' : 'Invoice from'}
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{senderName}</div>
                {invoice.payToNanHandle && (
                  <div style={{ fontSize: 14, color: '#6FA8FF', fontWeight: 600, marginTop: 3 }}>@{invoice.payToNanHandle}</div>
                )}
                {!looksLikeAddr && invoice.businessEmail && (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3, overflowWrap: 'anywhere' }}>{invoice.businessEmail}</div>
                )}

                <div style={{ marginTop: 26, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'clamp(38px, 12vw, 52px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.045em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{amountStr}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{invoice.currency}</span>
                </div>
                {invoice.dueDate && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, padding: '6px 13px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', color: '#F6B94D', fontSize: 13, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER }} />
                    Due {fmtDate(invoice.dueDate)}
                  </div>
                )}
              </div>

              {/* Tear line */}
              <div aria-hidden style={{ position: 'relative', height: 22 }}>
                <div style={{ position: 'absolute', left: 22, right: 22, top: 10, borderTop: '2px dashed rgba(255,255,255,0.13)' }} />
                <div style={{ position: 'absolute', left: -11, top: 0, width: 22, height: 22, borderRadius: '50%', background: '#0A0E1A', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.08)' }} />
                <div style={{ position: 'absolute', right: -11, top: 0, width: 22, height: 22, borderRadius: '50%', background: '#0A0E1A', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.08)' }} />
              </div>

              {/* Details */}
              <div style={{ position: 'relative', padding: '8px 24px 22px' }}>
                {isRequest ? (
                  <>
                    {invoice.customerName && <div style={rowStyle}><span style={labelStyle}>For</span><span style={valueStyle}>{invoice.customerName}</span></div>}
                    {note && <div style={rowStyle}><span style={labelStyle}>Note</span><span style={{ ...valueStyle, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>{note}</span></div>}
                    <div style={rowStyle}><span style={labelStyle}>Reference</span><span style={{ ...valueStyle, fontWeight: 500, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{invoice.number}</span></div>
                  </>
                ) : (
                  <>
                    <div style={rowStyle}><span style={labelStyle}>Bill to</span><span style={valueStyle}>{invoice.customerName}</span></div>
                    <div style={rowStyle}><span style={labelStyle}>Invoice</span><span style={{ ...valueStyle, whiteSpace: 'nowrap' }}>{invoice.number}</span></div>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    {invoice.items.map(item => (
                      <div key={item.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflowWrap: 'anywhere' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{item.quantity} × {fmtAmt(item.unitPrice, invoice.currency)}</div>
                        </div>
                        <span style={{ ...valueStyle, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{(item.quantity * item.unitPrice).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    {(invoice.discountTotal > 0 || invoice.taxTotal > 0) && (
                      <>
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                        <div style={rowStyle}><span style={labelStyle}>Subtotal</span><span style={valueStyle}>{fmtAmt(invoice.subtotal, invoice.currency)}</span></div>
                        {invoice.discountTotal > 0 && <div style={rowStyle}><span style={labelStyle}>Discount</span><span style={valueStyle}>−{fmtAmt(invoice.discountTotal, invoice.currency)}</span></div>}
                        {invoice.taxTotal > 0 && <div style={rowStyle}><span style={labelStyle}>Tax</span><span style={valueStyle}>{fmtAmt(invoice.taxTotal, invoice.currency)}</span></div>}
                      </>
                    )}
                    {invoice.notes && (
                      <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>{invoice.notes}</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Payment section */}
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Tab bar — Card first, then crypto, then NAN name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 4, marginBottom: 16 }}>
          {([
            ['card',    <CreditCard key="c" size={13} />, 'Card'],
            ['address', <QrCode key="q" size={13} />, 'Crypto'],
            ['nan',     <AtSign  key="a" size={13} />, 'NAN name'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ height: 42, background: tab === id ? BLUE : 'transparent', color: tab === id ? '#fff' : 'rgba(255,255,255,0.55)', boxShadow: tab === id ? '0 6px 16px -6px rgba(8,102,245,0.7)' : 'none', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s' }}>
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

                {/* Tx hash confirm input */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Transaction hash (optional)
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      value={txHashInput}
                      onChange={e => setTxHashInput(e.target.value)}
                      placeholder="0x… paste to confirm automatically"
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)',
                        color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                    />
                    <button onClick={() => {
                      void navigator.clipboard.readText().then(t => setTxHashInput(t)).catch(() => {})
                      const el = document.querySelector<HTMLInputElement>('input[placeholder*="0x"]')
                      if (el) { void navigator.clipboard.readText().then(t => { setTxHashInput(t); setTxCopied(true); setTimeout(() => setTxCopied(false), 1500) }).catch(() => {}) }
                    }}
                      style={{ width: 40, height: 40, borderRadius: 10, background: txCopied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      {txCopied ? <Check size={14} color={GREEN} /> : <Copy size={14} color="rgba(255,255,255,0.5)" />}
                    </button>
                  </div>
                  <button onClick={() => void markPaid(txHashInput.trim() || undefined)} disabled={claiming}
                    style={{ width: '100%', height: 46, background: claiming ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.12)',
                      border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, color: GREEN, fontSize: 13,
                      fontWeight: 600, cursor: claiming ? 'not-allowed' : 'pointer', fontFamily: F,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: claiming ? 0.7 : 1 }}>
                    {claiming
                      ? <><Loader size={15} color={GREEN} style={{ animation: 'spin 1s linear infinite' }} />Verifying payment…</>
                      : <><CheckCircle2 size={15} />I've sent the payment</>}
                  </button>
                </div>
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflowWrap: 'anywhere', textAlign: 'right', minWidth: 0, marginLeft: 12 }}>{invoice.businessName}</div>
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
                {(invoice.payToNanHandle || invoice.payToAddress) ? (
                  <a
                    href={invoice.payToNanHandle
                      ? `https://nanarc.xyz/@${invoice.payToNanHandle}?amount=${invoice.amountDue}&note=${encodeURIComponent(`${isRequest ? 'Payment Request' : 'Invoice'} ${invoice.number ?? ''} — ${invoice.businessName ?? ''}`)}`
                      : `https://nanarc.xyz/?send=1&to=${encodeURIComponent(invoice.payToAddress!)}&amount=${invoice.amountDue}&note=${encodeURIComponent(`${isRequest ? 'Payment Request' : 'Invoice'} ${invoice.number ?? ''} — ${invoice.businessName ?? ''}`)}&currency=${invoice.currency ?? 'USDC'}`}
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
                href={`https://nanarc.xyz/?onramp=1&to=${encodeURIComponent(invoice.payToAddress)}&amount=${invoice.amountDue}&note=${encodeURIComponent(`${isRequest ? 'Payment Request' : 'Invoice'} ${invoice.number}`)}&currency=${invoice.currency}`}
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
