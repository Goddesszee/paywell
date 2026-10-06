/**
 * api/chat.ts — NAN AI Agent chat endpoint
 *
 * POST /api/chat
 * Body: { message, history?, messages?, context?, usdcBal?, userAddress? }
 *
 * LLM priority: OPENAI_API_KEY → GROQ_API_KEY → static fallback
 *
 * Features:
 *   - Live wallet context injected per request
 *   - Intent classification → calls agent-execute for live data
 *   - Circle Agent Marketplace discovery
 *   - Structured action blocks (nan-action) for the frontend to execute
 *   - x402 payment gate (optional, requires SELLER_ADDRESS env var)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Groq from 'groq-sdk'
import type { MarketplaceServiceCard } from './agent-wallet'

// ── action block parser ───────────────────────────────────────────────────────
// Extracts ```nan-action {...}``` from LLM reply text.
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

// ── system prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(opts: {
  walletBlock: string
  liveDataBlock: string
  marketplaceBlock: string
}): string {
  return `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous financial platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.${opts.walletBlock}${opts.liveDataBlock}${opts.marketplaceBlock}

## CRITICAL: ACTION SYSTEM

When the user asks you to DO something (not just explain it), emit an action block at the END of your message:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

Available actions:

**SEND USDC FROM MAIN WALLET:**
{"action":"send_usdc","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

**SEND USDC FROM AGENT WALLET:**
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<string>","note":"<optional>"}}

**BRIDGE USDC (opens Bridge tab pre-filled):**
{"action":"bridge_start","params":{"amount":"<string>","toChain":"<chain name>"}}

**SWAP TOKENS (inline quote — do NOT say "opening Swap tab"):**
{"action":"swap_start","params":{"fromToken":"USDC","toToken":"<token>","amount":"<string>"}}
When emitting swap_start, say "Sure, let me get you a quote." — the swap card appears below.

**RECURRING PAYMENT:**
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<string>","frequency":"manual|daily|weekly|monthly"}}

**UPDATE AGENT POLICY:**
{"action":"set_policy","params":{"dailyLimit":<n>,"perTxLimit":<n>,"perServiceLimit":<n>,"autoApproveUnder":<n>,"requireApprovalAbove":<n>}}

**NAVIGATE:**
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support"}}

**TOGGLE AGENT:**
{"action":"toggle_agent","params":{"enabled":true}}

RULES:
- Only emit an action when the user clearly wants it performed.
- Never emit an action if a required param is missing — ask for it instead.
- Never emit more than one action block per reply.
- Always write friendly explanatory text BEFORE the action block.

## NAN FEATURE MAP

**WALLET & PAYMENTS**
- Login: Email OTP, Google (Circle UCW), Wagmi (MetaMask/WalletConnect), Passkey (Circle Modular Wallet)
- Arc Testnet: USDC is the native gas token — fees are fractions of a cent
- Send / Receive / Request Payment / Faucet / Buy (Circle Onramp) / Activity history

**DEFI**
- Bridge: USDC via Circle CCTP V2 — Arc ↔ Ethereum ↔ Base ↔ Arbitrum ↔ + more (~10 seconds)
- Swap: via Circle App Kit — USDC, EURC, and other ERC-20s
- Gateway: unified cross-chain USDC balance

**AGENT STACK**
- Agent Wallet: user-controlled wallet on Arc Testnet (user retains custody, 2-of-2 MPC)
- Agent Policy: daily limit, per-tx limit, per-service limit, auto-approve threshold
- Recurring Payments: daily/weekly/monthly USDC transfers
- Circle Agent Marketplace: discover and pay for AI/data services with USDC (x402 nanopayments)
- Execution Log: full history of agent actions

**CONNECTED SERVICES (via x402 nanopayments)**
- Brave Search / Serper: web search (free)
- CoinGecko: live crypto prices (free)
- ExchangeRate-API: live forex rates (free with key)
- Skyscanner: flight search (free with key)
- Amadeus: hotel search (free with key)
- GitHub Search: code/repo search (free)
- Perplexity AI: deep research ($0.002 USDC)
- OpenAI GPT-4o: AI tasks ($0.001 USDC)
- Any service on Circle Agent Marketplace

**RATES (Oct 2026)**
- 1 USDC = $1 USD (stablecoin)
- USD/NGN: approx 1,600–1,700 NGN (check xe.com for live)
- Arc Testnet USDC is test-only, no real-world value

## HOW TO RESPOND
- For features: guide to the exact tab/action.
- For live data: use the LIVE DATA block above — never say you can't access live data.
- For balance: answer directly from LIVE WALLET STATE.
- Never say "I'm just a chatbot" or "I can't help with that."
- Be concise and warm. Answer first, context after.`
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
    context?: {
      mainBalance?: string
      mainAddress?: string
      agentBalance?: string
      agentAddress?: string
      dailyLimit?: number
      perTxLimit?: number
      remainingToday?: number
    }
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
  const walletBlock = `

## LIVE WALLET STATE (injected at request time — this is REAL data)
- Main wallet balance: **${ctx.mainBalance ?? body.usdcBal ?? 'unknown'} USDC** (${ctx.mainAddress ?? body.userAddress ?? 'not connected'})
- Agent Wallet balance: **${ctx.agentBalance ?? 'unknown'} USDC** (${ctx.agentAddress ?? 'not set up'})
- Daily spending limit: ${ctx.dailyLimit ?? 'not set'} USDC
- Remaining today: ${ctx.remainingToday ?? 'unknown'} USDC
- Per-transaction limit: ${ctx.perTxLimit ?? 'not set'} USDC

When asked about balance, always answer directly using the LIVE WALLET STATE above.`

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

  const systemPrompt = buildSystemPrompt({ walletBlock, liveDataBlock, marketplaceBlock })

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
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history as { role: 'user' | 'assistant'; content: string }[],
            { role: 'user', content: message },
          ],
          max_tokens: 512,
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

  // ── Groq ──────────────────────────────────────────────────────────────────
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history as { role: 'user' | 'assistant'; content: string }[],
          { role: 'user', content: message },
        ],
        max_tokens: 512,
      })
      const raw = completion.choices[0]?.message?.content ?? 'Sorry, try again.'
      const { text, action } = extractAction(raw)
      return res.status(200).json({ reply: text, action, service_used: liveServiceId, marketplace_services: marketplaceServices.length > 0 ? marketplaceServices : undefined })
    } catch (e) {
      console.error('Groq error:', e)
    }
  }

  // ── static fallback ───────────────────────────────────────────────────────
  const m = message.toLowerCase()
  let reply = "I'm NAN Agent — your financial assistant. I can help you send USDC, check your balance, swap, bridge, or discover services. What would you like to do?"
  if (m.includes('balance'))                    reply = 'Open the Wallet tab to see your live USDC balance on Arc Testnet.'
  else if (m.includes('send') || m.includes('transfer')) reply = 'Tap Wallet → Send, enter the recipient address and amount, then confirm.'
  else if (m.includes('bridge'))                 reply = 'Use Bridge (sidebar) to move USDC across chains via Circle CCTP V2. Takes ~10 seconds.'
  else if (m.includes('swap'))                   reply = 'Use Swap (sidebar) to exchange tokens via Circle App Kit.'
  else if (m.includes('shop') || m.includes('buy')) reply = 'Head to Shop to browse products and pay with USDC.'
  else if (m.includes('fee') || m.includes('gas'))  reply = 'On Arc, USDC is the gas token — fees are tiny fractions of a USDC.'
  else if (m.includes('agent wallet'))           reply = 'Open Agent Wallet (sidebar) to create your Circle user-controlled wallet on Arc Testnet.'

  return res.status(200).json({ reply })
}
