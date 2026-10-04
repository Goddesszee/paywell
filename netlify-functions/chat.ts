/**
 * /api/chat — NAN Agent AI chat (Netlify function).
 *
 * Full NAN Agent: knows the app, the agent wallet, spending policy,
 * recurring payments, bridge, swap, services, and can emit structured
 * action blocks the frontend executes.
 *
 * Optional x402 gate: if SELLER_ADDRESS is set, requires payment header.
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import Groq from 'groq-sdk'

const PRICE_USDC  = '0.001'
const CHAIN       = 'ARC-TESTNET'
const SELLER_ADDR = process.env.SELLER_ADDRESS ?? ''

function cors(body: string, statusCode: number, extra?: Record<string, string>) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-402-Payment, X-Payment-Response',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...extra,
    },
    body,
  }
}

function buildSystemPrompt(liveContext?: {
  agentBalance?: string
  agentAddress?: string
  dailyLimit?: number
  perTxLimit?: number
  remainingToday?: number
}): string {
  const ctx = liveContext ?? {}
  const agentBalanceLine = ctx.agentBalance !== undefined
    ? `\nAgent Wallet Balance: ${ctx.agentBalance} USDC`
    : ''
  const agentAddressLine = ctx.agentAddress
    ? `\nAgent Wallet Address: ${ctx.agentAddress}`
    : ''
  const policyLine = ctx.dailyLimit !== undefined
    ? `\nAgent Policy: daily limit ${ctx.dailyLimit} USDC, per-tx limit ${ctx.perTxLimit ?? '?'} USDC, remaining today: ${ctx.remainingToday ?? '?'} USDC`
    : ''

  return `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous financial platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.${agentBalanceLine}${agentAddressLine}${policyLine}

## ABOUT NAN

NAN is a mobile-first USDC payments app built on Arc Testnet. It includes:

**Main app features:**
- Home: USDC balance, quick send, recent activity
- Wallet: send/receive USDC, transaction history, connected wallet
- Bridge: CCTP cross-chain USDC bridge (Arc ↔ Base/Ethereum/Polygon/etc)
- Swap: token swaps via Circle/LiFi
- Gateway: Circle Gateway unified cross-chain balance
- Shop: USDC marketplace — buy/sell products with USDC escrow
- Recurring: scheduled automatic USDC payments (daily/weekly/monthly)
- Activity: full transaction history
- Onramp: buy USDC with card/bank
- Notifications: alerts, payment updates
- Profile: user settings, display name
- Settings: app preferences, theme

**Agent Wallet (Circle Agent Stack):**
- A Circle developer-controlled USDC wallet separate from the user's main wallet
- Used for autonomous agent payments to paid services
- Tabs: Overview, Recurring (agent-wallet recurring pay), Bridge, Swap, Services
- Services tab: live Circle Agent Marketplace service discovery
- Spending policy: daily limit, per-tx limit, per-service limit (NAN-enforced)
- Circle policy (mainnet only): per-tx, daily, weekly, monthly limits via Circle CLI

**Services the agent can call:**
- Web research (Brave/Serper/Perplexity) — real-time web search
- Financial data (CoinGecko) — crypto prices
- FX rates (ExchangeRate-API) — currency conversion
- Travel (Skyscanner/Amadeus) — flights, hotels
- Code/GitHub tools
- AI tasks (OpenAI)

## CRITICAL: ACTION SYSTEM

When the user asks you to DO something (not just explain it), emit a nan-action block at the very END of your reply:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

Available actions:

**RECURRING PAYMENT (main wallet):**
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x address>","amount":"<number string>","frequency":"manual|daily|weekly|monthly"}}

**AGENT WALLET RECURRING (from agent wallet):**
{"action":"add_agent_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<number string>","frequency":"manual|daily|weekly|monthly"}}

**UPDATE NAN SPENDING POLICY:**
{"action":"set_policy","params":{"dailyLimit":<number>,"perTxLimit":<number>,"perServiceLimit":<number>,"autoApproveUnder":<number>,"requireApprovalAbove":<number>}}
Only include keys the user mentioned.

**SEND USDC FROM AGENT WALLET:**
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<number string>","note":"<optional>"}}

**NAVIGATE:**
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support|onramp|notifications"}}

**ENABLE/DISABLE AGENT:**
{"action":"toggle_agent","params":{"enabled":true|false}}

**SEARCH SHOP:**
{"action":"shop_search","params":{"query":"<search term>"}}

**BRIDGE INFO:**
{"action":"bridge_info","params":{"fromChain":"<chain>","toChain":"<chain>","amount":"<number string>"}}

## WALLET BALANCE

You have the user's live agent wallet data above. When asked about balance, use it directly. For the main wallet balance you don't have live data — tell the user to check the Wallet tab or Home screen for their live USDC balance.

## RULES

- Never invent wallet balances you don't have
- Never claim to execute transactions without emitting an action block
- Be honest about testnet vs mainnet limitations
- Keep responses concise and mobile-friendly
- When the user asks to set a spending limit, confirm what they want then emit set_policy
- When navigating, also briefly explain what's on that page`
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return cors('', 204)
  if (event.httpMethod !== 'POST')    return cors(JSON.stringify({ error: 'Method not allowed' }), 405)

  const paymentHeader = event.headers['x-402-payment'] ?? event.headers['x-payment-response']

  // Optional x402 gate
  if (SELLER_ADDR && !paymentHeader) {
    const paymentRequired = {
      version:  '1',
      scheme:   'exact',
      network:  CHAIN,
      maxAmountRequired: PRICE_USDC,
      resource: `${event.headers['x-forwarded-proto'] ?? 'https'}://${event.headers['host']}/api/chat`,
      description: 'NAN Agent — pay per message',
      mimeType: 'application/json',
      payTo:    SELLER_ADDR,
      maxTimeoutSeconds: 300,
      asset: 'USDC',
      outputSchema: null,
      extra: { name: 'NAN Agent', version: '2.0' },
    }
    return cors(JSON.stringify({ x402: true, paymentRequired }), 402, {
      'X-Accepts-Payment': 'x402',
      'X-Payment-Amount':  PRICE_USDC,
      'X-Payment-Chain':   CHAIN,
    })
  }

  // Parse request body
  let message = 'Hello'
  let history: Array<{ role: string; content: string }> = []
  let liveContext: Parameters<typeof buildSystemPrompt>[0] = {}

  try {
    const body = JSON.parse(event.body ?? '{}') as {
      message?: string
      messages?: Array<{ role: string; content: string }>
      history?: Array<{ role: string; content: string }>
      context?: typeof liveContext
    }
    message = body.message ?? body.messages?.at(-1)?.content ?? 'Hello'
    history = body.history ?? body.messages?.slice(0, -1) ?? []
    liveContext = body.context ?? {}
  } catch { /* ignore */ }

  const systemPrompt = buildSystemPrompt(liveContext)

  // Strip nan-action blocks from visible reply
  function stripAction(text: string): { reply: string; action: unknown } {
    const match = text.match(/```nan-action\s*([\s\S]*?)```/)
    if (!match) return { reply: text.trim(), action: null }
    try {
      const action = JSON.parse(match[1].trim()) as unknown
      const reply = text.replace(/```nan-action[\s\S]*?```/, '').trim()
      return { reply, action }
    } catch {
      return { reply: text.trim(), action: null }
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: message },
      ]
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 800,
      })
      const raw = completion.choices[0]?.message?.content ?? "I'm here to help with NAN!"
      const { reply, action } = stripAction(raw)
      return cors(JSON.stringify({ reply, action, paid: !!paymentHeader }), 200)
    } catch (err) {
      console.error('Groq error:', err)
    }
  }

  // Fallback (no API key)
  const lower = message.toLowerCase()
  let reply = "I'm your NAN Agent. I can help you send USDC, set up recurring payments, manage your agent wallet, bridge to other chains, and much more. What would you like to do?"
  if (lower.includes('balance'))       reply = "Your agent wallet balance is shown in the Agent Wallet tab. For your main wallet balance, check the Home or Wallet tab."
  else if (lower.includes('recurring')) reply = "You can set up recurring USDC payments in the Recurring tab. Tell me the recipient address, amount, and frequency (daily/weekly/monthly) and I'll set it up!"
  else if (lower.includes('bridge'))   reply = "The Bridge tab lets you move USDC across chains using Circle CCTP. It takes under 20 seconds and costs a small gas fee."
  else if (lower.includes('service'))  reply = "In the Agent Wallet → Services tab you can browse and select services from the Circle Agent Marketplace — web research, data, AI tools, and more."
  else if (lower.includes('limit') || lower.includes('policy')) reply = "I can update your NAN spending limits. Tell me the daily limit or per-transaction limit you want and I'll configure it."
  else if (lower.includes('send'))     reply = "To send USDC: go to Wallet → Send, enter the recipient address and amount. Or tell me the details and I'll set up the transfer."

  return cors(JSON.stringify({ reply, action: null, paid: !!paymentHeader }), 200)
}

export { handler }
