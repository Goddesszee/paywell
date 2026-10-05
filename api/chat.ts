import type { VercelRequest, VercelResponse } from '@vercel/node'
import Groq from 'groq-sdk'

// ── Action block parser ────────────────────────────────────────────────────────
// Extracts a ```nan-action {...}``` block from LLM reply text.
// Returns { text: visibleText, action: parsedAction | null }
function extractAction(raw: string): { text: string; action: Record<string, unknown> | null } {
  const match = raw.match(/```nan-action\s*\n([\s\S]*?)\n```/)
  if (!match) return { text: raw.trim(), action: null }
  const jsonStr = match[1].trim()
  const text = raw.replace(/```nan-action[\s\S]*?```/, '').trim()
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    return { text, action: parsed }
  } catch {
    return { text, action: null }
  }
}

// ── Marketplace intent detection ──────────────────────────────────────────────
function detectMarketplaceIntent(message: string): string | null {
  const m = message.toLowerCase()
  // Explicit discovery phrases
  if (/find (me )?(a |an |some )?service|search (for )?service|what services|which services|services.*agent (can |use|do)|show.*services|browse services|discover services|list.*services|available services/.test(m)) {
    // Extract the meaningful query part after "find a service that..."
    const afterThat = m.match(/service[s]?\s+(that\s+)?(can\s+)?(.+)/)
    if (afterThat?.[3]) return afterThat[3].replace(/\?/g, '').trim()
    // "find me a web research service" → "web research"
    const beforeService = m.match(/find\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?(.+?)\s+service/)
    if (beforeService?.[1] && beforeService[1] !== 'a' && beforeService[1] !== 'an') return beforeService[1].trim()
    return 'general'
  }
  // "find a service for X" or "find something that can X"
  if (/find\s+(?:a\s+)?(?:service|something|tool|api)\s+(?:for|that|to)\s+(.+)/.test(m)) {
    const match = m.match(/find\s+(?:a\s+)?(?:service|something|tool|api)\s+(?:for|that|to)\s+(.+)/)
    return match?.[1]?.replace(/\?/g, '').trim() ?? 'general'
  }
  // "I need a data enrichment service" / "I need help with web research"
  if (/(?:i need|looking for|help with|want)\s+(?:a\s+|an\s+)?(.+?)\s+service/.test(m)) {
    const match = m.match(/(?:i need|looking for|help with|want)\s+(?:a\s+|an\s+)?(.+?)\s+service/)
    return match?.[1]?.trim() ?? 'general'
  }
  // "compare services" / "compare these services"
  if (/compare\s+(?:these\s+)?services/.test(m)) return 'general'
  // "best research service" / "best suitable service for X"
  if (/best\s+(?:suitable\s+)?(?:\w+\s+)?service\s+(?:for\s+)?(.*)/.test(m)) {
    const match = m.match(/best\s+(?:suitable\s+)?(?:(\w+)\s+)?service/)
    return match?.[1] ?? 'general'
  }
  return null
}

async function fetchMarketplaceServices(query: string, baseUrl: string): Promise<import('./agent-wallet').MarketplaceServiceCard[]> {
  try {
    const r = await fetch(`${baseUrl}/api/agent-wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marketplace-search', query }),
      signal: AbortSignal.timeout(18000),
    })
    if (!r.ok) return []
    const d = await r.json() as { ok?: boolean; services?: import('./agent-wallet').MarketplaceServiceCard[] }
    return d.services ?? []
  } catch { return [] }
}

// ── Intent classifier (mirrors src/lib/agent-orchestrator.ts) ─────────────────
type ServiceIntent = { service_id: string; query: string } | null

function classifyToService(message: string): ServiceIntent {
  const lower = message.toLowerCase()
  // Crypto prices
  if (/bitcoin|ethereum|btc|eth|solana|bnb|crypto price|coin price|token price|market cap|dogecoin|ripple|xrp/.test(lower))
    return { service_id: 'coingecko-prices', query: message }
  // Forex / currency exchange
  if (/exchange rate|usd to|dollar to|naira|ngn|gbp|forex|convert.*currency|currency.*convert|how much is.*in/.test(lower))
    return { service_id: 'exchangerate-fx', query: message }
  // Flights
  if (/flight|cheapest flight|fly from|fly to|book.*flight|airline|ticket to|travel to.*by plane/.test(lower))
    return { service_id: 'skyscanner-flights', query: message }
  // Hotels
  if (/hotel|accommodation|where to stay|hostel|airbnb|book.*hotel|place to stay/.test(lower))
    return { service_id: 'amadeus-hotels', query: message }
  // GitHub / code search
  if (/github|open source|repository|npm package|library for|code for|find.*package|find.*library/.test(lower))
    return { service_id: 'github-code-search', query: message }
  // Deep research
  if (/research|analyze|deep dive|comprehensive overview|explain in detail|compare.*options|summarize.*topic/.test(lower))
    return { service_id: 'perplexity-research', query: message }
  // Suppliers
  if (/supplier|manufacturer|wholesale|factory|alibaba|bulk buy|product sourcing/.test(lower))
    return { service_id: 'alibaba-suppliers', query: message }
  // Web search — catch-all for factual lookups
  if (/search for|look up|what is the latest|current news|who is|where is|find information|tell me about|news about/.test(lower)) {
    if (process.env.SERPER_API_KEY) return { service_id: 'serper-search', query: message }
    if (process.env.BRAVE_SEARCH_API_KEY) return { service_id: 'brave-search', query: message }
  }
  return null
}

async function callAgentExecute(service_id: string, query: string, baseUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`${baseUrl}/api/agent-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id, query }),
    })
    if (!r.ok) return null
    const d = await r.json() as { result?: string; error?: string }
    return d.result ?? null
  } catch { return null }
}

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
  const ctx = body.context ?? {}
  // Accept either a full `messages` array or a `message` + optional `history`
  let history: { role: string; content: string }[] = []
  let message: string
  if (body.messages && body.messages.length > 0) {
    const msgs = body.messages
    message = msgs[msgs.length - 1]?.content ?? ''
    history = msgs.slice(0, -1)
  } else {
    message = body.message ?? ''
    history = body.history ?? []
  }
  if (!message) return res.status(400).json({ error: 'message required' })

  const host = req.headers.host ?? 'localhost:3001'
  const proto = host.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${proto}://${host}`

  // ── Marketplace discovery intent ──────────────────────────────────────────────
  // Check BEFORE live service calls — marketplace queries don't need agent execution
  const marketplaceQuery = detectMarketplaceIntent(message)
  let marketplaceServices: import('./agent-wallet').MarketplaceServiceCard[] = []
  if (marketplaceQuery) {
    const q = marketplaceQuery === 'general' ? 'services' : marketplaceQuery
    marketplaceServices = await fetchMarketplaceServices(q, baseUrl)
  }

  // ── Live service call ─────────────────────────────────────────────────────────
  // Classify intent and call the real external service if applicable.
  // The result is injected into the system prompt so the LLM synthesises it.
  let liveServiceResult: string | null = null
  let liveServiceId: string | null = null
  // Skip service execution when this is a discovery request
  if (!marketplaceQuery) {
    const serviceIntent = classifyToService(message)
    if (serviceIntent) {
      liveServiceResult = await callAgentExecute(serviceIntent.service_id, serviceIntent.query, baseUrl)
      liveServiceId = serviceIntent.service_id
    }
  }

  // x402 gate — if SELLER_ADDRESS set, require payment header
  const sellerAddr = process.env.SELLER_ADDRESS
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
          description: 'Paywell AI Agent — per message',
        },
      })
    }
  }

  const liveDataBlock = liveServiceResult
    ? `\n\n---\n## LIVE DATA FROM ${liveServiceId?.toUpperCase()} (retrieved just now)\n\n${liveServiceResult}\n\n---\n\nThe data above is LIVE and was just fetched. Use it directly in your response — do NOT say you cannot access live data, because you clearly can. Format the results clearly for the user and add helpful context.`
    : ''

  // Marketplace results block — injected when service discovery was triggered
  const marketplaceBlock = marketplaceServices.length > 0
    ? `\n\n---\n## LIVE CIRCLE AGENT MARKETPLACE RESULTS (fetched just now — ${marketplaceServices.length} services found)\n\n${
        marketplaceServices.slice(0, 6).map((s, i) =>
          `${i + 1}. **${s.provider}** — ${s.category_label}\n   ${s.description}\n   Pricing: ${s.pricing} | Payment: ${s.payment_scheme.toUpperCase()} | Endpoint: ${s.endpoint}`
        ).join('\n\n')
      }\n\n---\n\nThe services above are REAL results from Circle Agent Marketplace. Reference them by name in your reply. Be friendly and helpful — say something like "I found X services" and briefly describe what each does. Do NOT fabricate additional services or pricing.`
    : marketplaceQuery
      ? `\n\n---\n## CIRCLE AGENT MARKETPLACE SEARCH: no results found for "${marketplaceQuery}"\n---\n\nTell the user honestly: "I searched Circle Agent Marketplace but couldn't find a matching service for that request." Do not invent services.`
      : ''

  // ── Live wallet context block ──────────────────────────────────────────────
  const mainBal  = ctx.mainBalance  ?? body.usdcBal ?? 'unknown'
  const mainAddr = ctx.mainAddress  ?? body.userAddress ?? 'not connected'
  const agentBal = ctx.agentBalance ?? 'unknown'
  const agentAddr = ctx.agentAddress ?? 'not set up'
  const walletBlock = `

## LIVE WALLET STATE (injected at request time — this is REAL data, not a guess)
- Your main wallet balance: **${mainBal} USDC** (address: ${mainAddr})
- Your Agent Wallet balance: **${agentBal} USDC** (address: ${agentAddr})
- Daily spending limit: ${ctx.dailyLimit ?? 'not set'} USDC
- Remaining today: ${ctx.remainingToday ?? 'unknown'} USDC
- Per-transaction limit: ${ctx.perTxLimit ?? 'not set'} USDC

IMPORTANT: When the user asks "what's my balance", "how much USDC do I have", or anything about their balance, always answer directly using the LIVE WALLET STATE above. Never say you don't have access to the balance.`

  const systemPrompt = `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous financial platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.${walletBlock}${liveDataBlock}${marketplaceBlock}

## CRITICAL: ACTION SYSTEM

When the user asks you to DO something (not just explain it), you MUST emit an action block in your reply using this exact format — place it at the very END of your message, after your text:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

Available actions and their exact param shapes:

**SEND USDC FROM MAIN WALLET (uses connected wallet + wagmi):**
{"action":"send_usdc","params":{"toAddress":"<0x>","amount":"<number string>","note":"<optional>"}}
Example trigger: "send 10 USDC to 0xABC", "transfer 5 USDC to my friend"

**SEND USDC FROM AGENT WALLET:**
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<number string>","note":"<optional description>"}}
Example trigger: "send 2 USDC from my agent wallet to 0xABC"

**BRIDGE USDC (opens Bridge tab pre-filled):**
{"action":"bridge_start","params":{"amount":"<number string>","toChain":"<chain name>"}}
Example trigger: "bridge 50 USDC to Base Sepolia", "bridge to Ethereum"

**SWAP TOKENS (executes inline in chat — do NOT say "opening Swap tab"):**
{"action":"swap_start","params":{"fromToken":"USDC","toToken":"<token>","amount":"<number string>"}}
Example trigger: "swap 10 USDC to EURC", "convert 5 USDC to ETH"
IMPORTANT: When you emit swap_start, tell the user "Sure, let me get you a quote." — the swap quote card will appear directly below your message. Never say "I'm opening the Swap tab" or "complete this in the Swap tab".

**RECURRING PAYMENT — add a new scheduled USDC payment:**
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x address>","amount":"<number string>","frequency":"manual|daily|weekly|monthly"}}
Example trigger: "set up a weekly payment of 5 USDC to 0xABC..."

**UPDATE POLICY LIMIT — change NAN agent spending limits:**
{"action":"set_policy","params":{"dailyLimit":<number>,"perTxLimit":<number>,"perServiceLimit":<number>,"autoApproveUnder":<number>,"requireApprovalAbove":<number>}}
Only include keys the user mentioned. Example trigger: "set my daily limit to 50 USDC"

**NAVIGATE TO PAGE:**
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support"}}
Example trigger: "take me to the bridge page" / "open my wallet"

**ENABLE / DISABLE AGENT:**
{"action":"toggle_agent","params":{"enabled":true}}

**SEARCH SHOP:**
{"action":"shop_search","params":{"query":"<search term>"}}
Example trigger: "find me a keyboard in the shop"

**ADD RECURRING FROM AGENT WALLET (uses agent wallet as source, not main wallet):**
{"action":"add_agent_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<number string>","frequency":"manual|daily|weekly|monthly"}}
Example trigger: "schedule a daily agent payment of 1 USDC to 0xABC"

**BRIDGE USDC (quote only — user confirms in Bridge tab):**
{"action":"bridge_info","params":{"fromChain":"<chain>","toChain":"<chain>","amount":"<number string>"}}
Example trigger: "bridge 10 USDC from Arc to Base"

RULES FOR ACTIONS:
- ONLY emit an action block when the user clearly wants you to PERFORM the action — not when they're asking how to do something.
- NEVER emit an action if a required param (like recipient address) is missing — instead ask the user for it.
- ALWAYS write clear, friendly explanatory text BEFORE the action block.
- NEVER emit more than one action block per reply.
- If the user's intent is ambiguous, ask a clarifying question instead of guessing.
- For recurring payments, if no recipient address is provided, ask for it.
- For policy changes, confirm the new value(s) in your text before emitting the action.

You have COMPLETE knowledge of the NAN app. Here is the full feature map you must know and use:

---

## WALLET & PAYMENTS
- Login: email OTP or Google — creates a Circle user-controlled USDC wallet on Arc Testnet
- Arc Testnet uses USDC as the native gas token (one asset, two views: native + ERC-20)
- Send USDC: Wallet tab → Send → recipient address + amount → confirm
- Receive: Wallet tab → Receive → share address/QR
- Request Payment: Payment Request tab — create a shareable payment link with amount + note
- Faucet page: claim free testnet USDC (once per address, limited)
- Buy tab: purchase real USDC via Circle Onramp (card/bank)
- Activity tab: full transaction history (sends, receives, swaps, bridges, purchases, agent actions)

## DEFI
- Bridge: USDC across Arc ↔ Ethereum ↔ Base ↔ Arbitrum via Circle CCTP V2, takes ~10 seconds
- Swap: exchange tokens via Circle App Kit (USDC and other ERC-20s)
- Gateway: unified cross-chain USDC balance — deposit once, spend across any chain

## MARKETPLACE / SHOP
NAN has a built-in USDC marketplace backed by the PaywellEscrow smart contract (funds held in escrow until delivery confirmed). Full product catalogue:
- Wireless Mechanical Keyboard $24 — TechFlow [tech]
- USB-C Hub 7-in-1 $18 — TechFlow [tech]
- Portable Laptop Stand $15 — DeskCraft [tech]
- Noise-Cancelling Headphones $45 — TechFlow [tech]
- Ergonomic Mouse $28 — TechFlow [tech]
- Monitor Light Bar $22 — DeskCraft [tech]
- Minimalist Desk Pad $16 — DeskCraft [home]
- Ceramic Pour-Over Set $32 — DeskCraft [home]
- Travel Backpack 25L $55 — WanderCo [fashion]
- Packing Cubes Set $18 — WanderCo [fashion]
- Merino Wool T-Shirt $34 — WanderCo [fashion]
- UI Component Library $12 — PixelShop [digital]
- Notion Finance Templates $8 — PixelShop [digital]
- Icon Pack Pro (2400 SVGs) $6 — PixelShop [digital]
Features: category browse, search, favourites, offers/negotiation, order tracking, disputes, refunds. Sellers submit listings via Sell form (admin-approved).

## AI AGENTS & AUTOMATION
- You are the NAN Agent — you can guide users through all features AND call external services
- Agent Policy (Policy tab): user sets daily limit (default $20/day), per-tx limit ($10), allowed categories, auto-approve under $1
- Recurring Payments: schedule daily/weekly/monthly USDC transfers to any address
- Execution Log (Log tab): shows history of all agent actions
- Discover tab: browse all registered external services
- Network tab: NAN's A2A agent network with real agents

## CONNECTED EXTERNAL SERVICES (via x402 micropayments)
NAN connects to real external services. When a user asks, tell them you're using these:
- Web search: Brave Search or Serper (Google) — free
- Flights: Skyscanner — free search, results need SKYSCANNER_API_KEY configured
- Hotels: Amadeus — free search, needs AMADEUS keys
- Deep research: Perplexity AI — $0.002 USDC per query
- Crypto prices: CoinGecko — free, no key needed, live data
- Forex rates: ExchangeRate-API — free with key
- Supplier search: Alibaba — free with key
- Code/repos: GitHub Search — free
- Other agents: Circle Agent Marketplace
- AI tasks: OpenAI GPT-4o — $0.001 USDC
When these services need API keys not yet configured, acknowledge that and give your best knowledge-based answer as a fallback.

## ACCOUNT & COMMUNITY
- Profile: display name, bio, avatar, notification prefs
- Settings: theme (dark/light), wallet settings
- Saved Items: bookmark products, FAQs, pages
- Support: submit tickets → admin replies → notifications
- Feedback: 1–5 star rating with category
- Suggestions: submit feature ideas, see status updates
- FAQ: searchable help articles
- Notifications: bell icon top-right — support replies, payment alerts, system updates
- Admin dashboard: tap NAN logo 5 times — approve listings, reply to support, manage feedback/suggestions

## RATES & CONTEXT (late 2026)
- 1 USDC = $1 USD (stablecoin)
- USD to NGN: approx 1,600–1,700 NGN (check xe.com for live)
- Arc Testnet USDC is test-only, no real-world value
- Gas on Arc costs USDC — fees are fractions of a cent

---

## HOW TO RESPOND

For NAN features: guide them to the exact tab/action. Be specific and direct.
For shop: quote actual product names + prices from the catalogue above. Suggest the best match.
For flights: say you're querying via NAN's Skyscanner integration, give knowledge-based price estimates (Lagos–Abuja ~$80–150, Lagos–London ~$500–900), and tell them to confirm on the Discover tab.
For hotels: say you're querying via NAN's Amadeus integration, give estimates.
For crypto prices: give knowledge-based estimate + say CoinGecko has live prices via NAN's data services.
For USD/NGN: give the estimate above directly.
For payments: walk them through the exact steps in NAN.
For anything else: answer from your knowledge, never refuse, never say "I don't have access to that."

RULES:
- NEVER output __EXECUTE__, __TOOL__, __ACTION__ or any internal token — those are never shown in chat.
- Never say "I'm just a chatbot" or "I can't help with that." You CAN help. Do it.
- Be concise and warm. Answer the question first, add helpful context after.
- If live data isn't available, give your best estimate and note where to verify.`

  if (process.env.OPENAI_API_KEY) {
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
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
      const openaiData = await openaiRes.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } }
      if (openaiData.error) throw new Error(openaiData.error.message)
      const rawReply = openaiData.choices?.[0]?.message?.content ?? 'Sorry, try again.'
      const { text: replyText, action: replyAction } = extractAction(rawReply)
      return res.status(200).json({
        reply: replyText,
        action: replyAction,
        service_used: liveServiceId,
        marketplace_services: marketplaceServices.length > 0 ? marketplaceServices : undefined,
      })
    } catch (e) {
      console.error('OpenAI error:', e)
    }
  }

  if (process.env.GROQ_API_KEY) {
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
    const rawGroq = completion.choices[0]?.message?.content ?? 'Sorry, try again.'
    const { text: groqText, action: groqAction } = extractAction(rawGroq)
    return res.status(200).json({
      reply: groqText,
      action: groqAction,
      service_used: liveServiceId,
      marketplace_services: marketplaceServices.length > 0 ? marketplaceServices : undefined,
    })
  }

  // Smart fallback
  const m = message.toLowerCase()
  let reply = "I'm your Paywell AI. I can help you send USDC, check your balance, shop, bridge tokens, or swap. What would you like to do?"
  if (m.includes('balance')) reply = "Open the Wallet tab to see your live USDC balance on Arc Testnet."
  else if (m.includes('send') || m.includes('transfer')) reply = "Tap Wallet → Send, enter the recipient address and amount, then confirm with your wallet."
  else if (m.includes('bridge')) reply = "Use the Bridge feature (hamburger menu) to move USDC across chains via Circle CCTP V2. Takes 8–20 seconds."
  else if (m.includes('swap')) reply = "Use Swap (hamburger menu) to exchange tokens via Circle AppKit."
  else if (m.includes('shop') || m.includes('buy')) reply = "Head to the Shop tab to browse products and pay with USDC directly from your wallet."
  else if (m.includes('fee') || m.includes('gas')) reply = "On Arc, USDC is the gas token — fees are tiny fractions of a USDC."

  return res.status(200).json({ reply })
}
