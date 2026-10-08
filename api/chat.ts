/**
 * api/chat.ts — NAN AI Agent chat endpoint (v2 — full intelligence upgrade)
 *
 * POST /api/chat
 * Body: { message, history?, messages?, context?, usdcBal?, userAddress? }
 *
 * LLM priority: OPENAI_API_KEY → GROQ_API_KEY → static fallback
 *
 * What's new in v2:
 *   - Full NAN platform awareness in system prompt
 *   - Rich context: activity, recurring tasks, payment requests, invoices,
 *     agent wallet, policy, cross-chain balances, notifications
 *   - 12 new action types: gateway_deposit, gateway_transfer,
 *     create_payment_request, create_invoice, cancel_recurring,
 *     check_balance, request_payment_link, ucw_send, ucw_bridge,
 *     ucw_swap, ucw_gateway_deposit, show_qr
 *   - Intent → live-data routing expanded to cover all NAN features
 *   - x402 payment gate (optional, requires SELLER_ADDRESS env var)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
// groq-sdk is imported dynamically inside the handler to avoid cold-start
// bundling failures on Vercel (the SDK is not in includeFiles, so a top-level
// import causes a module-not-found crash before the handler runs).
import type { MarketplaceServiceCard } from './agent-wallet'

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

// ── marketplace intent detection ──────────────────────────────────────────────
function detectMarketplaceIntent(message: string): string | null {
  const m = message.toLowerCase()
  if (/find (me )?(a |an |some )?service|search (for )?service|what services|which services|services.*agent (can |use|do)|show.*services|browse services|discover services|list.*services|available services/.test(m)) {
    const afterThat = m.match(/service[s]?\s+(that\s+)?(can\s+)?(.+)/)
    if (afterThat?.[3]) return afterThat[3].replace(/\?/g, '').trim()
    const beforeService = m.match(/find\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?(.+?)\s+service/)
    if (beforeService?.[1] && beforeService[1] !== 'a' && beforeService[1] !== 'an') return beforeService[1].trim()
    return 'general'
  }
  if (/find\s+(?:a\s+)?(?:service|something|tool|api)\s+(?:for|that|to)\s+(.+)/.test(m)) {
    return m.match(/find\s+(?:a\s+)?(?:service|something|tool|api)\s+(?:for|that|to)\s+(.+)/)?.[1]?.replace(/\?/g, '').trim() ?? 'general'
  }
  if (/(?:i need|looking for|help with|want)\s+(?:a\s+|an\s+)?(.+?)\s+service/.test(m)) {
    return m.match(/(?:i need|looking for|help with|want)\s+(?:a\s+|an\s+)?(.+?)\s+service/)?.[1]?.trim() ?? 'general'
  }
  if (/compare\s+(?:these\s+)?services/.test(m)) return 'general'
  if (/best\s+(?:suitable\s+)?(?:\w+\s+)?service/.test(m)) {
    return m.match(/best\s+(?:suitable\s+)?(?:(\w+)\s+)?service/)?.[1] ?? 'general'
  }
  return null
}

async function fetchMarketplace(query: string, baseUrl: string): Promise<MarketplaceServiceCard[]> {
  try {
    const r = await fetch(`${baseUrl}/api/agent-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marketplace-search', query }),
      signal: AbortSignal.timeout(18_000),
    })
    if (!r.ok) return []
    const d = await r.json() as { services?: MarketplaceServiceCard[] }
    return d.services ?? []
  } catch { return [] }
}

// ── service intent classification ─────────────────────────────────────────────
type ServiceIntent = { service_id: string; query: string } | null

function classifyToService(message: string): ServiceIntent {
  const m = message.toLowerCase()
  if (/bitcoin|ethereum|btc|eth|solana|bnb|crypto price|coin price|token price|market cap|dogecoin|ripple|xrp/.test(m))
    return { service_id: 'coingecko-prices', query: message }
  if (/exchange rate|usd to|dollar to|naira|ngn|gbp|forex|convert.*currency|currency.*convert|how much is.*in/.test(m))
    return { service_id: 'exchangerate-fx', query: message }
  if (/flight|cheapest flight|fly from|fly to|book.*flight|airline|ticket to|travel to.*by plane/.test(m))
    return { service_id: 'skyscanner-flights', query: message }
  if (/hotel|accommodation|where to stay|hostel|airbnb|book.*hotel|place to stay/.test(m))
    return { service_id: 'amadeus-hotels', query: message }
  if (/github|open source|repository|npm package|library for|code for|find.*package|find.*library/.test(m))
    return { service_id: 'github-code-search', query: message }
  if (/research|analyze|deep dive|comprehensive overview|explain in detail|compare.*options|summarize.*topic/.test(m))
    return { service_id: 'perplexity-research', query: message }
  if (/supplier|manufacturer|wholesale|factory|alibaba|bulk buy|product sourcing/.test(m))
    return { service_id: 'alibaba-suppliers', query: message }
  if (/search for|look up|what is the latest|current news|who is|where is|find information|tell me about|news about/.test(m)) {
    if (process.env.SERPER_API_KEY) return { service_id: 'serper-search', query: message }
    if (process.env.BRAVE_SEARCH_API_KEY) return { service_id: 'brave-search', query: message }
  }
  return null
}

async function callExecute(service_id: string, query: string, baseUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id, query }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return null
    const d = await r.json() as { result?: string }
    return d.result ?? null
  } catch { return null }
}

// ── context type ──────────────────────────────────────────────────────────────
interface ChatContext {
  mainBalance?: string
  mainAddress?: string
  agentBalance?: string
  agentAddress?: string
  agentWalletProvisioned?: boolean
  dailyLimit?: number
  perTxLimit?: number
  perServiceLimit?: number
  remainingToday?: number
  agentEnabled?: boolean
  crossChainBalances?: Record<string, string>
  crossChainSummary?: string
  totalCrossChainBalance?: string
  // Activity (last 10)
  recentActivity?: Array<{ type: string; amount: number; sign: string; description: string; counterparty?: string; timestamp: string; status: string; txHash?: string }>
  // Recurring tasks
  recurringTasks?: Array<{ name: string; recipient: string; amount: string; frequency: string; active: boolean; nextRunAt?: string; runCount: number }>
  // Payment requests (open ones)
  openPaymentRequests?: Array<{ refNumber: string; title: string; amount: number; status: string; dueDate?: string }>
  // Invoices (recent)
  recentInvoices?: Array<{ number: string; customerName: string; total: number; status: string; dueDate: string; amountDue: number }>
  // Profile
  displayName?: string
  // Agent policy
  requireApproval?: boolean
  requireApprovalAbove?: number
  autoApproveUnder?: number
  // Spending today
  agentDailyUsed?: number
  // Execution log (last 5)
  recentAgentActions?: Array<{ userRequest: string; serviceName?: string; status: string; cost: number; timestamp: string }>
  // Agent wallet state
  agentWalletId?: string
  agentWalletBlockchain?: string
  agentWalletAccountType?: string
  // Notifications
  unreadNotifications?: number
}

// ── system prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(opts: {
  walletBlock: string
  liveDataBlock: string
  marketplaceBlock: string
  activityBlock: string
  recurringBlock: string
  paymentRequestBlock: string
  invoiceBlock: string
  agentStateBlock: string
}): string {
  return `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous payment and DeFi platform built on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.

You have COMPLETE awareness of every NAN feature, every transaction, every setting, and every piece of data in the user's account. You are NOT a generic chatbot — you are the user's personal financial AI with real-time access to their entire NAN state.

${opts.walletBlock}
${opts.activityBlock}
${opts.recurringBlock}
${opts.paymentRequestBlock}
${opts.invoiceBlock}
${opts.agentStateBlock}
${opts.liveDataBlock}
${opts.marketplaceBlock}

---

## CRITICAL: ACTION SYSTEM

When the user wants something DONE (not just explained), emit EXACTLY ONE action block at the END of your reply:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

### ALL AVAILABLE ACTIONS:

**── SENDING & PAYMENTS ──**

Send USDC from main wallet (wagmi/browser wallet):
{"action":"send_usdc","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

Send USDC from Circle UCW (email/Google login users):
{"action":"ucw_send","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

Send USDC from Agent Wallet:
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

**── BRIDGE ──**

Bridge via App Kit (opens Bridge tab, wagmi users):
{"action":"bridge_start","params":{"amount":"<string>","toChain":"<chain name>"}}

Bridge directly from Circle UCW (email/Google users, no tab switch):
{"action":"ucw_bridge","params":{"amount":"<string>","toChain":"<chain name e.g. Base Sepolia>"}}

**── SWAP ──**

Swap tokens inline (shows quote card in chat):
{"action":"swap_start","params":{"fromToken":"USDC","toToken":"<token>","amount":"<string>"}}

Swap from Circle UCW directly:
{"action":"ucw_swap","params":{"fromToken":"USDC","toToken":"<token>","amount":"<string>"}}

**── GATEWAY ──**

Deposit into Gateway (Circle UCW users):
{"action":"ucw_gateway_deposit","params":{"amount":"<string>"}}

Transfer via Gateway (Circle UCW users, cross-chain):
{"action":"ucw_gateway_transfer","params":{"amount":"<string>","toChain":"<chain name>"}}

Gateway deposit for wagmi users (opens Gateway tab):
{"action":"navigate","params":{"page":"gateway"}}

**── RECURRING PAYMENTS ──**

Add recurring from main wallet:
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<string>","frequency":"manual|daily|weekly|monthly"}}

Add recurring from Agent Wallet:
{"action":"add_agent_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<string>","frequency":"manual|daily|weekly|monthly"}}

Cancel a recurring payment by name:
{"action":"cancel_recurring","params":{"name":"<exact name from recurringTasks>"}}

**── PAYMENT REQUESTS ──**

Create a payment request (generates a shareable link):
{"action":"create_payment_request","params":{"title":"<string>","amount":"<number>","note":"<optional>","dueDate":"<optional YYYY-MM-DD>"}}

**── INVOICES ──**

Create an invoice:
{"action":"create_invoice","params":{"customerName":"<string>","amount":"<number>","description":"<string>","dueDate":"<YYYY-MM-DD>"}}

**── AGENT POLICY ──**

Update spending policy:
{"action":"set_policy","params":{"dailyLimit":<n>,"perTxLimit":<n>,"perServiceLimit":<n>,"autoApproveUnder":<n>,"requireApprovalAbove":<n>,"enabled":true|false}}

Toggle NAN Agent on/off:
{"action":"toggle_agent","params":{"enabled":true|false}}

**── NAVIGATION ──**

Navigate to any page:
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support|payment-requests|exports|about|faq|onramp"}}

**── ONRAMP ──**

Open the Circle onramp (buy USDC with card/bank):
{"action":"navigate","params":{"page":"onramp"}}

---

## ROUTING RULES — CRITICAL

**Circle UCW users** (logged in with Email OTP or Google): use ucw_send, ucw_bridge, ucw_swap, ucw_gateway_deposit, ucw_gateway_transfer.
**Wagmi users** (MetaMask/WalletConnect): use send_usdc, bridge_start, swap_start, navigate to gateway.
**Passkey users**: use agent_send from Agent Wallet. For bridge/swap, navigate to the tab.
**Agent Wallet**: use agent_send for agent wallet sends. Agent Wallet is a separate Circle UCW wallet.

To determine user type: look at mainAddress. If it starts "0x" and auth type is wagmi, they're wagmi. If you see agentBalance / agentWalletProvisioned=true they have an Agent Wallet too.

---

## NAN COMPLETE FEATURE MAP

**AUTHENTICATION**
- Email OTP login → Circle User-Controlled Wallet (UCW) on Arc Testnet
- Google OAuth login → Circle UCW
- MetaMask / WalletConnect → Wagmi EOA wallet
- Passkey (WebAuthn) → Circle Modular Wallet (ERC-4337 SCA)
- Arc Testnet: USDC is the native gas token — fees are fractions of a cent

**WALLET & PAYMENTS**
- View balance (main wallet + cross-chain)
- Send / Receive USDC on Arc Testnet
- Request payment (generates link with QR code)
- Activity history with explorer links
- Faucet: get free testnet USDC
- Circle Onramp: buy USDC with card/Apple Pay/bank transfer

**DEFI**
- Bridge: USDC via Circle CCTP V2 — Arc ↔ Ethereum ↔ Base ↔ Arbitrum ↔ Avalanche ↔ OP ↔ Polygon ↔ Unichain (~10 seconds)
- Swap: via Circle App Kit — USDC, EURC, and other ERC-20s on Arc Testnet
- Gateway: Circle Gateway — unified cross-chain USDC balance, instant transfers (<500ms) between chains

**ESCROW**
- PaywellEscrow contract deployed on Arc Testnet
- Allows creating escrow agreements between two parties using USDC

**AGENT STACK**
- Agent Wallet: separate Circle UCW wallet for autonomous agent operations
- Agent Policy: daily limit, per-tx limit, per-service limit, auto-approve threshold, require-approval toggle
- Recurring Payments: daily/weekly/monthly USDC transfers (main or agent wallet)
- Agent Network: multi-agent task decomposition and assignment
- Circle Agent Marketplace: discover and pay for AI/data services with USDC (x402 nanopayments)
- Execution Log: full history of agent actions and costs

**INVOICING & EXPORTS**
- Create, send, and track invoices in USDC
- Export statements as HTML (current period / custom range)
- Payment request links with QR codes

**CONNECTED SERVICES (via x402 nanopayments)**
- Brave Search / Serper: web search (free tier)
- CoinGecko: live crypto prices (free)
- ExchangeRate-API: live forex rates
- Skyscanner: flight search
- Amadeus: hotel search
- GitHub Search: code/repo search
- Perplexity AI: deep research ($0.002 USDC)
- OpenAI GPT-4o: AI tasks ($0.001 USDC)
- Any service listed on Circle Agent Marketplace

**COMMUNITY**
- Suggestions board: post and vote on product ideas
- Support tickets: submit and track support requests
- Feedback: rate and review the platform
- Notifications: payment alerts, support replies, system updates

---

## HOW TO RESPOND

- ALWAYS answer directly using the LIVE STATE above. Never say "check your wallet" if you can see the balance.
- For "what's my balance" → state it directly from LIVE WALLET STATE.
- For "show my activity" → describe the recent transactions from RECENT ACTIVITY.
- For "show recurring payments" → list them from RECURRING TASKS.
- For "what did I spend today" → calculate from RECENT ACTIVITY (today's transactions).
- For live market data → use the LIVE DATA block.
- For transactions → pick the right action based on user type (UCW vs wagmi vs passkey).
- Never fabricate addresses, transaction hashes, balances, or prices.
- Never say "I'm just a chatbot" or "I can't help with that" — you CAN help with everything on NAN.
- Be concise, warm, and precise. Lead with the answer, provide context after.
- When emitting an action, write 1-2 sentences describing what you're doing BEFORE the block.
- Never emit more than one action block per reply.
- Never emit an action if a required param (like address) is missing — ask for it first.
- For amounts: always show 2 decimal places (e.g. "139.17 USDC" not "139.174503 USDC").`
}

// ── main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body as {
    message?: string
    messages?: { role: string; content: string }[]
    history?: { role: string; content: string }[]
    usdcBal?: string
    userAddress?: string
    context?: ChatContext
  }

  // Accept either messages[] or message + history[]
  let message: string
  let history: { role: string; content: string }[]
  if (body.messages && body.messages.length > 0) {
    const msgs = body.messages
    message = msgs[msgs.length - 1]?.content ?? ''
    history = msgs.slice(0, -1)
  } else {
    message = body.message ?? ''
    history = body.history ?? []
  }
  if (!message) return res.status(400).json({ error: 'message required' })

  const ctx = body.context ?? {}
  const host = req.headers.host ?? 'localhost:3001'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  // ── optional x402 payment gate ────────────────────────────────────────────
  const sellerAddr = process.env.SELLER_ADDRESS ?? process.env.VITE_X402_SELLER_ADDRESS
  if (sellerAddr) {
    const paymentHeader = req.headers['x-payment'] as string | undefined
    if (!paymentHeader) {
      return res.status(402).json({
        error: 'Payment required',
        x402: {
          amount: '0.001',
          currency: 'USDC',
          recipient: sellerAddr,
          network: 'arc-testnet',
          description: 'NAN AI Agent — per message',
        },
      })
    }
  }

  // ── marketplace discovery ─────────────────────────────────────────────────
  const marketplaceQuery = detectMarketplaceIntent(message)
  let marketplaceServices: MarketplaceServiceCard[] = []
  if (marketplaceQuery) {
    marketplaceServices = await fetchMarketplace(
      marketplaceQuery === 'general' ? 'services' : marketplaceQuery,
      baseUrl
    )
  }

  // ── live service call ─────────────────────────────────────────────────────
  let liveServiceResult: string | null = null
  let liveServiceId: string | null = null
  if (!marketplaceQuery) {
    const intent = classifyToService(message)
    if (intent) {
      liveServiceResult = await callExecute(intent.service_id, intent.query, baseUrl)
      liveServiceId = intent.service_id
    }
  }

  // ── prompt blocks ─────────────────────────────────────────────────────────

  // Wallet block
  const crossChainLines = ctx.crossChainBalances
    ? Object.entries(ctx.crossChainBalances).map(([chain, bal]) => `  - ${chain}: ${parseFloat(bal).toFixed(2)} USDC`).join('\n')
    : ''
  const walletBlock = `
## LIVE WALLET STATE (real-time, injected at request time)
- User: ${ctx.displayName ? `**${ctx.displayName}**` : '(no display name set)'}
- Main wallet: **${parseFloat(ctx.mainBalance ?? body.usdcBal ?? '0').toFixed(2)} USDC** on Arc Testnet
  Address: ${ctx.mainAddress ?? body.userAddress ?? 'not connected'}
- Agent Wallet: **${parseFloat(ctx.agentBalance ?? '0').toFixed(2)} USDC** (${ctx.agentWalletProvisioned ? 'provisioned' : 'NOT set up'})
  ${ctx.agentAddress ? `Address: ${ctx.agentAddress}` : '(no address — not provisioned)'}
  ${ctx.agentWalletBlockchain ? `Blockchain: ${ctx.agentWalletBlockchain} · AccountType: ${ctx.agentWalletAccountType ?? 'SCA'}` : ''}
- Agent enabled: ${ctx.agentEnabled !== false ? 'YES' : 'NO'}
- Daily limit: ${ctx.dailyLimit ?? 'not set'} USDC · Used today: ${(ctx.agentDailyUsed ?? 0).toFixed(2)} USDC · Remaining: ${ctx.remainingToday !== undefined ? ctx.remainingToday.toFixed(2) : 'unknown'} USDC
- Per-tx limit: ${ctx.perTxLimit ?? 'not set'} USDC · Per-service limit: ${ctx.perServiceLimit ?? 'not set'} USDC
- Require approval above: ${ctx.requireApprovalAbove ?? 'not set'} USDC · Auto-approve under: ${ctx.autoApproveUnder ?? 'not set'} USDC
- Unread notifications: ${ctx.unreadNotifications ?? 0}
${crossChainLines ? `- Cross-chain balances:\n${crossChainLines}\n- Total cross-chain: ${ctx.totalCrossChainBalance ?? '0.00'} USDC` : '- No cross-chain balances yet'}
`

  // Activity block
  const activityBlock = ctx.recentActivity && ctx.recentActivity.length > 0
    ? `\n## RECENT ACTIVITY (last ${ctx.recentActivity.length} transactions)\n${
        ctx.recentActivity.map((a, i) =>
          `${i + 1}. ${a.sign}${a.amount.toFixed(2)} USDC · ${a.type} · ${a.description}${a.counterparty ? ` · to/from ${a.counterparty}` : ''} · ${a.status} · ${new Date(a.timestamp).toLocaleDateString()}`
        ).join('\n')
      }`
    : '\n## RECENT ACTIVITY\nNo transactions yet.'

  // Recurring block
  const recurringBlock = ctx.recurringTasks && ctx.recurringTasks.length > 0
    ? `\n## RECURRING PAYMENTS (${ctx.recurringTasks.length} total)\n${
        ctx.recurringTasks.map((t, i) =>
          `${i + 1}. "${t.name}" · ${t.amount} USDC ${t.frequency} → ${t.recipient.slice(0,10)}… · ${t.active ? 'active' : 'paused'} · runs: ${t.runCount}${t.nextRunAt ? ` · next: ${new Date(t.nextRunAt).toLocaleDateString()}` : ''}`
        ).join('\n')
      }`
    : '\n## RECURRING PAYMENTS\nNo recurring payments set up.'

  // Payment requests block
  const paymentRequestBlock = ctx.openPaymentRequests && ctx.openPaymentRequests.length > 0
    ? `\n## OPEN PAYMENT REQUESTS (${ctx.openPaymentRequests.length})\n${
        ctx.openPaymentRequests.map((p, i) =>
          `${i + 1}. ${p.refNumber} · "${p.title}" · ${p.amount} USDC · ${p.status}${p.dueDate ? ` · due ${p.dueDate}` : ''}`
        ).join('\n')
      }`
    : '\n## PAYMENT REQUESTS\nNo open payment requests.'

  // Invoice block
  const invoiceBlock = ctx.recentInvoices && ctx.recentInvoices.length > 0
    ? `\n## RECENT INVOICES (${ctx.recentInvoices.length})\n${
        ctx.recentInvoices.map((inv, i) =>
          `${i + 1}. ${inv.number} · ${inv.customerName} · ${inv.total} USDC total · ${inv.amountDue.toFixed(2)} due · ${inv.status} · due ${inv.dueDate}`
        ).join('\n')
      }`
    : '\n## INVOICES\nNo invoices yet.'

  // Agent state block
  const agentStateBlock = ctx.recentAgentActions && ctx.recentAgentActions.length > 0
    ? `\n## RECENT AGENT ACTIONS (last ${ctx.recentAgentActions.length})\n${
        ctx.recentAgentActions.map((a, i) =>
          `${i + 1}. "${a.userRequest}"${a.serviceName ? ` → ${a.serviceName}` : ''} · ${a.status} · cost: ${a.cost} USDC · ${new Date(a.timestamp).toLocaleDateString()}`
        ).join('\n')
      }`
    : ''

  const liveDataBlock = liveServiceResult
    ? `\n\n---\n## LIVE DATA FROM ${liveServiceId?.toUpperCase()} (retrieved just now)\n\n${liveServiceResult}\n\n---\n\nUse the data above directly in your response. Do NOT say you cannot access live data.`
    : ''

  const marketplaceBlock = marketplaceServices.length > 0
    ? `\n\n---\n## CIRCLE AGENT MARKETPLACE RESULTS (${marketplaceServices.length} services)\n\n${
        marketplaceServices.slice(0, 6).map((s, i) =>
          `${i + 1}. **${s.provider}** (${s.category_label})\n   ${s.description}\n   Pricing: ${s.pricing} | Payment: ${s.payment_scheme.toUpperCase()} | ${s.endpoint}`
        ).join('\n\n')
      }\n\n---\n\nReference these services by name. Do NOT fabricate additional services or pricing.`
    : marketplaceQuery
      ? `\n\n---\n## CIRCLE AGENT MARKETPLACE: no results for "${marketplaceQuery}"\n---\n\nTell the user honestly: no matching service was found.`
      : ''

  const systemPrompt = buildSystemPrompt({
    walletBlock, liveDataBlock, marketplaceBlock,
    activityBlock, recurringBlock, paymentRequestBlock, invoiceBlock, agentStateBlock,
  })

  // ── OpenAI ────────────────────────────────────────────────────────────────
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
            ...history as { role: 'user' | 'assistant'; content: string }[],
            { role: 'user', content: message },
          ],
          max_tokens: 800,
        }),
      })
      const d = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
      if (d.error) throw new Error(d.error.message)
      const raw = d.choices?.[0]?.message?.content ?? 'Sorry, try again.'
      const { text, action } = extractAction(raw)
      return res.status(200).json({ reply: text, action, service_used: liveServiceId, marketplace_services: marketplaceServices.length > 0 ? marketplaceServices : undefined })
    } catch (e) {
      console.error('OpenAI error:', e)
    }
  }

  // ── static fallback ───────────────────────────────────────────────────────
  const m = message.toLowerCase()
  let reply = "I'm NAN Agent — your financial assistant. I can check your balances, send USDC, bridge, swap, set up recurring payments, manage invoices, and discover services. What would you like to do?"
  if (m.includes('balance'))                        reply = `Your main wallet has ${parseFloat(ctx.mainBalance ?? '0').toFixed(2)} USDC${ctx.agentBalance ? ` and your Agent Wallet has ${parseFloat(ctx.agentBalance).toFixed(2)} USDC` : ''}.`
  else if (m.includes('send') || m.includes('transfer')) reply = 'Tap Wallet → Send, enter the recipient address and amount, then confirm.'
  else if (m.includes('bridge'))                    reply = 'Use Bridge (sidebar) to move USDC across chains via Circle CCTP V2. Takes ~10 seconds.'
  else if (m.includes('swap'))                      reply = 'Use Swap (sidebar) to exchange tokens via Circle App Kit.'
  else if (m.includes('gateway'))                   reply = 'Use Gateway (sidebar) to deposit USDC into your unified cross-chain balance.'
  else if (m.includes('fee') || m.includes('gas'))  reply = 'On Arc, USDC is the gas token — fees are tiny fractions of a USDC.'
  else if (m.includes('agent wallet'))              reply = 'Open Agent Wallet (sidebar ⋮ menu) to create your Circle user-controlled wallet on Arc Testnet.'
  else if (m.includes('recurring'))                 reply = 'Open Recurring (sidebar) to set up daily/weekly/monthly USDC payments.'
  else if (m.includes('invoice'))                   reply = 'Open Exports (sidebar) to create and manage USDC invoices.'

  return res.status(200).json({ reply })
}
