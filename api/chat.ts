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

  const systemPrompt = `You are NAN Agent — a helpful AI financial assistant built on Circle/Arc infrastructure. Today's date is ${new Date().toDateString()}.

You help users with:
- Sending and receiving USDC on Arc Testnet
- Checking wallet balances and transaction history
- Bridging USDC across chains (Arc, Ethereum, Base, Arbitrum) via Circle CCTP
- Swapping tokens via Circle App Kit
- Shopping in the NAN marketplace (pay with USDC)
- General financial questions, exchange rates, and market info
- Flight and travel searches (give helpful general advice and direct to booking sites)

CRITICAL RULES:
- NEVER output raw internal commands like __EXECUTE__, __TOOL__, or any similar syntax. Those are internal and must never appear in your response.
- Always respond in plain conversational text.
- For real-world data (exchange rates, flight prices, stock prices): give your best estimate based on training data, clearly note it may not be live, and suggest where the user can check current prices (e.g. Google, Skyscanner, XE.com).
- For "dollar to naira" rate: the approximate rate as of late 2026 is around 1 USD = 1,600–1,700 NGN (note this is approximate — check xe.com or your bank for the live rate).
- Keep answers concise and friendly. Never refuse to answer a question — always try to be helpful.
- Do NOT ask "what would you like help with?" if the user already stated their request. Answer their actual question directly.`

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
