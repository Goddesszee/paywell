/**
 * NAN Invoice HTML/PDF builder.
 * Generates a presentation-ready HTML document that the browser can print as PDF.
 * Used by InvoicePage (download, print, share) and InvoicePayPage (preview).
 */
import type { Invoice } from '../store/appStore'

function fmt(n: number, currency = 'USDC') {
  return `${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return iso }
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:          { bg: '#F3F4F6', color: '#374151' },
  sent:           { bg: '#EFF6FF', color: '#1D4ED8' },
  viewed:         { bg: '#F0FDF4', color: '#15803D' },
  partially_paid: { bg: '#FFFBEB', color: '#B45309' },
  paid:           { bg: '#DCFCE7', color: '#15803D' },
  overdue:        { bg: '#FEF2F2', color: '#DC2626' },
  cancelled:      { bg: '#F3F4F6', color: '#9CA3AF' },
}

export function buildInvoiceHtml(inv: Invoice): string {
  const ss = STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft
  const statusLabel = inv.status.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  const payLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://nanarc.xyz'}?invoice=${inv.id}`

  const itemRows = inv.items.map((item, i) => {
    const gross   = item.quantity * item.unitPrice
    const disc    = gross * ((item.discount ?? 0) / 100)
    const after   = gross - disc
    const tax     = after * ((item.tax ?? 0) / 100)
    const lineTotal = after + tax
    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#F9FAFB'};">
        <td style="padding:10px 16px;font-size:13px;color:#111827;vertical-align:top;">
          <div style="font-weight:600;">${item.name}</div>
          ${item.description ? `<div style="font-size:11px;color:#6B7280;margin-top:2px;">${item.description}</div>` : ''}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${item.quantity}</td>
        <td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${fmt(item.unitPrice, inv.currency)}</td>
        ${item.discount ? `<td style="padding:10px 16px;font-size:13px;color:#B45309;text-align:right;white-space:nowrap;">−${item.discount}%</td>` : `<td style="padding:10px 16px;font-size:13px;color:#9CA3AF;text-align:right;">—</td>`}
        ${item.tax ? `<td style="padding:10px 16px;font-size:13px;color:#374151;text-align:right;white-space:nowrap;">${item.tax}%</td>` : `<td style="padding:10px 16px;font-size:13px;color:#9CA3AF;text-align:right;">—</td>`}
        <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#111827;text-align:right;white-space:nowrap;">${fmt(lineTotal, inv.currency)}</td>
      </tr>`
  }).join('')

  const paymentRows = inv.payments.length > 0 ? inv.payments.map(p => `
    <tr>
      <td style="padding:8px 16px;font-size:12px;color:#374151;">${fmtDate(p.date)}</td>
      <td style="padding:8px 16px;font-size:12px;color:#374151;">${p.note ?? 'Payment received'}</td>
      <td style="padding:8px 16px;font-size:12px;font-weight:700;color:#15803D;text-align:right;">${fmt(p.amount, inv.currency)}</td>
      <td style="padding:8px 16px;font-size:11px;color:#9CA3AF;font-family:monospace;">${p.txHash ? `${p.txHash.slice(0,10)}…${p.txHash.slice(-4)}` : '—'}</td>
    </tr>`).join('') : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>NAN Invoice ${inv.number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-text-size-adjust:100%}
    body{background:#F3F4F6;font-family:'Inter',-apple-system,sans-serif;padding:32px 16px;color:#111827;}
    .page{background:#fff;border-radius:12px;box-shadow:0 1px 12px rgba(0,0,0,0.08);max-width:860px;margin:0 auto;overflow:hidden;}
    table{border-collapse:collapse;width:100%;}
    th{background:#F9FAFB;padding:10px 16px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;text-align:left;border-bottom:1px solid #E5E7EB;}
    th.right{text-align:right;}
    td{border-bottom:1px solid #F3F4F6;}
    @media(max-width:600px){
      body{padding:12px 4px;}
      .hide-mobile{display:none!important;}
      .page{border-radius:8px;}
    }
    @media print{
      body{background:#fff;padding:0;}
      .page{box-shadow:none;border-radius:0;}
      .no-print{display:none!important;}
      @page{margin:15mm 12mm;}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ① Header -->
  <div style="background:#0066FF;padding:28px 32px 24px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
      <!-- Logo + business -->
      <div>
        <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="16" height="24">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.01em;">NAN</span>
        </div>
        <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${inv.businessName}</div>
        ${inv.businessAddress ? `<div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5;">${inv.businessAddress.replace(/\n/g,'<br>')}</div>` : ''}
        ${inv.businessEmail ? `<div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:2px;">${inv.businessEmail}</div>` : ''}
        ${inv.businessPhone ? `<div style="font-size:12px;color:rgba(255,255,255,0.65);">${inv.businessPhone}</div>` : ''}
      </div>
      <!-- Invoice title + status -->
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.03em;margin-bottom:6px;">INVOICE</div>
        <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:10px;">${inv.number}</div>
        <span style="display:inline-block;background:${ss.bg};color:${ss.color};border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;">${statusLabel}</span>
      </div>
    </div>
  </div>

  <!-- ② Bill-to + dates -->
  <div style="display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid #E5E7EB;">
    <div style="flex:1;min-width:180px;padding:20px 32px;border-right:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Bill To</div>
      <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:3px;">${inv.customerName}</div>
      ${inv.customerEmail ? `<div style="font-size:12px;color:#6B7280;">${inv.customerEmail}</div>` : ''}
      ${inv.customerPhone ? `<div style="font-size:12px;color:#6B7280;">${inv.customerPhone}</div>` : ''}
      ${inv.customerAddress ? `<div style="font-size:12px;color:#6B7280;margin-top:2px;line-height:1.5;">${inv.customerAddress.replace(/\n/g,'<br>')}</div>` : ''}
    </div>
    <div style="flex:1;min-width:140px;padding:20px 24px;border-right:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Issue Date</div>
      <div style="font-size:14px;font-weight:600;color:#111827;">${fmtDate(inv.issueDate)}</div>
    </div>
    <div style="flex:1;min-width:140px;padding:20px 24px;border-right:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Due Date</div>
      <div style="font-size:14px;font-weight:600;color:${inv.status === 'overdue' ? '#DC2626' : '#111827'};">${fmtDate(inv.dueDate)}</div>
    </div>
    <div style="flex:1;min-width:140px;padding:20px 24px;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Amount Due</div>
      <div style="font-size:20px;font-weight:800;color:${inv.amountDue > 0 ? '#0066FF' : '#15803D'};letter-spacing:-0.03em;">${fmt(inv.amountDue, inv.currency)}</div>
    </div>
  </div>

  <!-- ③ Line items -->
  <div style="padding:0;">
    <table>
      <thead>
        <tr>
          <th>Item / Service</th>
          <th class="right">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Discount</th>
          <th class="right">Tax</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#9CA3AF;font-size:13px;">No items</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- ④ Totals -->
  <div style="display:flex;justify-content:flex-end;padding:0 32px 24px;border-bottom:1px solid #E5E7EB;">
    <div style="width:280px;">
      ${inv.subtotal !== inv.total || inv.discountTotal > 0 || inv.taxTotal > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="font-size:13px;color:#6B7280;">Subtotal</span>
        <span style="font-size:13px;font-weight:600;color:#374151;">${fmt(inv.subtotal, inv.currency)}</span>
      </div>` : ''}
      ${inv.discountTotal > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="font-size:13px;color:#B45309;">Discount</span>
        <span style="font-size:13px;font-weight:600;color:#B45309;">−${fmt(inv.discountTotal, inv.currency)}</span>
      </div>` : ''}
      ${inv.taxTotal > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="font-size:13px;color:#6B7280;">Tax</span>
        <span style="font-size:13px;font-weight:600;color:#374151;">${fmt(inv.taxTotal, inv.currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:2px solid #111827;">
        <span style="font-size:15px;font-weight:700;color:#111827;">Total</span>
        <span style="font-size:15px;font-weight:800;color:#111827;">${fmt(inv.total, inv.currency)}</span>
      </div>
      ${inv.amountPaid > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;">
        <span style="font-size:13px;color:#15803D;">Amount Paid</span>
        <span style="font-size:13px;font-weight:600;color:#15803D;">−${fmt(inv.amountPaid, inv.currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;background:#EFF6FF;margin-top:2px;border-radius:6px;padding:10px 12px;">
        <span style="font-size:14px;font-weight:700;color:#1D4ED8;">Balance Due</span>
        <span style="font-size:14px;font-weight:800;color:#1D4ED8;">${fmt(inv.amountDue, inv.currency)}</span>
      </div>` : ''}
    </div>
  </div>

  <!-- ⑤ Payment history -->
  ${inv.payments.length > 0 ? `
  <div style="padding:20px 32px;border-bottom:1px solid #E5E7EB;">
    <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Payment History</div>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Description</th><th class="right">Amount</th><th>Tx Reference</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ⑥ Notes + payment instructions -->
  ${(inv.notes || inv.paymentInstructions || inv.payToAddress) ? `
  <div style="display:flex;flex-wrap:wrap;gap:0;border-bottom:1px solid #E5E7EB;">
    ${inv.notes ? `
    <div style="flex:1;min-width:200px;padding:20px 32px;border-right:1px solid #E5E7EB;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Notes</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;">${inv.notes}</div>
    </div>` : ''}
    ${(inv.paymentInstructions || inv.payToAddress) ? `
    <div style="flex:1;min-width:200px;padding:20px 32px;">
      <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Payment Instructions</div>
      ${inv.paymentInstructions ? `<div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;margin-bottom:8px;">${inv.paymentInstructions}</div>` : ''}
      ${inv.payToAddress ? `
      <div style="font-size:11px;color:#6B7280;margin-bottom:4px;">Pay to (USDC · Arc Testnet):</div>
      <div style="font-size:11px;font-family:monospace;color:#1D4ED8;word-break:break-all;">${inv.payToAddress}</div>` : ''}
      ${inv.amountDue > 0 ? `
      <div class="no-print" style="margin-top:12px;">
        <a href="${payLink}" style="display:inline-block;background:#0066FF;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Pay ${fmt(inv.amountDue, inv.currency)} →</a>
      </div>` : ''}
    </div>` : ''}
  </div>` : ''}

  <!-- ⑦ Footer -->
  <div style="padding:16px 32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#F9FAFB;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:22px;height:22px;border-radius:6px;background:#0066FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="9" height="13">
          <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
          <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
        </svg>
      </div>
      <span style="font-size:12px;font-weight:600;color:#374151;">NAN · Powered by Circle &amp; Arc</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#9CA3AF;">Invoice ${inv.number} · Generated ${new Date().toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'})}</div>
      <div style="font-size:11px;color:#9CA3AF;">nanarc.xyz</div>
    </div>
  </div>

</div>
</body>
</html>`
}

export function downloadInvoicePdf(inv: Invoice) {
  const html = buildInvoiceHtml(inv)
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `NAN_Invoice_${inv.number}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 15000)
}

export async function shareInvoice(inv: Invoice) {
  const html  = buildInvoiceHtml(inv)
  const blob  = new Blob([html], { type: 'text/html' })
  const file  = new File([blob], `NAN_Invoice_${inv.number}.html`, { type: 'text/html' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title: `Invoice ${inv.number}`, files: [file] }); return } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export function printInvoice(inv: Invoice) {
  const html = buildInvoiceHtml(inv)
  const win  = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

export function invoicePaymentLink(inv: Invoice): string {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://nanarc.xyz'
  return `${base}?invoice=${inv.id}`
}
