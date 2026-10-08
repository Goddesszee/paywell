/**
 * Netlify function: /.netlify/functions/chat → /api/chat
 *
 * NAN Agent v2 — full intelligence upgrade.
 * Knows the user's live wallet state, recent activity, recurring payments,
 * payment requests, invoices, agent policy, and cross-chain balances.
 *
 * LLM priority: OPENAI_API_KEY → GROQ_API_KEY → static keyword fallback
 */
import type { Handler, HandlerEvent } from '@netlify/functions'

function cors(body: string, statusCode: number) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Payment, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body,
  }
}

// ── action block parser ───────────────────────────────────────────────────────
function extractAction(raw: string): { text: string; action: Record<string, unknown> | null } {
  const match = raw.match(/```nan-action\s*\n([\s\S]*?)\n```/)
  if (!match) return { text: raw.trim(), action: null }
  const text = raw.replace(/```nan-action[\s\S]*?```/, '').trim()
  try {
    return { text, action: JSON.parse(match[1].trim()) as Record<string, unknown> }
  } catch {
    return { text, action: null }
  }
}

// ── context type ──────────────────────────────────────────────────────────────
interface ChatContext {
  mainBalance?: string
  mainAddress?: string
  agentBalance?: string
  agentAddress?: string
  agentWalletProvisioned?: boolean
  agentWalletId?: string
  agentWalletBlockchain?: string
  agentWalletAccountType?: string
  dailyLimit?: number
  perTxLimit?: number
  perServiceLimit?: number
  remainingToday?: number
  agentEnabled?: boolean
  requireApproval?: boolean
  requireApprovalAbove?: number
  autoApproveUnder?: number
  agentDailyUsed?: number
  crossChainBalances?: Record<string, string>
  crossChainSummary?: string
  totalCrossChainBalance?: string
  recentActivity?: Array<{ type: string; amount: number; sign: string; description: string; counterparty?: string; timestamp: string; status: string; txHash?: string }>
  recurringTasks?: Array<{ name: string; recipient: string; amount: string; frequency: string; active: boolean; nextRunAt?: string; runCount: number }>
  openPaymentRequests?: Array<{ refNumber: string; title: string; amount: number; status: string; dueDate?: string }>
  recentInvoices?: Array<{ number: string; customerName: string; total: number; status: string; dueDate: string; amountDue: number }>
  displayName?: string
  recentAgentActions?: Array<{ userRequest: string; serviceName?: string; status: string; cost: number; timestamp: string }>
  unreadNotifications?: number
}

// ── system prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(ctx: ChatContext, usdcBal?: string, userAddress?: string): string {
  // Wallet block
  const crossChainLines = ctx.crossChainBalances
    ? Object.entries(ctx.crossChainBalances).map(([chain, bal]) => `  - ${chain}: ${parseFloat(bal).toFixed(2)} USDC`).join('\n')
    : ''
  const walletBlock = `## LIVE WALLET STATE (real-time, injected at request time)
- User: ${ctx.displayName ? `**${ctx.displayName}**` : '(no display name set)'}
- Main wallet: **${parseFloat(ctx.mainBalance ?? usdcBal ?? '0').toFixed(2)} USDC** on Arc Testnet
  Address: ${ctx.mainAddress ?? userAddress ?? 'not connected'}
- Agent Wallet: **${parseFloat(ctx.agentBalance ?? '0').toFixed(2)} USDC** (${ctx.agentWalletProvisioned ? 'provisioned' : 'NOT set up'})
  ${ctx.agentAddress ? `Address: ${ctx.agentAddress}` : '(no address)'}
- Agent enabled: ${ctx.agentEnabled !== false ? 'YES' : 'NO'}
- Daily limit: ${ctx.dailyLimit ?? 'not set'} USDC · Used today: ${(ctx.agentDailyUsed ?? 0).toFixed(2)} USDC · Remaining: ${ctx.remainingToday !== undefined ? ctx.remainingToday.toFixed(2) : 'unknown'} USDC
- Per-tx limit: ${ctx.perTxLimit ?? 'not set'} USDC · Per-service limit: ${ctx.perServiceLimit ?? 'not set'} USDC
- Auto-approve under: ${ctx.autoApproveUnder ?? 'not set'} USDC · Require approval above: ${ctx.requireApprovalAbove ?? 'not set'} USDC
- Unread notifications: ${ctx.unreadNotifications ?? 0}
${crossChainLines ? `- Cross-chain USDC:\n${crossChainLines}\n- Total cross-chain: ${ctx.totalCrossChainBalance ?? '0.00'} USDC` : '- No cross-chain balances yet'}`

  const activityBlock = ctx.recentActivity && ctx.recentActivity.length > 0
    ? `\n## RECENT ACTIVITY (last ${ctx.recentActivity.length} transactions)\n${
        ctx.recentActivity.map((a, i) =>
          `${i + 1}. ${a.sign}${a.amount.toFixed(2)} USDC · ${a.type} · ${a.description}${a.counterparty ? ` · to/from ${a.counterparty}` : ''} · ${a.status} · ${new Date(a.timestamp).toLocaleDateString()}`
        ).join('\n')
      }`
    : '\n## RECENT ACTIVITY\nNo transactions yet.'

  const recurringBlock = ctx.recurringTasks && ctx.recurringTasks.length > 0
    ? `\n## RECURRING PAYMENTS (${ctx.recurringTasks.length})\n${
        ctx.recurringTasks.map((t, i) =>
          `${i + 1}. "${t.name}" · ${t.amount} USDC ${t.frequency} → ${t.recipient.slice(0, 10)}… · ${t.active ? 'active' : 'paused'} · runs: ${t.runCount}`
        ).join('\n')
      }`
    : '\n## RECURRING PAYMENTS\nNo recurring payments set up.'

  const paymentReqBlock = ctx.openPaymentRequests && ctx.openPaymentRequests.length > 0
    ? `\n## OPEN PAYMENT REQUESTS (${ctx.openPaymentRequests.length})\n${
        ctx.openPaymentRequests.map((p, i) =>
          `${i + 1}. ${p.refNumber} · "${p.title}" · ${p.amount} USDC · ${p.status}${p.dueDate ? ` · due ${p.dueDate}` : ''}`
        ).join('\n')
      }`
    : '\n## PAYMENT REQUESTS\nNo open payment requests.'

  const invoiceBlock = ctx.recentInvoices && ctx.recentInvoices.length > 0
    ? `\n## RECENT INVOICES (${ctx.recentInvoices.length})\n${
        ctx.recentInvoices.map((inv, i) =>
          `${i + 1}. ${inv.number} · ${inv.customerName} · ${inv.total} USDC · ${inv.amountDue.toFixed(2)} due · ${inv.status}`
        ).join('\n')
      }`
    : ''

  return `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous payment and DeFi platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.

You have COMPLETE real-time awareness of the user's account. You are NOT a generic chatbot — you are their personal financial AI.

${walletBlock}
${activityBlock}
${recurringBlock}
${paymentReqBlock}
${invoiceBlock}

---

## CRITICAL: ACTION SYSTEM

When the user wants something DONE, emit EXACTLY ONE action block at the END of your reply:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

### ALL AVAILABLE ACTIONS:

**SENDING & PAYMENTS**
Send USDC (main/wagmi wallet):
{"action":"send_usdc","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

Send USDC (Circle UCW — email/Google login):
{"action":"ucw_send","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

Send USDC (Agent Wallet):
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

**BRIDGE**
Bridge via App Kit (wagmi users):
{"action":"bridge_start","params":{"amount":"<string>","toChain":"<chain name>"}}

Bridge from Circle UCW (email/Google users):
{"action":"ucw_bridge","params":{"amount":"<string>","toChain":"<chain name>"}}

**SWAP**
Swap tokens:
{"action":"swap_start","params":{"fromToken":"USDC","toToken":"<token>","amount":"<string>"}}

**GATEWAY**
Deposit into Gateway (opens Gateway tab):
{"action":"navigate","params":{"page":"gateway"}}

**RECURRING PAYMENTS**
Add recurring (main wallet):
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<string>","frequency":"daily|weekly|monthly|manual"}}

Add recurring (agent wallet):
{"action":"add_agent_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<string>","frequency":"daily|weekly|monthly|manual"}}

Cancel recurring by name:
{"action":"cancel_recurring","params":{"name":"<exact name>"}}

**PAYMENT REQUESTS**
Create payment request:
{"action":"create_payment_request","params":{"title":"<string>","amount":"<number>","note":"<optional>","dueDate":"<optional YYYY-MM-DD>"}}

**INVOICES**
Create invoice:
{"action":"create_invoice","params":{"customerName":"<string>","amount":"<number>","description":"<string>","dueDate":"<YYYY-MM-DD>"}}

**AGENT POLICY**
Update spending policy:
{"action":"set_policy","params":{"dailyLimit":<n>,"perTxLimit":<n>,"perServiceLimit":<n>,"autoApproveUnder":<n>,"requireApprovalAbove":<n>,"enabled":true|false}}

Toggle agent on/off:
{"action":"toggle_agent","params":{"enabled":true|false}}

**NAVIGATION**
Navigate to page:
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support|payment-requests|exports|about|faq|onramp"}}

---

## NAN COMPLETE FEATURE MAP

**AUTHENTICATION**
- Email OTP → Circle User-Controlled Wallet (UCW) on Arc Testnet
- Google OAuth → Circle UCW
- MetaMask / WalletConnect → Wagmi EOA wallet
- Passkey → Circle Modular Wallet (ERC-4337 SCA)
- Arc Testnet: USDC is the gas token — fees are fractions of a cent

**WALLET & PAYMENTS**: send/receive USDC, request payment (QR link), activity history, faucet (free testnet USDC), Circle Onramp (buy USDC with card)
**DEFI**: Bridge (CCTP V2, ~10s), Swap (Circle App Kit), Gateway (unified cross-chain USDC, <500ms)
**ESCROW**: PaywellEscrow contract on Arc Testnet
**AGENT STACK**: Agent Wallet (Circle UCW), spending policy, recurring payments, Agent Network, Circle Agent Marketplace (x402 nanopayments)
**INVOICING**: create/send/track invoices, export statements, payment request links with QR codes
**COMMUNITY**: suggestions board, support tickets, feedback, notifications

---

## HOW TO RESPOND

- ALWAYS answer directly using the LIVE STATE above. Never say "check your wallet" if you can see the balance.
- "What's my balance?" → state it directly from LIVE WALLET STATE above.
- "Show my transactions" → list them from RECENT ACTIVITY.
- "Show recurring payments" → list them from RECURRING PAYMENTS.
- Never fabricate addresses, transaction hashes, balances, or prices.
- Never say "I'm just a chatbot" — you CAN help with everything on NAN.
- Be concise and warm. Lead with the answer.
- When emitting an action, write 1-2 sentences BEFORE the block describing what you're doing.
- Never emit more than one action block per reply.
- Never emit an action if a required param (like toAddress) is missing — ask for it first.
- Always show amounts with 2 decimal places (e.g. "5.00 USDC" not "5 USDC").`
}

// ── keyword fallback (no LLM) ─────────────────────────────────────────────────
function keywordFallback(message: string, ctx: ChatContext, usdcBal?: string): { reply: string; action: Record<string, unknown> | null } {
  const m = message.toLowerCase()
  const mainBal = parseFloat(ctx.mainBalance ?? usdcBal ?? '0').toFixed(2)
  const agentBal = parseFloat(ctx.agentBalance ?? '0').toFixed(2)

  if (/balance|how much|my usdc|how many usdc/.test(m)) {
    const crossChain = ctx.crossChainSummary && ctx.totalCrossChainBalance && parseFloat(ctx.totalCrossChainBalance) > 0
      ? ` Cross-chain total: ${parseFloat(ctx.totalCrossChainBalance).toFixed(2)} USDC (${ctx.crossChainSummary}).`
      : ''
    return { reply: `Your main wallet has **${mainBal} USDC** on Arc Testnet. Your Agent Wallet has **${agentBal} USDC**.${crossChain}`, action: null }
  }
  if (/recent|activity|transactions|history/.test(m)) {
    if (ctx.recentActivity && ctx.recentActivity.length > 0) {
      const lines = ctx.recentActivity.slice(0, 5).map((a, i) =>
        `${i + 1}. ${a.sign}${a.amount.toFixed(2)} USDC — ${a.description} (${a.status})`
      ).join('\n')
      return { reply: `Here are your last ${Math.min(5, ctx.recentActivity.length)} transactions:\n\n${lines}`, action: null }
    }
    return { reply: "You don't have any transactions yet.", action: null }
  }
  if (/recurring|scheduled|automatic payment/.test(m)) {
    if (ctx.recurringTasks && ctx.recurringTasks.length > 0) {
      const lines = ctx.recurringTasks.map((t, i) =>
        `${i + 1}. "${t.name}" — ${t.amount} USDC ${t.frequency} (${t.active ? 'active' : 'paused'})`
      ).join('\n')
      return { reply: `You have ${ctx.recurringTasks.length} recurring payment${ctx.recurringTasks.length > 1 ? 's' : ''}:\n\n${lines}`, action: null }
    }
    return { reply: "You don't have any recurring payments set up yet.", action: null }
  }
  if (/send|transfer/.test(m)) {
    const addrMatch = message.match(/0x[0-9a-fA-F]{10,}/)
    const amtMatch  = message.match(/(\d+(?:\.\d+)?)\s*usdc?/i)
    if (addrMatch && amtMatch) {
      return { reply: `I'll send ${parseFloat(amtMatch[1]).toFixed(2)} USDC to ${addrMatch[0].slice(0, 10)}…. Please confirm.`,
               action: { action: 'send_usdc', params: { toAddress: addrMatch[0], amount: amtMatch[1] } } }
    }
    return { reply: 'To send USDC, please tell me the recipient address and amount. For example: "Send 5 USDC to 0x..."', action: null }
  }
  if (/bridge/.test(m)) {
    const amtMatch = message.match(/(\d+(?:\.\d+)?)\s*usdc?/i)
    return { reply: `Opening the Bridge tab${amtMatch ? ` with ${amtMatch[1]} USDC` : ''}. Complete the transfer there.`,
             action: { action: 'bridge_start', params: { amount: amtMatch?.[1] ?? '' } } }
  }
  if (/swap|convert/.test(m)) {
    const amtMatch = message.match(/(\d+(?:\.\d+)?)\s*usdc?/i)
    return { reply: `Opening the Swap tab${amtMatch ? ` with ${amtMatch[1]} USDC` : ''}. Review the quote there.`,
             action: { action: 'swap_start', params: { fromToken: 'USDC', amount: amtMatch?.[1] ?? '' } } }
  }
  if (/gateway/.test(m)) {
    return { reply: 'Opening Gateway — your unified cross-chain USDC balance.',
             action: { action: 'navigate', params: { page: 'gateway' } } }
  }
  if (/limit|daily|policy|spending/.test(m)) {
    const amtMatch = message.match(/(\d+(?:\.\d+)?)\s*usdc?/i)
    if (amtMatch) {
      return { reply: `Setting your daily spending limit to ${parseFloat(amtMatch[1]).toFixed(2)} USDC. Please confirm.`,
               action: { action: 'set_policy', params: { dailyLimit: parseFloat(amtMatch[1]) } } }
    }
    return { reply: `Your daily limit is ${ctx.dailyLimit ?? 'not set'} USDC. You've used ${(ctx.agentDailyUsed ?? 0).toFixed(2)} USDC today with ${ctx.remainingToday !== undefined ? ctx.remainingToday.toFixed(2) : 'unknown'} remaining.`, action: null }
  }
  if (/wallet|address/.test(m)) {
    return { reply: `Your main wallet address is ${ctx.mainAddress ?? 'not connected'}. Your Agent Wallet is ${ctx.agentWalletProvisioned ? ctx.agentAddress ?? 'provisioned' : 'not yet set up'}.`, action: null }
  }

  return { reply: "I'm NAN — your financial assistant on Arc Testnet. I can check balances, send USDC, bridge across chains, swap tokens, set up recurring payments, create invoices and payment requests, and manage your spending policy. What would you like to do?", action: null }
}

// ── main handler ──────────────────────────────────────────────────────────────
const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return cors('', 204)
  if (event.httpMethod !== 'POST')    return cors(JSON.stringify({ error: 'Method not allowed' }), 405)

  let body: {
    message?: string
    messages?: Array<{ role: string; content: string }>
    history?: Array<{ role: string; content: string }>
    usdcBal?: string
    userAddress?: string
    context?: ChatContext
  } = {}
  try { body = JSON.parse(event.body ?? '{}') as typeof body } catch { /* ignore */ }

  let message = ''
  let history: Array<{ role: string; content: string }> = []
  if (body.messages && body.messages.length > 0) {
    message = body.messages[body.messages.length - 1]?.content ?? ''
    history = body.messages.slice(0, -1)
  } else {
    message = body.message ?? ''
    history = body.history ?? []
  }
  if (!message) return cors(JSON.stringify({ error: 'message required' }), 400)

  const ctx = body.context ?? {}
  const systemPrompt = buildSystemPrompt(ctx, body.usdcBal, body.userAddress)

  // ── OpenAI (primary) ──────────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    console.error('[NAN chat] OPENAI_API_KEY is not set — add it to Vercel/Netlify environment variables')
  }
  if (process.env.OPENAI_API_KEY) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: message },
          ],
          max_tokens: 700,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
      if (d.error) throw new Error(d.error.message)
      const raw = d.choices?.[0]?.message?.content ?? ''
      if (raw) {
        const { text, action } = extractAction(raw)
        return cors(JSON.stringify({ reply: text, action }), 200)
      }
    } catch (e) {
      console.error('OpenAI error:', e)
    }
  }

  // ── Keyword fallback (no LLM available) ──────────────────────────────────
  const { reply, action } = keywordFallback(message, ctx, body.usdcBal)
  return cors(JSON.stringify({ reply, action }), 200)
}

export { handler }
