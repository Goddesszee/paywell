/**
 * Netlify function: /api/chat
 * Full NAN Agent — knows live wallet balances + can emit action blocks
 * that the frontend parses and executes (send, bridge, swap, recurring, policy, navigate).
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import Groq from 'groq-sdk'

function cors(body: string, statusCode: number, extra?: Record<string, string>) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-402-Payment, X-Payment-Response, X-Payment',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...extra,
    },
    body,
  }
}

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return cors('', 204)
  if (event.httpMethod !== 'POST')    return cors(JSON.stringify({ error: 'Method not allowed' }), 405)

  let body: {
    message?: string
    messages?: Array<{ role: string; content: string }>
    history?: Array<{ role: string; content: string }>
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
  } = {}
  try { body = JSON.parse(event.body ?? '{}') } catch { /* ignore */ }

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
  const mainBal   = ctx.mainBalance  ?? body.usdcBal ?? 'unknown'
  const mainAddr  = ctx.mainAddress  ?? body.userAddress ?? 'not connected'
  const agentBal  = ctx.agentBalance ?? 'unknown'
  const agentAddr = ctx.agentAddress ?? 'not set up'

  const walletBlock = `

## LIVE WALLET STATE (injected at request time — this is REAL data, not a guess)
- Your main wallet balance: **${mainBal} USDC** (address: ${mainAddr})
- Your Agent Wallet balance: **${agentBal} USDC** (address: ${agentAddr})
- Daily spending limit: ${ctx.dailyLimit ?? 'not set'} USDC
- Remaining today: ${ctx.remainingToday ?? 'unknown'} USDC
- Per-transaction limit: ${ctx.perTxLimit ?? 'not set'} USDC

IMPORTANT: When the user asks about their balance, always answer directly using the LIVE WALLET STATE above. Never say you don't have access to the balance.`

  const systemPrompt = `You are NAN Agent — the built-in AI assistant for NAN (nanarc.xyz), an autonomous financial platform on Arc Testnet (Circle/USDC). Today is ${new Date().toDateString()}.${walletBlock}

## NAN APP FEATURES
- Home/Dashboard: USDC balance, recent activity, quick send/receive/convert
- Wallet: full wallet management, send/receive USDC, transaction history
- Bridge: move USDC across chains via Circle CCTP (Arc ↔ Base ↔ Ethereum ↔ Arbitrum etc)
- Swap: exchange tokens via Circle/LiFi
- Shop/Marketplace: buy and sell products with USDC escrow protection
- Agent Wallet: Circle developer-controlled wallet for autonomous AI payments
- Recurring Payments: schedule automatic USDC transfers (daily/weekly/monthly)
- Activity: full transaction history
- Gateway: Circle Gateway for unified cross-chain USDC balance
- Onramp: buy USDC with card/bank
- Settings, Profile, Support, FAQ

## CRITICAL: ACTION SYSTEM

When the user asks you to DO something, emit an action block at the very END of your reply:

\`\`\`nan-action
{"action":"<ACTION_TYPE>","params":{...}}
\`\`\`

Available actions:

**SEND USDC FROM MAIN WALLET:**
{"action":"send_usdc","params":{"toAddress":"<0x>","amount":"<number>","note":"<optional>"}}
Triggers: "send 10 USDC to 0xABC", "transfer 5 USDC to my friend at 0x..."

**SEND USDC FROM AGENT WALLET:**
{"action":"agent_send","params":{"toAddress":"<0x>","amount":"<number>","note":"<optional>"}}
Triggers: "send 2 USDC from my agent wallet to 0xABC"

**BRIDGE USDC (opens Bridge tab pre-filled):**
{"action":"bridge_start","params":{"amount":"<number>","toChain":"<chain>"}}
Triggers: "bridge 50 USDC to Base", "move 10 USDC to Ethereum"

**SWAP TOKENS (opens Swap tab pre-filled):**
{"action":"swap_start","params":{"fromToken":"USDC","toToken":"<token>","amount":"<number>"}}
Triggers: "swap 10 USDC to EURC", "convert USDC to ETH"

**ADD RECURRING PAYMENT (main wallet):**
{"action":"add_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<number>","frequency":"daily|weekly|monthly|manual"}}
Triggers: "set up a weekly payment of 5 USDC to 0x...", "pay 10 USDC every month to 0x..."

**ADD RECURRING PAYMENT (agent wallet):**
{"action":"add_agent_recurring","params":{"name":"<label>","recipient":"<0x>","amount":"<number>","frequency":"daily|weekly|monthly|manual"}}
Triggers: "schedule a daily agent payment of 1 USDC"

**UPDATE SPENDING POLICY:**
{"action":"set_policy","params":{"dailyLimit":<n>,"perTxLimit":<n>,"perServiceLimit":<n>}}
Triggers: "set my daily limit to 50 USDC", "limit each transaction to 10 USDC"

**NAVIGATE:**
{"action":"navigate","params":{"page":"wallet|shop|bridge|swap|gateway|recurring|activity|profile|settings|faucet|agent|support|home|onramp"}}
Triggers: "take me to bridge", "open my wallet", "go to shop"

**ENABLE/DISABLE AGENT:**
{"action":"toggle_agent","params":{"enabled":true|false}}

**SEARCH SHOP:**
{"action":"shop_search","params":{"query":"<term>"}}

## RULES
- For balance questions: ALWAYS answer from LIVE WALLET STATE — never say you can't access it.
- For send/bridge/swap/recurring: emit the action block so the UI can execute it.
- For navigation: emit navigate action immediately, no confirmation needed.
- For financial actions (send, recurring): these require user confirmation in the UI — just emit the action.
- Keep replies concise and helpful. One sentence max before the action block for financial operations.
- Never invent transaction hashes, prices, or service data.
- Do NOT say "I'm just an AI" or "I can't do that" for things in the action list above — just emit the action.`

  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: message },
        ],
        max_tokens: 600,
        temperature: 0.3,
      })
      const raw = completion.choices[0]?.message?.content ?? "I'm here to help!"
      // Strip nan-action block from visible reply; frontend parses it separately
      const actionMatch = raw.match(/```nan-action\s*([\s\S]*?)```/)
      let action: Record<string, unknown> | null = null
      if (actionMatch) {
        try { action = JSON.parse(actionMatch[1].trim()) as Record<string, unknown> } catch { /* ignore */ }
      }
      const reply = raw.replace(/```nan-action[\s\S]*?```/g, '').trim()
      return cors(JSON.stringify({ reply, action, paid: true }), 200)
    } catch (err) {
      console.error('Groq error:', err)
    }
  }

  // Fallback: keyword-based replies with direct balance answers
  const lower = message.toLowerCase()
  let reply = "I'm NAN Agent. I can send USDC, bridge, swap, set up recurring payments, and manage your spending policy. What would you like to do?"
  let action: Record<string, unknown> | null = null

  if (lower.includes('balance') || lower.includes('how much') || lower.includes('usdc')) {
    reply = `Your main wallet has **${mainBal} USDC**. Your Agent Wallet has **${agentBal} USDC**.`
  } else if (lower.match(/send|transfer/) && lower.match(/0x[0-9a-f]{4,}/i)) {
    const addrMatch = lower.match(/0x[0-9a-fA-F]{6,}/)
    const amtMatch  = lower.match(/(\d+(\.\d+)?)\s*usdc?/)
    if (addrMatch && amtMatch) {
      reply = `I'll send ${amtMatch[1]} USDC to ${addrMatch[0].slice(0, 10)}…. Please confirm.`
      action = { action: lower.includes('agent') ? 'agent_send' : 'send_usdc', params: { toAddress: addrMatch[0], amount: amtMatch[1] } }
    }
  } else if (lower.includes('bridge')) {
    const amtMatch = lower.match(/(\d+(\.\d+)?)\s*usdc?/)
    reply = 'Opening Bridge tab' + (amtMatch ? ` with ${amtMatch[1]} USDC` : '') + '. Complete the transaction there.'
    action = { action: 'bridge_start', params: { amount: amtMatch?.[1] } }
  } else if (lower.includes('swap') || lower.includes('convert')) {
    const amtMatch = lower.match(/(\d+(\.\d+)?)\s*usdc?/)
    reply = 'Opening Swap tab' + (amtMatch ? ` with ${amtMatch[1]} USDC` : '') + '. Complete the swap there.'
    action = { action: 'swap_start', params: { fromToken: 'USDC', amount: amtMatch?.[1] } }
  } else if (lower.includes('recurring') || lower.includes('schedule')) {
    reply = 'I can schedule recurring USDC payments for you. Please tell me: recipient address, amount, and frequency (daily/weekly/monthly).'
  } else if (lower.includes('limit') || lower.includes('policy')) {
    const amtMatch = lower.match(/(\d+(\.\d+)?)\s*usdc?/)
    if (amtMatch) {
      reply = `Setting your daily limit to ${amtMatch[1]} USDC. Please confirm.`
      action = { action: 'set_policy', params: { dailyLimit: parseFloat(amtMatch[1]) } }
    } else {
      reply = `Your current daily limit is ${ctx.dailyLimit ?? 'not set'} USDC with ${ctx.remainingToday ?? 'unknown'} remaining today.`
    }
  } else if (lower.includes('bridge')) {
    action = { action: 'navigate', params: { page: 'bridge' } }
    reply = 'Opening Bridge tab for you.'
  } else if (lower.includes('shop')) {
    action = { action: 'navigate', params: { page: 'shop' } }
    reply = 'Opening the shop.'
  }

  return cors(JSON.stringify({ reply, action, paid: true }), 200)
}

export { handler }
