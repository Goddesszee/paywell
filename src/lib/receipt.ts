/**
 * Shared NAN receipt HTML builder.
 * Used by ActivityPage (existing transactions) and WalletPage (send success).
 */

const EXPLORER: Record<string, string> = {
  'arc':          'https://explorer.testnet.arc.io',
  'arc testnet':  'https://explorer.testnet.arc.io',
  'arc mainnet':  'https://explorer.arc.io',
  'eth':          'https://sepolia.etherscan.io',
  'base':         'https://sepolia.basescan.org',
  'base sepolia': 'https://sepolia.basescan.org',
  'arbitrum':     'https://sepolia.arbiscan.io',
  'polygon':      'https://amoy.polygonscan.com',
  'avalanche':    'https://testnet.snowtrace.io',
  'op':           'https://sepolia-optimistic.etherscan.io',
  'unichain':     'https://sepolia.uniscan.xyz',
}

export interface ReceiptData {
  amount: string | number
  sign: '+' | '-' | ''
  token?: string          // e.g. 'USDC', 'EURC'
  description?: string
  status: string
  timestamp: string | number | Date
  chain?: string
  counterparty?: string   // the other party's address
  sender?: string         // explicit sender address (own wallet on send)
  txHash?: string
  id?: string
}

export function buildReceiptHtml(r: ReceiptData): string {
  const isIn      = r.sign === '+'
  const statusOk  = ['confirmed', 'completed'].includes(r.status)
  const statusPnd = ['pending', 'payment_protected'].includes(r.status)
  const statusLabel = statusOk ? 'Completed' : statusPnd ? 'Pending' : r.status.charAt(0).toUpperCase() + r.status.slice(1)
  const statusBg    = statusOk ? '#e8f8ef' : statusPnd ? '#fff8e1' : '#fee8e8'
  const statusClr   = statusOk ? '#1a7a42' : statusPnd ? '#b45309' : '#c0392b'

  const ts      = new Date(r.timestamp)
  const dateStr = ts.toLocaleString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const network = r.chain ?? 'Arc Testnet'
  const token   = r.token ?? 'USDC'
  const shortTx = r.txHash ? `${r.txHash.slice(0, 8)}…${r.txHash.slice(-4)}` : null
  const idSuffix = r.id ? r.id.slice(-4).toUpperCase() : ts.getTime().toString(36).slice(-4).toUpperCase()
  const refCode = `NAN-${idSuffix}-${ts.getTime().toString(36).toUpperCase().slice(-4)}`
  const narrative = r.description || (isIn ? `Received ${r.amount} ${token}` : `Sent ${r.amount} ${token}`)

  const txUrl = r.txHash
    ? `${EXPLORER[(network).toLowerCase()] ?? EXPLORER['arc testnet']}/tx/${r.txHash}`
    : null

  // Determine sender / receiver based on direction
  const senderAddr   = isIn  ? (r.counterparty ?? null) : (r.sender ?? null)
  const receiverAddr = !isIn ? (r.counterparty ?? null) : (r.sender ?? null)

  const detailRows: [string, string, boolean?][] = [
    ['Date', dateStr],
    ['Network', network],
    ['NAN reference', refCode],
    ...(senderAddr   ? [['Sender',   senderAddr,   true] as [string, string, boolean]] : []),
    ...(receiverAddr ? [['Receiver', receiverAddr, true] as [string, string, boolean]] : []),
    ...(shortTx ? [['Transaction', shortTx, true] as [string, string, boolean]] : []),
    ...(txUrl ? [['Explorer', txUrl, false] as [string, string, boolean]] : []),
  ]

  const rowsHtml = detailRows.map(([label, value, mono], i, arr) => {
    const isLink = label === 'Explorer'
    const cellContent = isLink
      ? `<a href="${value}" style="font-size:12px;font-weight:600;color:#0066FF;text-decoration:none;word-break:break-all;">View transaction ↗</a>`
      : `<span style="font-size:13px;font-weight:600;color:#111;text-align:right;word-break:break-all;${mono ? 'font-family:Menlo,Courier New,monospace;font-size:12px;' : ''}">${value}</span>`
    return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:13px 0;border-bottom:${i < arr.length - 1 ? '1px solid #ebebeb' : 'none'};gap:16px;">
      <span style="font-size:13px;color:#888;white-space:nowrap;">${label}</span>
      ${cellContent}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <title>NAN Receipt · ${dateStr}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-text-size-adjust:100%}
    body{background:#eef0f3;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;}
    @media print{body{background:#fff;padding:0}@page{margin:15mm}}
  </style>
</head>
<body>
  <div style="background:#fff;border-radius:20px;box-shadow:0 2px 24px rgba(0,0,0,0.09);width:100%;max-width:460px;padding:28px 28px 20px;border:1px solid #e4e4e4;">

    <!-- ① Top bar: logo + name left, status badge right -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:9px;background:#0066FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width="15" height="21">
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>
        <span style="font-size:17px;font-weight:700;color:#111;letter-spacing:-0.01em;">NAN</span>
      </div>
      <span style="font-size:12px;font-weight:600;color:${statusClr};background:${statusBg};border-radius:20px;padding:5px 13px;">${statusLabel}</span>
    </div>

    <!-- ② Receipt label + amount -->
    <div style="margin-bottom:6px;">
      <div style="font-size:13px;color:#888;margin-bottom:8px;">NAN receipt</div>
      <div style="font-size:52px;font-weight:800;color:#111;letter-spacing:-0.04em;line-height:1;display:flex;align-items:baseline;gap:10px;">
        <span>${r.amount}</span>
        <span style="font-size:22px;font-weight:600;color:#888;">${token}</span>
      </div>
    </div>

    <!-- ③ Narrative sentence -->
    <div style="font-size:14px;color:#333;font-weight:500;margin-bottom:22px;line-height:1.4;">${narrative}</div>

    <!-- ④ Divider -->
    <div style="height:1px;background:#ebebeb;margin-bottom:4px;"></div>

    <!-- ⑤ Detail rows -->
    <div>${rowsHtml}</div>

    <!-- ⑥ Footer -->
    <div style="text-align:center;font-size:11px;color:#ccc;margin-top:20px;padding-top:14px;border-top:1px solid #f0f0f0;">
      Powered by NAN &nbsp;·&nbsp; nanarc.xyz
    </div>

  </div>
</body>
</html>`
}

export function downloadReceipt(data: ReceiptData) {
  const html = buildReceiptHtml(data)
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const ts   = new Date(data.timestamp).toISOString().slice(0, 10)
  const id   = data.id ? data.id.slice(-6) : ts
  a.href = url
  a.download = `nan-receipt-${ts}-${id}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function shareReceipt(data: ReceiptData) {
  const html = buildReceiptHtml(data)
  const blob = new Blob([html], { type: 'text/html' })
  const ts   = new Date(data.timestamp).toISOString().slice(0, 10)
  const file = new File([blob], `nan-receipt-${ts}.html`, { type: 'text/html' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ title: 'NAN Receipt', files: [file] }); return } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
