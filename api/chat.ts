import type { VercelRequest, VercelResponse } from '@vercel/node'

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
  }
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

  const systemPrompt = `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous financial platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.

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
      return res.status(200).json({ reply: openaiData.choices?.[0]?.message?.content ?? 'Sorry, try again.' })
    } catch (e) {
      console.error('OpenAI error:', e)
    }
  }

  if (process.env.GROQ_API_KEY) {
    const Groq = (await import('groq-sdk')).default
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
    return res.status(200).json({ reply: completion.choices[0]?.message?.content ?? 'Sorry, try again.' })
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
