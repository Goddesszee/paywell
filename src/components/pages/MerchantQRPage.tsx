/**
 * MerchantQRPage — generate a printable QR payment page.
 * No account needed on the payer side; links to ?pay=<address>
 * which resolves to the PaymentRequestPayPage flow.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Printer, Copy, Check, QrCode, Share2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { formatAddress } from '../../utils/format'
import { toast } from 'sonner'
import QRCode from 'qrcode'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

/** Canvas-based QR — no external API, works fully offline */
function QRCanvas({ value, size = 200, dark = '#000000', light = '#FFFFFF' }: { value: string; size?: number; dark?: string; light?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const render = useCallback(() => {
    if (!canvasRef.current || !value) return
    void QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark, light },
      errorCorrectionLevel: 'M',
    })
  }, [value, size, dark, light])
  useEffect(() => { render() }, [render])
  if (!value) return <div style={{ width: size, height: size, background: '#f5f5f5', borderRadius: 12 }} />
  return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 12, display: 'block' }} />
}

export function MerchantQRPage() {
  const C = useNanTheme()
  const { setActiveView } = useAppStore()
  const { address } = useAccount()
  const [businessName, setBusinessName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const appBase = window.location.origin
  const payUrl = `${appBase}?pay=${address ?? ''}${amount ? `&amount=${amount}` : ''}${note ? `&note=${encodeURIComponent(note)}` : ''}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(payUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast.success('Payment link copied')
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: businessName || 'Pay me with NAN', url: payUrl })
        return
      } catch { /* user dismissed */ }
    }
    handleCopy()
  }

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML ?? ''
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>${businessName || 'NAN Payment'} — Pay</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; font-family: -apple-system, sans-serif; }
          .card { border: 2px solid #e5e7eb; border-radius: 20px; padding: 40px; max-width: 340px; text-align: center; }
          .logo { font-size: 28px; font-weight: 900; letter-spacing: -0.04em; color: #0066FF; margin-bottom: 6px; }
          .biz { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
          .addr { font-size: 11px; color: #888; font-family: monospace; margin-bottom: 20px; }
          .qr img { border-radius: 12px; }
          .amt { font-size: 22px; font-weight: 800; color: #0066FF; margin: 16px 0 4px; }
          .note { font-size: 13px; color: #666; margin-bottom: 16px; }
          .url { font-size: 10px; color: #999; word-break: break-all; }
          @media print { body { -webkit-print-color-adjust: exact; } }
        </style>
      </head><body><div class="card">${printContent}</div></body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  if (!address) {
    return (
      <div style={{ fontFamily: F, paddingBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setActiveView('home')} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={15} color={C.t2} />
          </button>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Merchant QR</div>
        </div>
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
          <QrCode size={40} color={C.t3} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Connect wallet first</div>
          <div style={{ fontSize: 13, color: C.t3 }}>Connect your wallet to generate a payment QR code.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setActiveView('home')} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={15} color={C.t2} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Merchant QR</div>
          <div style={{ fontSize: 12, color: C.t3 }}>Customers pay without an account</div>
        </div>
      </div>

      {/* Config */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Customise</div>
        {[
          { label: 'Business / display name', value: businessName, onChange: setBusinessName, placeholder: 'e.g. Zarafatolu Hair Studio' },
          { label: 'Fixed amount (USDC, optional)', value: amount, onChange: setAmount, placeholder: '0.00' },
          { label: 'Payment note (optional)', value: note, onChange: setNote, placeholder: 'e.g. Hair appointment' },
        ].map(({ label, value, onChange, placeholder }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 5 }}>{label}</label>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
              style={{ width: '100%', padding: '9px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 9, color: C.text, fontSize: 14, fontFamily: F, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>

      {/* QR Preview + print content */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '24px', textAlign: 'center', marginBottom: 16 }}>
        {/* Hidden printable block */}
        <div ref={printRef} style={{ display: 'none' }}>
          <div className="logo">NAN</div>
          {businessName && <div className="biz">{businessName}</div>}
          <div className="addr">{formatAddress(address)}</div>
          <div className="qr"><QRCanvas value={payUrl} size={220} /></div>
          {amount && <div className="amt">{amount} USDC</div>}
          {note && <div className="note">{note}</div>}
          <div className="url">{payUrl}</div>
        </div>

        {/* Visible preview */}
        <div style={{ fontSize: 22, fontWeight: 900, color: BLUE, letterSpacing: '-0.04em', marginBottom: businessName ? 4 : 12 }}>NAN</div>
        {businessName && <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{businessName}</div>}
        <div style={{ fontSize: 11, color: C.t3, fontFamily: "'JetBrains Mono',monospace", marginBottom: 16 }}>{formatAddress(address)}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <QRCanvas value={payUrl} size={200} dark={C.isDark ? '#FFFFFF' : '#000000'} light={C.isDark ? '#1A1D24' : '#FFFFFF'} />
        </div>
        {amount && <div style={{ fontSize: 20, fontWeight: 800, color: BLUE, marginBottom: 4 }}>{amount} USDC</div>}
        {note && <div style={{ fontSize: 12, color: C.t3, marginBottom: 8 }}>{note}</div>}
        <div style={{ fontSize: 10, color: C.t3, wordBreak: 'break-all' }}>{payUrl}</div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handlePrint} style={{ flex: 1, padding: '13px', borderRadius: 12, background: C.surf, border: `1px solid ${C.bdr}`, color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Printer size={15} /> Print
        </button>
        <button onClick={() => { void handleShare() }} style={{ flex: 1, padding: '13px', borderRadius: 12, background: C.surf, border: `1px solid ${C.bdr}`, color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Share2 size={15} /> Share
        </button>
        <button onClick={handleCopy} style={{ flex: 1, padding: '13px', borderRadius: 12, background: BLUE, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
