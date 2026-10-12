/**
 * POST /api/invoice-claim
 *
 * Called when the payer taps "I've sent the payment" on the invoice pay page.
 * Three steps server-side:
 *
 *  1. Onchain reconciliation — queries Arc for USDC Transfer events to the
 *     merchant's wallet since the invoice was issued; looks for an amount
 *     matching amountDue within 1% tolerance.
 *
 *  2. AI summary — uses Groq/OpenAI to produce a plain-English verdict.
 *
 *  3. Notification — in-app (Redis by owner wallet) + email to businessEmail.
 *
 * Returns { matched, txHash, aiSummary, claimId }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis.js'
import { invoiceClaimEmail } from './_emails.js'

// ── Arc chain facts (from onchain-facts.ts; keeping server-side copy) ─────────
const ARC_CHAIN_ID   = 5042
// USDC ERC-20 address on Arc Mainnet — from the onchain-facts registry
const USDC_ARC       = '0x3600000000000000000000000000000000000000' // arc-studio-allow-onchain-literal
// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_SIG   = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // arc-studio-allow-onchain-literal
const USDC_DECIMALS  = 6

// ── RPC helper (uses RPC proxy if available, falls back to onchain-facts URL) ─
function arcRpcUrl(): string {
  const base   = process.env.RPC_PROXY_BASE_URL
  const token  = process.env.RPC_PROXY_TOKEN
  const chains = process.env.RPC_PROXY_CHAINS ?? ''
  if (base && token && chains.split(',').map(s => s.trim()).includes(String(ARC_CHAIN_ID))) {
    return `${base}/api/rpc/${ARC_CHAIN_ID}?_rpc_token=${token}`
  }
  // Public fallback (from onchain-facts rpcUrls[0])
  return 'https://rpc.mainnet.arc.io' // arc-studio-allow-onchain-literal
}

function rand(n = 8) { return Math.random().toString(36).slice(2, 2 + n) }

async function arcRpc(method: string, params: unknown[]): Promise<unknown> {
  const r = await fetch(arcRpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json() as { result?: unknown; error?: { message: string } }
  if (j.error) throw new Error(j.error.message)
  return j.result
}

/** Pad an address into a 32-byte log topic */
function addrTopic(addr: string): string {
  return '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

interface LogEntry {
  topics: string[]
  data: string
  transactionHash: string
}

async function findMatchingTransfer(
  toAddress: string,
  expectedAmount: number,
  issuedAt: string,
): Promise<{ matched: boolean; txHash?: string; foundAmount?: number }> {
  try {
    const expectedRaw = BigInt(Math.round(expectedAmount * Math.pow(10, USDC_DECIMALS)))
    const tolerance   = expectedRaw / 100n // 1%

    const nowBlock  = Number(await arcRpc('eth_blockNumber', []))
    // Arc ~1.4 s/block. Calculate blocks since invoice was issued, cap at 30 days
    const issuedMs   = issuedAt ? new Date(issuedAt).getTime() : Date.now() - 7 * 86400_000
    const ageSeconds = Math.max(0, (Date.now() - issuedMs) / 1000)
    const ageBlocks  = Math.ceil(ageSeconds / 1.4) + 200 // small buffer
    const maxLookback = Math.ceil(30 * 86400 / 1.4)
    const fromBlock  = Math.max(0, nowBlock - Math.min(ageBlocks, maxLookback))

    const logs = await arcRpc('eth_getLogs', [{
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock:   'latest',
      address:   USDC_ARC,
      topics:    [TRANSFER_SIG, null, addrTopic(toAddress)],
    }]) as LogEntry[]

    for (const log of (logs ?? []).reverse()) {
      const amount = BigInt('0x' + log.data.replace(/^0x/, '').padStart(64, '0'))
      if (amount >= expectedRaw - tolerance && amount <= expectedRaw + tolerance) {
        return {
          matched: true,
          txHash: log.transactionHash,
          foundAmount: Number(amount) / Math.pow(10, USDC_DECIMALS),
        }
      }
    }
    return { matched: false }
  } catch (err) {
    console.warn('[invoice-claim] onchain scan failed:', err)
    return { matched: false }
  }
}

async function buildAiSummary(opts: {
  matched: boolean
  txHash?: string
  foundAmount?: number
  expectedAmount: number
  currency: string
  invoiceNumber: string
  customerName: string
  merchantName: string
}): Promise<string> {
  const { matched, txHash, foundAmount, expectedAmount, currency, invoiceNumber, customerName, merchantName } = opts

  const prompt = matched
    ? `Invoice ${invoiceNumber} for ${merchantName}: ${customerName} claimed payment. Onchain scan confirmed a USDC transfer of ${foundAmount?.toFixed(2)} ${currency} to the merchant wallet (tx ${txHash?.slice(0, 14)}). Write one concise sentence telling the merchant the payment is confirmed and funds are in their wallet.`
    : `Invoice ${invoiceNumber} for ${merchantName}: ${customerName} claimed to have sent ${expectedAmount.toFixed(2)} ${currency}, but no matching onchain transfer was found yet. Write one concise sentence telling the merchant to check their wallet in a few minutes.`

  const callLlm = async (apiKey: string, baseUrl: string, model: string) => {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are the NAN payment reconciliation AI. Be concise and professional. One sentence only, no markdown.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 80,
      }),
    })
    const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
    if (d.error) throw new Error(d.error.message)
    return d.choices?.[0]?.message?.content?.trim() ?? ''
  }

  const openaiKey = process.env.OPENAI_API_KEY
  const groqKey   = process.env.GROQ_API_KEY

  if (openaiKey) {
    try { const s = await callLlm(openaiKey, 'https://api.openai.com/v1', 'gpt-4o-mini'); if (s) return s } catch { /* fallthrough */ }
  }
  if (groqKey) {
    try { const s = await callLlm(groqKey, 'https://api.groq.com/openai/v1', 'llama-3.1-8b-instant'); if (s) return s } catch { /* fallthrough */ }
  }

  return matched
    ? `Payment of ${foundAmount?.toFixed(2) ?? expectedAmount.toFixed(2)} ${currency} confirmed on the Arc blockchain — funds are in your wallet.`
    : `${customerName} claims to have sent ${expectedAmount.toFixed(2)} ${currency} — no matching transfer found yet. Check your wallet in a few minutes.`
}

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = process.env.RESEND_API_KEY
  const smtpUser  = process.env.SMTP_USER
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'NAN Payments <notifications@nanarc.xyz>', to, subject, html }),
      })
    } catch (e) { console.warn('[invoice-claim] Resend failed:', e) }
    return
  }
  if (smtpUser) {
    try {
      const nodemailer = await import('nodemailer')
      const t = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_PORT === '465',
        auth: { user: smtpUser, pass: process.env.SMTP_PASS },
      })
      await t.sendMail({ from: `NAN <${smtpUser}>`, to, subject, html })
    } catch (e) { console.warn('[invoice-claim] SMTP failed:', e) }
  }
}

interface StoredInvoice {
  id: string; number: string; businessName: string; businessEmail?: string
  customerName: string; amountDue: number; total: number; currency: string
  payToAddress?: string; issuedDate?: string; createdAt?: string; _owner?: string
  status?: string
}

interface StoredNotification {
  id: string; userEmail: string; type: string; title: string; body: string
  read: boolean; createdAt: string; invoiceId?: string; claimId?: string
  matched?: boolean; txHash?: string; aiSummary?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' })

  const { invoiceId, txHash: claimedTxHash, payerName } =
    (req.body ?? {}) as { invoiceId?: string; txHash?: string; payerName?: string }

  if (!invoiceId) return res.status(400).json({ success: false, error: 'invoiceId required' })

  const kv = getRedis()
  if (!kv) return res.status(503).json({ success: false, error: 'storage_not_configured' })

  const invoice = await kv.get<StoredInvoice>(`inv:${invoiceId}`)
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' })

  const claimId  = `claim-${rand()}`
  const issuedAt = invoice.issuedDate ?? invoice.createdAt ?? new Date(Date.now() - 7 * 86400_000).toISOString()

  // 1. Onchain scan
  const { matched, txHash: foundTxHash, foundAmount } = invoice.payToAddress
    ? await findMatchingTransfer(invoice.payToAddress, invoice.amountDue, issuedAt)
    : { matched: false, txHash: undefined, foundAmount: undefined }

  const resolvedTxHash = foundTxHash ?? claimedTxHash
  const customerDisplay = payerName ?? invoice.customerName ?? 'Your customer'

  // 2. AI summary
  const aiSummary = await buildAiSummary({
    matched, txHash: resolvedTxHash, foundAmount,
    expectedAmount: invoice.amountDue,
    currency: invoice.currency ?? 'USDC',
    invoiceNumber: invoice.number,
    customerName: customerDisplay,
    merchantName: invoice.businessName,
  })

  // 3. Update invoice in Redis if confirmed
  if (matched) {
    const updated = {
      ...invoice, status: 'paid',
      amountPaid: invoice.total, amountDue: 0,
      paidAt: new Date().toISOString(), paidTxHash: resolvedTxHash,
      reconciled: true, reconciledAt: new Date().toISOString(), reconciledBy: 'onchain', claimId,
    }
    await kv.set(`inv:${invoiceId}`, updated, { ex: 60 * 60 * 24 * 180 })
  }

  // 4. In-app notification keyed by merchant wallet
  if (invoice._owner) {
    const notifKey = `notif:${invoice._owner.toLowerCase()}`
    const existing = (await kv.get<StoredNotification[]>(notifKey)) ?? []
    existing.unshift({
      id: `notif-${Date.now()}-${rand(4)}`,
      userEmail: invoice._owner,
      type: matched ? 'invoice_paid' : 'invoice_claimed',
      title: matched ? `Invoice ${invoice.number} paid` : `Payment claimed for ${invoice.number}`,
      body: aiSummary,
      read: false,
      createdAt: new Date().toISOString(),
      invoiceId, claimId, matched, txHash: resolvedTxHash, aiSummary,
    })
    await kv.set(notifKey, existing.slice(0, 100), { ex: 60 * 60 * 24 * 90 })
  }

  // 5. Email
  if (invoice.businessEmail) {
    const { subject, html } = invoiceClaimEmail({
      invoiceNumber: invoice.number,
      customerName: customerDisplay,
      amount: invoice.amountDue,
      currency: invoice.currency ?? 'USDC',
      matched, txHash: resolvedTxHash, aiSummary, invoiceId,
    })
    await sendEmail(invoice.businessEmail, subject, html)
  }

  return res.json({ success: true, claimId, matched, txHash: resolvedTxHash, aiSummary })
}
