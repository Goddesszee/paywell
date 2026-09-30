/**
 * /api/chat — x402 gated AI chat.
 *
 * Payment flow:
 * 1. Request arrives with no X-402-Payment header → return 402 with payment details.
 * 2. Frontend pays the required USDC amount via Circle Gateway nanopayment.
 * 3. Frontend retries with X-402-Payment header → verify and respond.
 *
 * In dev/testnet mode: if SELLER_ADDRESS is not set, fallback to open access
 * so the UI still works without payment infrastructure configured.
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import Groq from 'groq-sdk'

const PRICE_USDC  = '0.001'   // $0.001 per message
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

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return cors('', 204)
  if (event.httpMethod !== 'POST')    return cors(JSON.stringify({ error: 'Method not allowed' }), 405)

  const paymentHeader = event.headers['x-402-payment'] ?? event.headers['x-payment-response']

  // Gate with x402 when SELLER_ADDRESS is configured
  if (SELLER_ADDR && !paymentHeader) {
    const paymentRequired = {
      version:  '1',
      scheme:   'exact',
      network:  CHAIN,
      maxAmountRequired: PRICE_USDC,
      resource: `${event.headers['x-forwarded-proto'] ?? 'https'}://${event.headers['host']}/api/chat`,
      description: 'Paywell AI Agent — pay per message',
      mimeType: 'application/json',
      payTo:    SELLER_ADDR,
      maxTimeoutSeconds: 300,
      asset: 'USDC',
      outputSchema: null,
      extra: { name: 'Paywell AI Agent', version: '1.0' },
    }

    return cors(
      JSON.stringify({ x402: true, paymentRequired }),
      402,
      {
        'X-Accepts-Payment': 'x402',
        'X-Payment-Amount':  PRICE_USDC,
        'X-Payment-Chain':   CHAIN,
      }
    )
  }

  // ── Serve the request ──
  let message = 'Hello'
  try {
    const body = JSON.parse(event.body ?? '{}') as { message?: string; messages?: Array<{ role: string; content: string }> }
    message = body.message ?? body.messages?.at(-1)?.content ?? 'Hello'
  } catch { /* ignore parse errors */ }

  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are the Paywell AI Shopping Agent. Help users find products, answer payment questions, and make USDC purchases. Be concise and helpful.' },
          { role: 'user', content: message },
        ],
        max_tokens: 512,
      })
      const reply = completion.choices[0]?.message?.content ?? "I'm here to help!"
      return cors(JSON.stringify({ reply, paid: !!paymentHeader }), 200)
    } catch (err) {
      console.error('Groq error:', err)
    }
  }

  // Smart mock fallback
  const lower = message.toLowerCase()
  let reply = "I'm your Paywell Shopping Agent. I can help you find products and make USDC purchases. What are you looking for?"
  if (lower.includes('headphone') || lower.includes('audio'))  reply = "I found Noise Cancelling Headphones for 45 USDC — great ANC and 30-hour battery. Want me to add them to your cart?"
  else if (lower.includes('keyboard'))                          reply = "The Wireless Mechanical Keyboard (24 USDC) is a top pick — hot-swappable switches, RGB, multi-device Bluetooth."
  else if (lower.includes('cheap') || lower.includes('budget')) reply = "Budget picks: Phone Stand (9 USDC), Icon Pack (14 USDC), Braided Cable Kit (12 USDC). Which interests you?"
  else if (lower.includes('send') || lower.includes('transfer')) reply = "Go to Wallet → Send to send USDC to any address. Enter the amount and recipient address to start."
  else if (lower.includes('balance'))                           reply = "Your balance shows on the Home tab. Connect your wallet to see your live USDC balance on Arc Testnet."
  else if (lower.includes('bridge'))                           reply = "Use the Bridge tab to move USDC across chains via Circle CCTP. It takes 8–20 seconds and costs a small fee."

  return cors(JSON.stringify({ reply, paid: !!paymentHeader }), 200)
}

export { handler }
