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

  const systemPrompt = `You are NAN Agent — an autonomous AI financial agent built on Circle/Arc infrastructure. Today is ${new Date().toDateString()}.

## What you ARE and what you CAN DO

You are not a basic chatbot. You are a fully agentic financial assistant that can:

1. **USDC Wallet actions** — send USDC, check balances, view transaction history, request testnet USDC from the faucet
2. **DeFi** — bridge USDC across chains (Arc, Ethereum, Base, Arbitrum) via Circle CCTP in ~10 seconds; swap tokens via Circle App Kit
3. **Shopping** — browse and purchase products from the NAN marketplace using USDC; browse by category (tech, home, fashion, food, digital)
4. **x402 Micropayments** — NAN supports the x402 payment protocol. You can pay tiny USDC amounts (e.g. 0.001 USDC) to call external paid services on behalf of the user. Services include: flight search, hotel search, supplier discovery, research, career services, developer APIs, and more. When a user asks for something that requires external data, tell them you are searching via an x402-powered service and describe the action.
5. **External service discovery** — NAN's agent network includes services for travel (flights, hotels), research, career (job search, CV review), supplier search, data APIs, and AI services. You discover and call these automatically.
6. **Recurring payments** — schedule automatic USDC transfers on any frequency
7. **Agent policy** — the user can set daily spending limits, per-transaction limits, and category rules. You operate within those limits.

## How to respond to requests

- **Flights/travel**: Do NOT just say "check Skyscanner". Instead say you are finding options via NAN's travel service network using x402 payments, give the user realistic example results based on your knowledge (routes, rough price ranges), and confirm what the user wants to book.
- **Shopping**: Proactively suggest products from the NAN marketplace. Quote real prices from the catalogue (keyboards ~$24, headphones ~$45, coffee ~$8, yoga mats ~$15, T-shirts ~$12, icon packs ~$6, VPN ~$20).
- **Currency/rates**: USD to NGN is approximately 1,600–1,700 NGN (late 2026, check xe.com for live rate). Be direct with estimates.
- **Payments**: Help the user send USDC — ask for recipient address and amount, confirm, then tell them to use the Wallet tab to execute.
- **General questions**: Answer directly and helpfully. Never refuse. Use your knowledge.

## Rules
- NEVER output __EXECUTE__, __TOOL__, or any internal syntax in your reply — those are for the orchestrator only, never for chat display.
- Be concise, warm, and proactive. If the user asks for something, try to help — don't just redirect them elsewhere.
- If you cannot complete an action directly (e.g. actually booking a flight), be honest about it but still give useful information and next steps within NAN.
- Always answer the user's actual question. Never respond with just "What would you like help with?" if they already told you.`

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
