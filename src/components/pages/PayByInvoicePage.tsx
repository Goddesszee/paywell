/**
 * PayByInvoicePage — public invoice payment page.
 * Accessed via ?invoice=<id> — no NAN account needed.
 *
 * Three payment methods:
 *  1. Crypto address — copy address, scan QR, or use WalletConnect deep-link
 *  2. NAN name — type a .nan name, resolve onchain, confirm
 *  3. Buy with card — Circle onramp deep-link
 */
import React, { useState, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  FileText, CreditCard, CheckCircle2, ExternalLink,
  Copy, AlertCircle, Loader, QrCode, AtSign, Search,
  ChevronRight, ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type Invoice } from '../../store/appStore'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useNanName } from '../../hooks/useNanName'
import { usePublicPage } from '../../hooks/usePublicPage'
import { CircleEmailLogin } from '../CircleEmailLogin'

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

  // ── NAN name resolution ──────────────────────────────────────────────────
  const { resolveHandle } = useNanName()
  const { auth, setAuth } = useAppStore()
  const [tab, setTab] = useState<Tab>('address')
  const [showQr, setShowQr] = useState(false)

  // NAN name tab state
  const [nanInput, setNanInput] = useState('')
  const [nanResolving, setNanResolving] = useState(false)
  const [nanResolved, setNanResolved] = useState<{ name: string; address: string } | null>(null)
  const [nanError, setNanError] = useState('')
  const [nanPaid, setNanPaid] = useState(false)
  const [nanShowLogin, setNanShowLogin] = useState(false)
  const [nanSending, setNanSending] = useState(false)
  const nanRef = useRef<HTMLInputElement>(null)

  // success state
  const [paid, setPaid] = useState(false)
  const [paidTx, setPaidTx] = useState('')

  const isNanLoggedIn = !!(auth?.userToken && (auth?.circleWalletAddress || auth?.walletAddress))

  const resolveNan = async () => {
    const raw = nanInput.trim().replace(/\.nan$/i, '').toLowerCase()
    if (!raw) { setNanError('Enter a NAN name'); return }
    setNanResolving(true)
    setNanError('')
    setNanResolved(null)
    try {
      const addr = await resolveHandle(raw)
      if (!addr || addr === '0x0000000000000000000000000000000000000000') {
        setNanError(`"${raw}.nan" is not registered`)
      } else {
        setNanResolved({ name: raw, address: addr })
      }
    } catch {
      setNanError('Could not resolve name — check spelling')
    } finally {
      setNanResolving(false)
    }
  }

  // Send USDC from the logged-in Circle wallet to the merchant
  const sendFromNanWallet = async () => {
    if (!invoice || !invoice.payToAddress || !auth?.userToken) return
    setNanSending(true)
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          userToken: auth.userToken,
          to: invoice.payToAddress,
          amount: String(invoice.amountDue),
          tokenSymbol: invoice.currency ?? 'USDC',
        }),
      })
      const data = await res.json() as { txHash?: string; txId?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? `Transfer failed (${res.status})`)
      markPaid(data.txHash ?? data.txId ?? '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed — please try again')
    } finally {
      setNanSending(false)
    }
  }

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

            {/* Step 1: not logged in — prompt to create / login */}
            {!isNanLoggedIn && !nanShowLogin && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Pay with your NAN wallet</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, marginBottom: 20 }}>
                  New to NAN? Create a free wallet in 30 seconds with just your email. Already have one? Sign in and pay instantly.
                </div>
                <button onClick={() => setNanShowLogin(true)}
                  style={{ width: '100%', height: 50, background: BLUE, border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Create wallet / Sign in to pay
                </button>
              </>
            )}

            {/* Inline email login */}
            {!isNanLoggedIn && nanShowLogin && (
              <>
                <button onClick={() => setNanShowLogin(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: F, marginBottom: 16, padding: 0 }}>
                  <ArrowLeft size={13} /> Back
                </button>
                <CircleEmailLogin onSuccess={(walletAddress, userToken, email, encryptionKey) => {
                  const existing = useAppStore.getState().auth
                  setAuth({ ...existing, email, sessionToken: userToken, userToken, encryptionKey: encryptionKey ?? existing?.encryptionKey, walletAddress, walletId: existing?.walletId ?? walletAddress, circleWalletAddress: walletAddress, circleWalletId: existing?.circleWalletId ?? walletAddress })
                  setNanShowLogin(false)
                }} />
              </>
            )}

            {/* Step 2: logged in — show name input */}
            {isNanLoggedIn && !nanResolved && (
              <>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 14 }}>
                  Enter your <strong style={{ color: '#fff' }}>.nan</strong> name to confirm your identity and pay instantly.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      ref={nanRef}
                      value={nanInput}
                      onChange={e => { setNanInput(e.target.value); setNanError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') void resolveNan() }}
                      placeholder="yourname"
                      style={{ width: '100%', height: 48, background: 'rgba(255,255,255,0.07)', border: `1px solid ${nanError ? RED : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, color: '#fff', fontSize: 15, fontFamily: F, padding: '0 80px 0 14px', boxSizing: 'border-box', outline: 'none' }}
                    />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: 600, pointerEvents: 'none' }}>.nan</span>
                  </div>
                  <button onClick={() => void resolveNan()} disabled={nanResolving}
                    style={{ width: 48, height: 48, background: BLUE, border: 'none', borderRadius: 10, cursor: nanResolving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: nanResolving ? 0.6 : 1 }}>
                    {nanResolving ? <Loader size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={18} color="#fff" />}
                  </button>
                </div>
                {nanError && <div style={{ fontSize: 12, color: RED, marginBottom: 8 }}>{nanError}</div>}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                  Your .nan name confirms your identity. Payment will be sent from your NAN wallet.
                </div>
              </>
            )}

            {/* Step 3: name resolved — one-tap pay */}
            {isNanLoggedIn && nanResolved && (
              <>
                <button onClick={() => { setNanResolved(null); setNanInput('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: F, marginBottom: 16, padding: 0 }}>
                  <ArrowLeft size={13} /> Back
                </button>

                {/* Confirm card */}
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Paying as</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{nanResolved.name}.nan</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>To</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{invoice.businessName}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Amount</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>{fmtAmt(invoice.amountDue, invoice.currency)}</div>
                  </div>
                </div>

                <button onClick={() => void sendFromNanWallet()} disabled={nanSending}
                  style={{ width: '100%', height: 52, background: nanSending ? 'rgba(8,102,245,0.5)' : BLUE, border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 700, cursor: nanSending ? 'not-allowed' : 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {nanSending
                    ? <><Loader size={17} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
                    : <>Pay {fmtAmt(invoice.amountDue, invoice.currency)} <ChevronRight size={17} /></>}
                </button>
              </>
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
