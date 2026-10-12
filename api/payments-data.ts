/**
 * api/payments-data.ts — merged handler for payment-requests and recurring-tasks
 * Replaces api/payment-requests.ts and api/recurring-tasks.ts (both deleted).
 *
 * Route selection via query param:  ?type=payment-requests | recurring-tasks
 * All CRUD operations use the same method semantics as before.
 * The id for PATCH/DELETE is passed as ?id=<id>.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis.js'
import { invoiceClaimEmail } from './_emails.js'

// ── Invoice-claim helpers (merged from api/invoice-claim.ts) ──────────────────
const ARC_CHAIN_ID  = 5042
const USDC_ARC      = '0x3600000000000000000000000000000000000000' // arc-studio-allow-onchain-literal
const TRANSFER_SIG  = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // arc-studio-allow-onchain-literal
const USDC_DECIMALS = 6

function arcRpcUrl(): string {
  const base  = process.env.RPC_PROXY_BASE_URL
  const token = process.env.RPC_PROXY_TOKEN
  const chains = process.env.RPC_PROXY_CHAINS ?? ''
  if (base && token && chains.split(',').map(s => s.trim()).includes(String(ARC_CHAIN_ID)))
    return `${base}/api/rpc/${ARC_CHAIN_ID}?_rpc_token=${token}`
  return 'https://rpc.mainnet.arc.io' // arc-studio-allow-onchain-literal
}

async function arcRpc(method: string, params: unknown[]): Promise<unknown> {
  const r = await fetch(arcRpcUrl(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await r.json() as { result?: unknown; error?: { message: string } }
  if (j.error) throw new Error(j.error.message)
  return j.result
}

function addrTopic(addr: string) { return '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0') }

interface LogEntry { topics: string[]; data: string; transactionHash: string }

async function findMatchingTransfer(toAddress: string, expectedAmount: number, issuedAt: string) {
  try {
    const expectedRaw = BigInt(Math.round(expectedAmount * Math.pow(10, USDC_DECIMALS)))
    const tolerance   = expectedRaw / 100n
    const nowBlock    = Number(await arcRpc('eth_blockNumber', []))
    const ageSeconds  = Math.max(0, (Date.now() - new Date(issuedAt || 0).getTime()) / 1000)
    const fromBlock   = Math.max(0, nowBlock - Math.min(Math.ceil(ageSeconds / 1.4) + 200, Math.ceil(30 * 86400 / 1.4)))
    const logs = await arcRpc('eth_getLogs', [{
      fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest',
      address: USDC_ARC, topics: [TRANSFER_SIG, null, addrTopic(toAddress)],
    }]) as LogEntry[]
    for (const log of (logs ?? []).reverse()) {
      const amount = BigInt('0x' + log.data.replace(/^0x/, '').padStart(64, '0'))
      if (amount >= expectedRaw - tolerance && amount <= expectedRaw + tolerance)
        return { matched: true, txHash: log.transactionHash, foundAmount: Number(amount) / Math.pow(10, USDC_DECIMALS) }
    }
    return { matched: false, txHash: undefined as string | undefined, foundAmount: undefined as number | undefined }
  } catch { return { matched: false, txHash: undefined as string | undefined, foundAmount: undefined as number | undefined } }
}

async function buildClaimAiSummary(opts: { matched: boolean; txHash?: string; foundAmount?: number; expectedAmount: number; currency: string; invoiceNumber: string; customerName: string; merchantName: string }): Promise<string> {
  const { matched, txHash, foundAmount, expectedAmount, currency, invoiceNumber, customerName, merchantName } = opts
  const prompt = matched
    ? `Invoice ${invoiceNumber} for ${merchantName}: ${customerName} claimed payment. Onchain scan confirmed ${foundAmount?.toFixed(2)} ${currency} (tx ${txHash?.slice(0, 14)}). One sentence confirming funds are in the wallet.`
    : `Invoice ${invoiceNumber} for ${merchantName}: ${customerName} claimed to send ${expectedAmount.toFixed(2)} ${currency} but no matching transfer found yet. One sentence telling merchant to check wallet soon.`
  const call = async (key: string, base: string, model: string) => {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: 'NAN reconciliation AI. One sentence, no markdown.' }, { role: 'user', content: prompt }], max_tokens: 80 }),
    })
    const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
    if (d.error) throw new Error(d.error.message)
    return d.choices?.[0]?.message?.content?.trim() ?? ''
  }
  if (process.env.OPENAI_API_KEY) try { const s = await call(process.env.OPENAI_API_KEY, 'https://api.openai.com/v1', 'gpt-4o-mini'); if (s) return s } catch { /* fallthrough */ }
  if (process.env.GROQ_API_KEY)   try { const s = await call(process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1', 'llama-3.1-8b-instant'); if (s) return s } catch { /* fallthrough */ }
  return matched
    ? `Payment of ${(foundAmount ?? expectedAmount).toFixed(2)} ${currency} confirmed on Arc — funds are in your wallet.`
    : `${customerName} claims to have sent ${expectedAmount.toFixed(2)} ${currency} — no matching transfer found yet, check your wallet in a few minutes.`
}

async function sendClaimEmail(to: string, subject: string, html: string) {
  if (process.env.RESEND_API_KEY) {
    try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'NAN Payments <notifications@nanarc.xyz>', to, subject, html }) }) } catch { /* ignore */ }
    return
  }
  if (process.env.SMTP_USER) {
    try {
      const nm = await import('nodemailer')
      const t = nm.default.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_PORT === '465', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
      await t.sendMail({ from: `NAN <${process.env.SMTP_USER}>`, to, subject, html })
    } catch { /* ignore */ }
  }
}

function walletKey(req: VercelRequest): string {
  return (req.headers['x-wallet-address'] as string | undefined ?? '').toLowerCase()
}

// ── Payment Request types ──────────────────────────────────────────────────────
interface StoredPR {
  id: string; refNumber: string; title: string; description?: string
  recipientName?: string; amount: number; currency: string; note?: string
  reference?: string; dueDate?: string; createdAt: string; status: string
  paidAt?: string; paidTxHash?: string; paidAmount?: number; creatorAddress?: string
  updatedAt: string
}

// ── Recurring Task types ───────────────────────────────────────────────────────
interface StoredTask {
  id: string; name: string; recipient: string; amount: string
  active: boolean; frequency: string; nextRunAt?: string
  lastRun?: string; lastTxHash?: string; runCount: number; createdAt: string
}

function rand() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-wallet-address, authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const type = (req.query.type ?? '') as string
  const wallet = walletKey(req)

  // Public routes — no wallet header required:
  //  • GET /api/invoices/:id   — pay-link recipients read invoice
  //  • POST /api/invoice-claim — pay-link payers claim payment (no account needed)
  const isPublicRoute =
    (type === 'invoices' && req.method === 'GET' && !!req.query.id) ||
    (type === 'invoice-claim' && req.method === 'POST')
  if (!wallet && !isPublicRoute)
    return res.status(401).json({ success: false, error: 'x-wallet-address header required' })

  const kv = getRedis()

  // ── PAYMENT REQUESTS ────────────────────────────────────────────────────────
  if (type === 'payment-requests') {
    const storeKey = `pr:${wallet}`

    if (!kv) {
      if (req.method === 'GET') return res.json({ success: true, requests: [], warning: 'storage_not_configured' })
      return res.json({ success: true, warning: 'storage_not_configured' })
    }

    if (req.method === 'GET') {
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      return res.json({ success: true, requests: list })
    }

    if (req.method === 'POST') {
      const body = req.body as Partial<StoredPR>
      if (!body.title || !body.amount || !body.currency)
        return res.status(400).json({ success: false, error: 'title, amount, currency required' })
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      const seq = (list.length + 1).toString().padStart(4, '0')
      const pr: StoredPR = {
        id: body.id ?? `pr-${rand()}`,
        refNumber: body.refNumber ?? `NAN-PR-${seq}`,
        title: body.title, description: body.description,
        recipientName: body.recipientName, amount: Number(body.amount),
        currency: body.currency, note: body.note, reference: body.reference,
        dueDate: body.dueDate, createdAt: body.createdAt ?? new Date().toISOString(),
        status: body.status ?? 'pending', paidAt: body.paidAt, paidTxHash: body.paidTxHash,
        paidAmount: body.paidAmount, creatorAddress: body.creatorAddress ?? wallet,
        updatedAt: new Date().toISOString(),
      }
      list.unshift(pr)
      await kv.set(storeKey, list.slice(0, 500), { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true, request: pr })
    }

    if (req.method === 'PATCH') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      const idx = list.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
      list[idx] = { ...list[idx], ...(req.body as Partial<StoredPR>), id, updatedAt: new Date().toISOString() }
      await kv.set(storeKey, list, { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true, request: list[idx] })
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredPR[]>(storeKey)) ?? []
      await kv.set(storeKey, list.filter(r => r.id !== id), { ex: 60 * 60 * 24 * 90 })
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── RECURRING TASKS ─────────────────────────────────────────────────────────
  if (type === 'recurring-tasks') {
    const storeKey = `rt:${wallet}`

    if (!kv) {
      if (req.method === 'GET') return res.json({ success: true, tasks: [], warning: 'storage_not_configured' })
      return res.json({ success: true, warning: 'storage_not_configured' })
    }

    if (req.method === 'GET') {
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      return res.json({ success: true, tasks: list })
    }

    if (req.method === 'POST') {
      const body = req.body as Partial<StoredTask>
      if (!body.name || !body.recipient || !body.amount)
        return res.status(400).json({ success: false, error: 'name, recipient, amount required' })
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      const task: StoredTask = {
        id: body.id ?? `rec-${rand()}`,
        name: body.name, recipient: body.recipient, amount: body.amount,
        active: body.active ?? true, frequency: body.frequency ?? 'manual',
        nextRunAt: body.nextRunAt, lastRun: body.lastRun, lastTxHash: body.lastTxHash,
        runCount: body.runCount ?? 0, createdAt: body.createdAt ?? new Date().toISOString(),
      }
      list.push(task)
      await kv.set(storeKey, list.slice(0, 200), { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true, task })
    }

    if (req.method === 'PATCH') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      const idx = list.findIndex(t => t.id === id)
      if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' })
      list[idx] = { ...list[idx], ...(req.body as Partial<StoredTask>), id }
      await kv.set(storeKey, list, { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true, task: list[idx] })
    }

    if (req.method === 'DELETE') {
      const id = (req.query.id ?? (req.url ?? '').split('/').pop()) as string
      const list = (await kv.get<StoredTask[]>(storeKey)) ?? []
      await kv.set(storeKey, list.filter(t => t.id !== id), { ex: 60 * 60 * 24 * 365 })
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── INVOICES ──────────────────────────────────────────────────────────────────
  // GET    /api/invoices/:id  — public (no wallet header needed) — used by pay-link recipients
  // POST   /api/invoices      — upsert (wallet header used as owner key)
  // DELETE /api/invoices/:id  — requires wallet header matching creator
  if (type === 'invoices') {
    // Extract id from query or URL path segment
    const id = (req.query.id ?? (req.url ?? '').split('?')[0].split('/').filter(Boolean).pop()) as string | undefined

    // GET by id — public, no wallet required
    if (req.method === 'GET' && id) {
      if (!kv) return res.json({ success: false, error: 'storage_not_configured' })
      const inv = await kv.get<object>(`inv:${id}`)
      if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' })
      return res.json({ success: true, invoice: inv })
    }

    // POST — upsert invoice (wallet required)
    if (req.method === 'POST') {
      const body = req.body as Record<string, unknown>
      const invId = (body.id as string | undefined) ?? `inv-${rand()}`
      if (!body.businessName || !body.customerName) {
        return res.status(400).json({ success: false, error: 'businessName and customerName required' })
      }
      const toStore = { ...body, id: invId, _owner: wallet || 'anon', _savedAt: new Date().toISOString() }
      if (kv) {
        await kv.set(`inv:${invId}`, toStore, { ex: 60 * 60 * 24 * 180 }) // 180 days TTL
      }
      return res.json({ success: true, invoice: toStore })
    }

    // DELETE — requires matching wallet
    if (req.method === 'DELETE' && id) {
      if (!wallet) return res.status(401).json({ success: false, error: 'x-wallet-address required' })
      if (!kv) return res.json({ success: true })
      const existing = await kv.get<Record<string, unknown>>(`inv:${id}`)
      if (existing && existing._owner && existing._owner !== wallet)
        return res.status(403).json({ success: false, error: 'Forbidden' })
      await kv.del(`inv:${id}`)
      return res.json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── INVOICE CLAIM ─────────────────────────────────────────────────────────────
  // POST /api/invoice-claim  { invoiceId, txHash?, payerName? }
  if (type === 'invoice-claim') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' })
    const { invoiceId, txHash: claimedTxHash, payerName } =
      (req.body ?? {}) as { invoiceId?: string; txHash?: string; payerName?: string }
    if (!invoiceId) return res.status(400).json({ success: false, error: 'invoiceId required' })
    if (!kv) return res.status(503).json({ success: false, error: 'storage_not_configured' })

    interface ClaimInvoice {
      id: string; number: string; businessName: string; businessEmail?: string
      customerName: string; amountDue: number; total: number; currency: string
      payToAddress?: string; issuedDate?: string; createdAt?: string; _owner?: string; status?: string
    }
    interface ClaimNotif {
      id: string; userEmail: string; type: string; title: string; body: string
      read: boolean; createdAt: string; invoiceId?: string; claimId?: string
      matched?: boolean; txHash?: string; aiSummary?: string
    }

    const inv = await kv.get<ClaimInvoice>(`inv:${invoiceId}`)
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' })

    const claimId  = `claim-${Math.random().toString(36).slice(2, 10)}`
    const issuedAt = inv.issuedDate ?? inv.createdAt ?? new Date(Date.now() - 7 * 86400_000).toISOString()

    const { matched, txHash: foundTxHash, foundAmount } = inv.payToAddress
      ? await findMatchingTransfer(inv.payToAddress, inv.amountDue, issuedAt)
      : { matched: false, txHash: undefined, foundAmount: undefined }

    const resolvedTxHash = foundTxHash ?? claimedTxHash
    const customerDisplay = payerName ?? inv.customerName ?? 'Your customer'
    const currency = inv.currency ?? 'USDC'

    const aiSummary = await buildClaimAiSummary({
      matched, txHash: resolvedTxHash, foundAmount,
      expectedAmount: inv.amountDue, currency,
      invoiceNumber: inv.number, customerName: customerDisplay, merchantName: inv.businessName,
    })

    if (matched) {
      await kv.set(`inv:${invoiceId}`, {
        ...inv, status: 'paid', amountPaid: inv.total, amountDue: 0,
        paidAt: new Date().toISOString(), paidTxHash: resolvedTxHash,
        reconciled: true, reconciledAt: new Date().toISOString(), reconciledBy: 'onchain', claimId,
      }, { ex: 60 * 60 * 24 * 180 })
    }

    // Write notification using same key pattern as community.ts:
    // lpush to notifs:<email> so it appears in the merchant's notification bell.
    // Use businessEmail as primary key; fall back to _owner wallet address.
    const notifEmail = inv.businessEmail ?? inv._owner
    if (notifEmail) {
      const notif: ClaimNotif = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userEmail: notifEmail,
        type: matched ? 'invoice_paid' : 'invoice_claimed',
        title: matched ? `Invoice ${inv.number} paid ✓` : `Payment claimed — ${inv.number}`,
        body: aiSummary, read: false, createdAt: new Date().toISOString(),
        invoiceId, claimId, matched, txHash: resolvedTxHash, aiSummary,
      }
      await kv.lpush(`notifs:${notifEmail}`, notif)
      await kv.ltrim(`notifs:${notifEmail}`, 0, 99)
    }

    if (inv.businessEmail) {
      const { subject, html } = invoiceClaimEmail({
        invoiceNumber: inv.number, customerName: customerDisplay,
        amount: inv.amountDue, currency, matched, txHash: resolvedTxHash, aiSummary, invoiceId,
      })
      await sendClaimEmail(inv.businessEmail, subject, html)
    }

    return res.json({ success: true, claimId, matched, txHash: resolvedTxHash, aiSummary })
  }

  return res.status(400).json({ success: false, error: 'type param required: payment-requests | recurring-tasks | invoices | invoice-claim' })
}
