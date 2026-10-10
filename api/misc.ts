/**
 * /api/misc — consolidated miscellaneous handler
 * Merges activity-feed, agent-registry, faucet, and gateway-proxy to stay under
 * Vercel Hobby's 12-function limit.
 *
 * Routes:
 *   GET  ?route=activity-feed&address=0x…      returns empty tx list (activity from onchain getLogs)
 *   GET  ?route=agent-registry                  returns the SERVICE_REGISTRY list
 *   POST ?route=faucet  { address }             drips testnet USDC via Circle faucet
 *   POST ?route=gateway&action=modular-rpc      proxies modular SDK JSON-RPC call
 *   POST ?route=gateway&action=gateway-transfer submits a Gateway burn intent
 *   POST ?route=gateway&action=gateway-poll     polls a Gateway transfer
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAddress } from 'viem'
import { SERVICE_REGISTRY } from '../src/lib/agent-registry'

// ── faucet config ─────────────────────────────────────────────────────────────
const FAUCET_URL  = 'https://api.circle.com/v1/faucet/drips'
const BLOCKCHAIN  = 'ARC-TESTNET'
const COOLDOWN_MS = 24 * 60 * 60 * 1000
const lastRequestByAddress = new Map<string, number>()

function faucetApiKey() {
  return process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY ?? process.env.CIRCLE_API_KEY
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const route = (req.query.route ?? req.body?.route) as string | undefined

  // ── GET activity-feed ──────────────────────────────────────────────────────
  if (route === 'activity-feed') {
    const { address } = req.query
    if (!address) return res.status(400).json({ error: 'address required' })
    return res.status(200).json({ transactions: [] })
  }

  // ── GET agent-registry ─────────────────────────────────────────────────────
  if (route === 'agent-registry') {
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    return res.status(200).json({ services: SERVICE_REGISTRY, count: SERVICE_REGISTRY.length })
  }

  // ── POST faucet ────────────────────────────────────────────────────────────
  if (route === 'faucet') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const key = faucetApiKey()
    if (!key) {
      return res.status(503).json({
        error: 'faucet_not_configured',
        message: 'Add CIRCLE_DEVELOPER_CONTROLLED_API_KEY to Vercel environment variables',
      })
    }

    const { address } = (req.body ?? {}) as { address?: string }
    if (!address || !isAddress(address)) {
      return res.status(400).json({ error: 'A valid wallet address is required' })
    }

    const normalized = address.toLowerCase()
    const lastRequest = lastRequestByAddress.get(normalized)
    const now = Date.now()

    if (lastRequest && now - lastRequest < COOLDOWN_MS) {
      const retryAfterMs = COOLDOWN_MS - (now - lastRequest)
      return res.status(429).json({
        error: 'cooldown',
        message: 'This address already claimed testnet funds in the last 24 hours',
        retryAfterMs,
      })
    }

    try {
      const circleRes = await fetch(FAUCET_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ address, blockchain: BLOCKCHAIN, usdc: true }),
      })

      if (!circleRes.ok) {
        const errBody = await circleRes.json().catch(() => ({}))
        const message = (errBody as { message?: string })?.message ?? `Circle faucet request failed (HTTP ${circleRes.status})`
        if (circleRes.status === 429) return res.status(429).json({ error: 'cooldown', message })
        return res.status(circleRes.status).json({ error: 'faucet_request_failed', message })
      }

      lastRequestByAddress.set(normalized, now)
      return res.status(200).json({ ok: true, message: 'Testnet USDC is on its way — it usually lands within a minute.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Faucet request error'
      return res.status(500).json({ error: 'faucet_request_failed', message })
    }
  }

  // ── POST gateway proxy ─────────────────────────────────────────────────────
  if (route === 'gateway') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const GATEWAY_API = 'https://gateway-api-testnet.circle.com/v1'
    const MODULAR_SDK = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl'
    const action = req.query.action as string | undefined

    try {
      if (action === 'modular-rpc') {
        const { chain, clientKey, body } = req.body as { chain: string; clientKey: string; body: unknown }
        if (!chain || !clientKey || !body) return res.status(400).json({ error: 'chain, clientKey, and body are required' })
        const upstream = await fetch(`${MODULAR_SDK}/${chain}?clientKey=${encodeURIComponent(clientKey)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        const text = await upstream.text()
        return res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
      }

      if (action === 'gateway-transfer') {
        const { items, enableForwarder } = req.body as { items: unknown[]; enableForwarder?: boolean }
        if (!items?.length) return res.status(400).json({ error: 'items array required' })
        const url = enableForwarder ? `${GATEWAY_API}/transfer?enableForwarder=true` : `${GATEWAY_API}/transfer`
        const upstream = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items),
        })
        if (!upstream.ok) {
          const text = await upstream.text()
          return res.status(upstream.status).json({ error: `Gateway API ${upstream.status}: ${text}` })
        }
        return res.status(200).json(await upstream.json())
      }

      if (action === 'gateway-poll') {
        const { transferId } = req.body as { transferId: string }
        if (!transferId) return res.status(400).json({ error: 'transferId required' })
        const upstream = await fetch(`${GATEWAY_API}/transfer/${transferId}`)
        if (!upstream.ok) return res.status(upstream.status).json({ error: 'poll failed' })
        return res.status(200).json(await upstream.json())
      }

      return res.status(400).json({ error: `Unknown gateway action: ${String(action)}` })
    } catch (e: unknown) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' })
    }
  }

  // ── GET /api/about ────────────────────────────────────────────────────────
  if (route === 'about') {
    return res.status(200).json({
      about: {
        headline: 'NAN — The Intelligent Money Layer',
        tagline: 'Your AI agent. Your wallet. Your rules.',
        body: `NAN (Networked Agent for Nanopayments) is a next-generation financial platform that gives your AI agent a real, programmable USDC wallet — powered by Circle and built on Arc.

NAN lets you send and receive USDC instantly, bridge across chains, swap tokens, and set up recurring payments — all from one clean interface. What makes NAN different is the Agent Wallet: a dedicated wallet your AI agent can use to pay for services, automate payments, and execute transactions on your behalf, within limits you set.

Built on Arc — Circle's blockchain where USDC is the native gas token — NAN delivers sub-second finality and stable, predictable fees. No volatile gas surprises. No delays. Just fast, reliable USDC movement.

NAN integrates deeply with the Circle stack: Circle Agent Stack for agent payments, CCTP v2 for cross-chain bridging, Circle Gateway for unified cross-chain liquidity, Circle Onramp for fiat-to-USDC purchases, and Circle's modular wallet infrastructure for secure key management.`,
        mission: 'To make money programmable — giving every person and every AI agent the ability to send, receive, and automate payments anywhere in the world, instantly and transparently, without banks or borders.',
        contact: 'For support, use the Support page in the app. For business inquiries and partnerships, reach out via the Feedback page. NAN is built by a team focused on making AI-native finance accessible to everyone.',
        updatedAt: new Date().toISOString(),
      },
    })
  }

  // ── GET /api/faqs ──────────────────────────────────────────────────────────
  if (route === 'faqs') {
    return res.status(200).json({
      faqs: [
        // ── Getting Started ──
        { id: 'gs1', category: 'Getting Started', order: 1, question: 'What is NAN?', answer: 'NAN is an AI-powered financial platform built on Arc. It gives you a smart USDC wallet with an AI agent that can make payments, automate transfers, and manage your money — all within limits you control.' },
        { id: 'gs2', category: 'Getting Started', order: 2, question: 'How do I create an account?', answer: 'Tap "Sign up" on the landing page and log in with your email using a one-time passcode (OTP). No password required. Your wallet is created automatically after you verify your email.' },
        { id: 'gs3', category: 'Getting Started', order: 3, question: 'What blockchain does NAN use?', answer: 'NAN is built on Arc — a blockchain by Circle where USDC is the native gas token. This means you pay transaction fees in USDC, not ETH or another volatile asset. NAN also supports Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, and more via bridging.' },
        { id: 'gs4', category: 'Getting Started', order: 4, question: 'Is NAN on testnet or mainnet?', answer: 'NAN currently runs on Arc Testnet. Testnet USDC has no real monetary value and is used for testing and development. You can get free testnet USDC from the Faucet page in the app.' },
        { id: 'gs5', category: 'Getting Started', order: 5, question: 'What currency does NAN use?', answer: 'NAN uses USDC — a regulated, dollar-backed stablecoin issued by Circle. 1 USDC = $1 USD. On Arc, USDC is also the native gas token used to pay transaction fees.' },

        // ── Wallet & Balances ──
        { id: 'wb1', category: 'Wallet & Balances', order: 1, question: 'What types of wallets does NAN have?', answer: 'NAN gives you two wallets: (1) a Main Wallet for your everyday USDC — sending, receiving, and bridging; and (2) an Agent Wallet — a dedicated wallet your AI agent uses for automated payments. They are separate balances, and you control how much goes into each.' },
        { id: 'wb2', category: 'Wallet & Balances', order: 2, question: 'How do I add money to my wallet?', answer: 'You can add USDC in three ways: (1) use the Faucet page for free testnet USDC; (2) use the Onramp page to buy USDC with a card or bank transfer; or (3) have someone send USDC to your wallet address directly.' },
        { id: 'wb3', category: 'Wallet & Balances', order: 3, question: 'Why does my balance show differently across wallets?', answer: 'Your Main Wallet shows your personal USDC balance. Your Agent Wallet is separate — it only holds what you have funded into it. Gateway Liquidity is also shown separately because it represents USDC deposited into Circle Gateway for cross-chain use, though it is the same underlying USDC.' },
        { id: 'wb4', category: 'Wallet & Balances', order: 4, question: 'Can I connect an existing wallet like MetaMask?', answer: 'Yes. NAN supports wagmi-compatible wallets (MetaMask, WalletConnect, Coinbase Wallet, etc.) via ConnectKit. You can connect your existing wallet to view balances and send USDC directly from it.' },
        { id: 'wb5', category: 'Wallet & Balances', order: 5, question: 'How do I see my full transaction history?', answer: 'Go to Activity from the bottom navigation or side drawer. You can filter by type, search by address or description, and export your history from the Generate Statement page.' },

        // ── Sending & Receiving ──
        { id: 'sr1', category: 'Sending & Receiving', order: 1, question: 'How do I send USDC?', answer: 'From the Home screen, tap "Send". Enter the recipient\'s wallet address and the amount in USDC, then confirm. For Circle email wallet users, a Circle PIN popup will appear to authorize the transaction.' },
        { id: 'sr2', category: 'Sending & Receiving', order: 2, question: 'How do I receive USDC?', answer: 'Tap "Receive" on the Home screen to see your wallet address and QR code. Share your address with the sender. USDC sent to your address on Arc Testnet will appear in your balance once confirmed.' },
        { id: 'sr3', category: 'Sending & Receiving', order: 3, question: 'How do I request money from someone?', answer: 'Go to Payment Requests and tap "New Request". Enter the amount, description, and optional due date. NAN generates a shareable payment link. When the recipient opens the link, they can pay directly.' },
        { id: 'sr4', category: 'Sending & Receiving', order: 4, question: 'Can I set up recurring payments?', answer: 'Yes. Go to Recurring from the side drawer. You can schedule automatic USDC payments — daily, weekly, or monthly — to any address. The AI agent can also manage recurring payments on your behalf from the Agent Wallet.' },
        { id: 'sr5', category: 'Sending & Receiving', order: 5, question: 'What is the minimum send amount?', answer: 'There is no minimum enforced by NAN, but Arc Testnet transactions require enough USDC to cover the gas fee. In practice, sending 0.01 USDC or more is reliable. Very small amounts may fail if the balance is too low to cover fees.' },

        // ── NAN Agent ──
        { id: 'ag1', category: 'NAN Agent', order: 1, question: 'What is the NAN Agent?', answer: 'The NAN Agent is an AI assistant powered by OpenAI GPT-4o. It knows your wallet balances, transaction history, recurring payments, and payment requests. You can ask it questions, request transfers, check your balance, and manage your finances using natural language.' },
        { id: 'ag2', category: 'NAN Agent', order: 2, question: 'What can I ask the NAN Agent?', answer: 'You can ask: "What\'s my balance?", "Show my recent transactions", "Do I have any pending payment requests?", "Send 10 USDC to 0x...", "Set up a recurring payment", "What services are on the agent stack?", and much more. The agent understands your full account context.' },
        { id: 'ag3', category: 'NAN Agent', order: 3, question: 'What is the Agent Wallet?', answer: 'The Agent Wallet is a separate Circle wallet dedicated to your NAN Agent. You fund it with USDC, and the agent can use it to pay for services, make authorized transfers, and execute automated payments — all within the spending limits you set.' },
        { id: 'ag4', category: 'NAN Agent', order: 4, question: 'How do I set spending limits for the agent?', answer: 'Open the Agent Wallet and tap "Manage Spending Policy". On mainnet, you can set per-transaction, daily, weekly, and monthly USDC limits via the Circle CLI. On testnet, custom policies are not yet enforced by Circle but the interface is ready.' },
        { id: 'ag5', category: 'NAN Agent', order: 5, question: 'Is the agent talking to a real AI?', answer: 'Yes. NAN Agent uses OpenAI GPT-4o as the primary AI model. Every message is sent with your live account data — balance, recent transactions, recurring payments, and more — so the agent always answers with real, up-to-date information.' },

        // ── Bridge & Swap ──
        { id: 'bs1', category: 'Bridge & Swap', order: 1, question: 'What is the Bridge?', answer: 'The Bridge lets you move USDC from one blockchain to another — for example, from Arc Testnet to Ethereum Sepolia or Base Sepolia. NAN uses Circle\'s CCTP v2 (Cross-Chain Transfer Protocol) for fast, secure cross-chain transfers.' },
        { id: 'bs2', category: 'Bridge & Swap', order: 2, question: 'How long does a bridge transfer take?', answer: 'CCTP v2 bridges typically complete in under 2 minutes. The exact time depends on the source and destination chains. NAN shows real-time status updates during the transfer.' },
        { id: 'bs3', category: 'Bridge & Swap', order: 3, question: 'What chains does the Bridge support?', answer: 'NAN Bridge supports Arc Testnet, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, and Avalanche Fuji — all on testnet. Mainnet chains will be available when NAN launches on mainnet.' },
        { id: 'bs4', category: 'Bridge & Swap', order: 4, question: 'What is the Swap page?', answer: 'Swap lets you exchange one token for another within the same chain — for example, USDT to USDC or EURC to USDC. NAN uses Circle\'s Swap Kit for on-chain token swaps with real-time rate estimates.' },
        { id: 'bs5', category: 'Bridge & Swap', order: 5, question: 'What is Gateway?', answer: 'Gateway is Circle\'s cross-chain liquidity layer. Depositing USDC into Gateway lets you move funds across chains instantly (under 500ms) without waiting for a full bridge transfer. NAN\'s Gateway page lets you deposit, manage, and transfer via Circle Gateway.' },

        // ── Onramp & Faucet ──
        { id: 'of1', category: 'Onramp & Faucet', order: 1, question: 'How do I buy USDC with real money?', answer: 'Go to the Onramp page (Buy USDC). Select an amount, then tap "Buy". The Circle Onramp widget will open — you can pay with card, Apple Pay, Google Pay, or bank transfer. Circle handles KYC and compliance.' },
        { id: 'of2', category: 'Onramp & Faucet', order: 2, question: 'What is the Faucet?', answer: 'The Faucet gives you free testnet USDC for development and testing. Go to Faucet, enter your wallet address, and tap "Request USDC". Testnet funds are not real money and have no monetary value.' },
        { id: 'of3', category: 'Onramp & Faucet', order: 3, question: 'How often can I use the Faucet?', answer: 'The faucet has a 24-hour cooldown per wallet address. If you need more testnet USDC, wait 24 hours or use a different wallet address.' },

        // ── Security & Privacy ──
        { id: 'sp1', category: 'Security & Privacy', order: 1, question: 'Who controls my wallet keys?', answer: 'NAN uses Circle\'s programmable wallet infrastructure. For Circle email wallet users, keys are managed by Circle\'s MPC (Multi-Party Computation) system — no single party holds the full key. For wagmi wallet users (MetaMask etc.), you control your own keys.' },
        { id: 'sp2', category: 'Security & Privacy', order: 2, question: 'Is NAN custodial or non-custodial?', answer: 'NAN offers both. Circle email login creates a Circle-managed (custodial) wallet where Circle\'s MPC infrastructure secures the keys. Connecting MetaMask or another external wallet is fully non-custodial — you keep your own keys.' },
        { id: 'sp3', category: 'Security & Privacy', order: 3, question: 'What happens if I lose access to my account?', answer: 'For Circle wallet users, account recovery uses your registered email. Circle\'s MPC infrastructure is designed for recoverability. For external wallets, recovery depends on your own seed phrase — NAN cannot recover external wallets.' },
        { id: 'sp4', category: 'Security & Privacy', order: 4, question: 'Can the NAN Agent spend money without my approval?', answer: 'Only from the Agent Wallet, and only within the spending limits you have set. The agent cannot touch your main NAN wallet balance. Every agent transaction goes through Circle\'s wallet infrastructure and is visible in your Activity feed.' },

        // ── Troubleshooting ──
        { id: 'tr1', category: 'Troubleshooting', order: 1, question: 'My transaction is stuck or pending — what do I do?', answer: 'Check the Activity page for the transaction status. On Arc Testnet, transactions normally confirm in under 2 seconds. If it stays pending for more than a minute, the network may be congested. Refresh your balance and try again. Contact Support if the issue persists.' },
        { id: 'tr2', category: 'Troubleshooting', order: 2, question: 'The NAN Agent says "I\'m having trouble reaching the AI backend" — why?', answer: 'This means the AI backend is temporarily unavailable. Basic questions about your balance, transactions, and recurring payments are answered directly from your account data without the AI. Full AI responses will resume automatically when the service recovers.' },
        { id: 'tr3', category: 'Troubleshooting', order: 3, question: 'My Circle PIN popup is not appearing — what do I do?', answer: 'Circle PIN popups can be blocked by browser popup blockers. Make sure nanarc.xyz is allowed to open popups in your browser settings. On mobile, the popup opens as an in-app overlay. If it still does not appear, try refreshing the page and retrying.' },
        { id: 'tr4', category: 'Troubleshooting', order: 4, question: 'How do I contact support?', answer: 'Go to Support from the side drawer. Submit a ticket with your issue description and wallet address. The NAN team will respond as quickly as possible. You can also use the Feedback page to report bugs or suggest improvements.' },
      ],
    })
  }

  return res.status(400).json({ error: 'Unknown route.' })
}
