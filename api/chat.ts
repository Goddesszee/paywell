import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { message, history = [] } = req.body as { message?: string; history?: { role: string; content: string }[] }
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

  if (process.env.GROQ_API_KEY) {
    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are Paywell AI, a helpful financial assistant. Help users send USDC, manage their wallet, shop, bridge tokens, and understand their transactions. Be concise and friendly.' },
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
