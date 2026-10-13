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
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { getAllServices } from '../src/lib/agent-registry.js'
import { getRedis, REDIS_NOT_CONFIGURED } from './_redis.js'

const OTP_TTL_SECONDS = 10 * 60
const fallbackOtpStore = new Map<string, { code: string; expires: number }>()


export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const route = (req.query.route ?? req.body?.route) as string | undefined

  // ── GET activity-feed ──────────────────────────────────────────────────────
  // Returns the last 200 stored activity records for a wallet address.
  // Records are written by /api/tx-track (community.ts) into per-wallet Redis lists.
  if (route === 'activity-feed') {
    const rawAddr = (req.query.address ?? req.query.wallet ?? '') as string
    if (!rawAddr) return res.status(400).json({ success: false, error: 'address or wallet param required' })
    const walletAddr = rawAddr.toLowerCase()
    const kv = getRedis()
    if (!kv) {
      // No Redis — return empty; client falls back to onchain getLogs
      return res.status(200).json({ success: true, activities: [] })
    }
    type TxRecord = {
      id: string; type: string; description: string; amount: number
      sign?: string; status?: string; counterparty?: unknown
      txHash?: unknown; timestamp: string; agentInitiated?: boolean; chain?: string
    }
    const raw = (await kv.lrange<TxRecord>(`activity:${walletAddr}`, 0, 199)) ?? []
    const activities = raw.map(r => ({
      id:            r.id,
      type:          r.type,
      description:   r.description,
      amount:        String(r.amount ?? 0),
      sign:          r.sign ?? (r.type === 'received' ? '+' : '-'),
      status:        r.status ?? 'confirmed',
      counterparty:  r.counterparty ? String(r.counterparty) : undefined,
      txHash:        r.txHash ? String(r.txHash) : undefined,
      timestamp:     r.timestamp,
      agentInitiated: r.agentInitiated ?? false,
      chain:         r.chain ?? 'Arc',
    }))
    return res.status(200).json({ success: true, activities })
  }

  // ── GET agent-registry ─────────────────────────────────────────────────────
  if (route === 'agent-registry') {
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    {
      const services = getAllServices()
      return res.status(200).json({ services, count: services.length })
    }
  }

  // ── POST gateway proxy ─────────────────────────────────────────────────────
  if (route === 'gateway') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const GATEWAY_API = 'https://gateway-api.circle.com/v1'
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
        { id: 'gs4', category: 'Getting Started', order: 4, question: 'Is NAN on testnet or mainnet?', answer: 'NAN currently runs on Arc. Testnet USDC has no real monetary value and is used for testing and development. You can get free testnet USDC from the Faucet page in the app.' },
        { id: 'gs5', category: 'Getting Started', order: 5, question: 'What currency does NAN use?', answer: 'NAN uses USDC — a regulated, dollar-backed stablecoin issued by Circle. 1 USDC = $1 USD. On Arc, USDC is also the native gas token used to pay transaction fees.' },

        // ── Wallet & Balances ──
        { id: 'wb1', category: 'Wallet & Balances', order: 1, question: 'What types of wallets does NAN have?', answer: 'NAN gives you two wallets: (1) a Main Wallet for your everyday USDC — sending, receiving, and bridging; and (2) an Agent Wallet — a dedicated wallet your AI agent uses for automated payments. They are separate balances, and you control how much goes into each.' },
        { id: 'wb2', category: 'Wallet & Balances', order: 2, question: 'How do I add money to my wallet?', answer: 'You can add USDC in three ways: (1) use the Faucet page for free testnet USDC; (2) use the Onramp page to buy USDC with a card or bank transfer; or (3) have someone send USDC to your wallet address directly.' },
        { id: 'wb3', category: 'Wallet & Balances', order: 3, question: 'Why does my balance show differently across wallets?', answer: 'Your Main Wallet shows your personal USDC balance. Your Agent Wallet is separate — it only holds what you have funded into it. Gateway Liquidity is also shown separately because it represents USDC deposited into Circle Gateway for cross-chain use, though it is the same underlying USDC.' },
        { id: 'wb4', category: 'Wallet & Balances', order: 4, question: 'Can I connect an existing wallet like MetaMask?', answer: 'Yes. NAN supports wagmi-compatible wallets (MetaMask, WalletConnect, Coinbase Wallet, etc.) via ConnectKit. You can connect your existing wallet to view balances and send USDC directly from it.' },
        { id: 'wb5', category: 'Wallet & Balances', order: 5, question: 'How do I see my full transaction history?', answer: 'Go to Activity from the bottom navigation or side drawer. You can filter by type, search by address or description, and export your history from the Generate Statement page.' },

        // ── Sending & Receiving ──
        { id: 'sr1', category: 'Sending & Receiving', order: 1, question: 'How do I send USDC?', answer: 'From the Home screen, tap "Send". Enter the recipient\'s wallet address and the amount in USDC, then confirm. For Circle email wallet users, a Circle PIN popup will appear to authorize the transaction.' },
        { id: 'sr2', category: 'Sending & Receiving', order: 2, question: 'How do I receive USDC?', answer: 'Tap "Receive" on the Home screen to see your wallet address and QR code. Share your address with the sender. USDC sent to your address on Arc will appear in your balance once confirmed.' },
        { id: 'sr3', category: 'Sending & Receiving', order: 3, question: 'How do I request money from someone?', answer: 'Go to Payment Requests and tap "New Request". Enter the amount, description, and optional due date. NAN generates a shareable payment link. When the recipient opens the link, they can pay directly.' },
        { id: 'sr4', category: 'Sending & Receiving', order: 4, question: 'Can I set up recurring payments?', answer: 'Yes. Go to Recurring from the side drawer. You can schedule automatic USDC payments — daily, weekly, or monthly — to any address. The AI agent can also manage recurring payments on your behalf from the Agent Wallet.' },
        { id: 'sr5', category: 'Sending & Receiving', order: 5, question: 'What is the minimum send amount?', answer: 'There is no minimum enforced by NAN, but Arc transactions require enough USDC to cover the gas fee. In practice, sending 0.01 USDC or more is reliable. Very small amounts may fail if the balance is too low to cover fees.' },

        // ── NAN Agent ──
        { id: 'ag1', category: 'NAN Agent', order: 1, question: 'What is the NAN Agent?', answer: 'The NAN Agent is an AI assistant powered by OpenAI GPT-4o. It knows your wallet balances, transaction history, recurring payments, and payment requests. You can ask it questions, request transfers, check your balance, and manage your finances using natural language.' },
        { id: 'ag2', category: 'NAN Agent', order: 2, question: 'What can I ask the NAN Agent?', answer: 'You can ask: "What\'s my balance?", "Show my recent transactions", "Do I have any pending payment requests?", "Send 10 USDC to 0x...", "Set up a recurring payment", "What services are on the agent stack?", and much more. The agent understands your full account context.' },
        { id: 'ag3', category: 'NAN Agent', order: 3, question: 'What is the Agent Wallet?', answer: 'The Agent Wallet is a separate Circle wallet dedicated to your NAN Agent. You fund it with USDC, and the agent can use it to pay for services, make authorized transfers, and execute automated payments — all within the spending limits you set.' },
        { id: 'ag4', category: 'NAN Agent', order: 4, question: 'How do I set spending limits for the agent?', answer: 'Open the Agent Wallet and tap "Manage Spending Policy". You can set per-transaction, daily, weekly, and monthly USDC limits to control exactly how much your agent can spend.' },
        { id: 'ag5', category: 'NAN Agent', order: 5, question: 'Is the agent talking to a real AI?', answer: 'Yes. NAN Agent uses OpenAI GPT-4o as the primary AI model. Every message is sent with your live account data — balance, recent transactions, recurring payments, and more — so the agent always answers with real, up-to-date information.' },

        // ── Bridge & Swap ──
        { id: 'bs1', category: 'Bridge & Swap', order: 1, question: 'What is the Bridge?', answer: 'The Bridge lets you move USDC from one blockchain to another — for example, from Arc to Ethereum Sepolia or Base Sepolia. NAN uses Circle\'s CCTP v2 (Cross-Chain Transfer Protocol) for fast, secure cross-chain transfers.' },
        { id: 'bs2', category: 'Bridge & Swap', order: 2, question: 'How long does a bridge transfer take?', answer: 'CCTP v2 bridges typically complete in under 2 minutes. The exact time depends on the source and destination chains. NAN shows real-time status updates during the transfer.' },
        { id: 'bs3', category: 'Bridge & Swap', order: 3, question: 'What chains does the Bridge support?', answer: 'NAN Bridge supports Arc, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, and Avalanche Fuji — all on testnet. Mainnet chains will be available when NAN launches on mainnet.' },
        { id: 'bs4', category: 'Bridge & Swap', order: 4, question: 'What is the Swap page?', answer: 'Swap lets you exchange one token for another within the same chain — for example, USDT to USDC or EURC to USDC. NAN uses Circle\'s Swap Kit for on-chain token swaps with real-time rate estimates.' },
        { id: 'bs5', category: 'Bridge & Swap', order: 5, question: 'What is Gateway?', answer: 'Gateway is Circle\'s cross-chain liquidity layer. Depositing USDC into Gateway lets you move funds across chains instantly (under 500ms) without waiting for a full bridge transfer. NAN\'s Gateway page lets you deposit, manage, and transfer via Circle Gateway.' },

        // ── Buy USDC ──
        { id: 'of1', category: 'Buy USDC', order: 1, question: 'How do I buy USDC with real money?', answer: 'Go to Buy USDC. Select an amount, then tap "Buy". The Circle onramp widget will open — you can pay with card, Apple Pay, Google Pay, or bank transfer. Circle handles KYC and compliance. A 1% NAN platform fee applies.' },
        { id: 'of2', category: 'Buy USDC', order: 2, question: 'Are there fees to buy USDC?', answer: 'NAN charges a 1% platform fee on purchases. Circle may also charge a provider fee shown at checkout before you confirm.' },
        { id: 'of3', category: 'Buy USDC', order: 3, question: 'Are there purchase limits?', answer: 'Purchase limits are set by Circle\'s compliance requirements and vary by region and payment method. Contact support if you need higher limits.' },

        // ── Security & Privacy ──
        { id: 'sp1', category: 'Security & Privacy', order: 1, question: 'Who controls my wallet keys?', answer: 'NAN uses Circle\'s programmable wallet infrastructure. For Circle email wallet users, keys are managed by Circle\'s MPC (Multi-Party Computation) system — no single party holds the full key. For wagmi wallet users (MetaMask etc.), you control your own keys.' },
        { id: 'sp2', category: 'Security & Privacy', order: 2, question: 'Is NAN custodial or non-custodial?', answer: 'NAN offers both. Circle email login creates a Circle-managed (custodial) wallet where Circle\'s MPC infrastructure secures the keys. Connecting MetaMask or another external wallet is fully non-custodial — you keep your own keys.' },
        { id: 'sp3', category: 'Security & Privacy', order: 3, question: 'What happens if I lose access to my account?', answer: 'For Circle wallet users, account recovery uses your registered email. Circle\'s MPC infrastructure is designed for recoverability. For external wallets, recovery depends on your own seed phrase — NAN cannot recover external wallets.' },
        { id: 'sp4', category: 'Security & Privacy', order: 4, question: 'Can the NAN Agent spend money without my approval?', answer: 'Only from the Agent Wallet, and only within the spending limits you have set. The agent cannot touch your main NAN wallet balance. Every agent transaction goes through Circle\'s wallet infrastructure and is visible in your Activity feed.' },

        // ── Troubleshooting ──
        { id: 'tr1', category: 'Troubleshooting', order: 1, question: 'My transaction is stuck or pending — what do I do?', answer: 'Check the Activity page for the transaction status. On Arc, transactions normally confirm in under 2 seconds. If it stays pending for more than a minute, the network may be congested. Refresh your balance and try again. Contact Support if the issue persists.' },
        { id: 'tr2', category: 'Troubleshooting', order: 2, question: 'The NAN Agent says "I\'m having trouble reaching the AI backend" — why?', answer: 'This means the AI backend is temporarily unavailable. Basic questions about your balance, transactions, and recurring payments are answered directly from your account data without the AI. Full AI responses will resume automatically when the service recovers.' },
        { id: 'tr3', category: 'Troubleshooting', order: 3, question: 'My Circle PIN popup is not appearing — what do I do?', answer: 'Circle PIN popups can be blocked by browser popup blockers. Make sure nanarc.xyz is allowed to open popups in your browser settings. On mobile, the popup opens as an in-app overlay. If it still does not appear, try refreshing the page and retrying.' },
        { id: 'tr4', category: 'Troubleshooting', order: 4, question: 'How do I contact support?', answer: 'Go to Support from the side drawer. Submit a ticket with your issue description and wallet address. The NAN team will respond as quickly as possible. You can also use the Feedback page to report bugs or suggest improvements.' },
      ],
    })
  }

  // ── Referrals & rewards (Redis-backed) ──────────────────────────────────────
  // Rules: a friend joins through a referral link AND then makes a real on-chain USDC transfer of at
  // least REFERRAL_MIN_TX_USD ($100) AFTER joining → the referrer earns REFERRAL_REWARD_USD ($1).
  // Earnings are shown to the referrer; payouts are requested, approved by an admin, and paid monthly.
  //
  // GET  ?route=referral&wallet=<key>                   referral entry for an identity
  // POST ?route=referral-use     { code, wallet? }      friend joined via a link (credited when they qualify)
  // POST ?route=referral-qualify { wallet, txHash }     friend's $100+ transfer, verified on-chain
  // GET  ?route=rewards-balance&wallet=0x..&handle=x    earned / pending / requested / paid + claims
  // POST ?route=rewards-claim    { wallet, handle? }    request a payout (admin approves in the dashboard)
  if (route === 'referral' || route === 'referral-use' || route === 'referral-qualify' || route === 'rewards-balance' || route === 'rewards-claim') {
    const REWARD = Number(process.env.REFERRAL_REWARD_USD ?? 1) || 1
    const MIN_TX = Number(process.env.REFERRAL_MIN_TX_USD ?? 100) || 100
    type Ref = { handle: string; wallet?: string; joinedAt: number; status: 'pending' | 'qualified'; qualifiedAt?: number; txHash?: string; firstTransfer: boolean }
    type Entry = { code: string; uses: number; qualified?: number; createdAt: number; referrals: Ref[] }
    type Claim = { id: string; wallet: string; handle?: string; amount: number; status: 'pending' | 'approved' | 'rejected' | 'paid'; createdAt: string; updatedAt?: string; txHash?: string; note?: string }

    const redis = getRedis()
    if (!redis) return res.status(503).json({ success: false, ...REDIS_NOT_CONFIGURED })

    const keyOf = (v: unknown) => String(v ?? '').trim().toLowerCase().slice(0, 120)
    const num = (v: unknown) => Number(v ?? 0) || 0
    const load = async (k: string): Promise<Entry | null> => {
      const raw = await redis.get<Entry | string>(`ref:${k}`)
      if (!raw) return null
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Entry
    }
    const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim()
    const rateLimit = async (bucket: string, max: number) => {
      const k = `rl:${bucket}:${ip}`
      const n = await redis.incr(k)
      if (n === 1) await redis.expire(k, 3600)
      return n > max
    }
    const nextPayoutISO = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString() }

    // ── on-chain helpers (Arc) ──
    const rpcUrl = process.env.ARC_RPC_URL ?? process.env.ARC_MAINNET_RPC_URL ?? 'https://rpc.mainnet.arc.io'
    const usdc = (process.env.ARC_USDC_ADDRESS ?? process.env.ARC_MAINNET_USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000').toLowerCase()
    const registry = (process.env.VITE_NAME_REGISTRY ?? process.env.NAME_REGISTRY ?? '') as `0x${string}` | ''
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

    /** 'yes' = handle resolves to wallet, 'no' = resolves to someone else, 'unknown' = couldn't check */
    const handleOwner = async (wallet: string, handle: string): Promise<'yes' | 'no' | 'unknown'> => {
      if (!registry) return 'unknown'
      try {
        const { createPublicClient, http, parseAbi } = await import('viem')
        const client = createPublicClient({ transport: http(rpcUrl) })
        const owner = await client.readContract({ address: registry, abi: parseAbi(['function resolve(string) view returns (address)']), functionName: 'resolve', args: [handle] }) as string
        return owner.toLowerCase() === wallet ? 'yes' : 'no'
      } catch { return 'unknown' }
    }

    const balanceFor = async (wallet: string, handle: string, requireVerifiedHandle: boolean) => {
      let useHandle = ''
      if (handle) {
        const own = await handleOwner(wallet, handle)
        if (own === 'yes' || (own === 'unknown' && !requireVerifiedHandle)) useHandle = handle
      }
      const keys = Array.from(new Set([wallet, ...(useHandle ? [`nan:${useHandle}`] : [])]))
      const entries = (await Promise.all(keys.map(load))).filter((e): e is Entry => !!e)
      const joined = entries.reduce((t, e) => t + (e.uses ?? 0), 0)
      const qualified = entries.reduce((t, e) => t + (e.qualified ?? 0), 0)
      const earned = qualified * REWARD
      const requested = num(await redis.get(`rewards:requested:${wallet}`))
      const paid = num(await redis.get(`rewards:paid:${wallet}`))
      const available = Math.max(0, earned - requested)
      return { joined, qualified, earned, requested, paid, available, handleUsed: useHandle }
    }

    try {
      // ── referral (get or create entry) ──
      if (route === 'referral') {
        const wallet = keyOf(req.query.wallet)
        if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' })
        let entry = await load(wallet)
        if (!entry) {
          const prefix = wallet.startsWith('0x') ? wallet.slice(2, 8) : wallet.replace(/[^a-z0-9]/gi, '').slice(0, 6)
          let h = 0; for (const c of wallet) { h = (h * 31 + c.charCodeAt(0)) >>> 0 }
          const code = (prefix.slice(0, 4) + h.toString(36).slice(0, 3)).toUpperCase()
          entry = { code, uses: 0, qualified: 0, createdAt: Date.now(), referrals: [] }
          await redis.set(`ref:${wallet}`, JSON.stringify(entry))
          await redis.set(`ref:code:${code}`, wallet)
        }
        return res.json({ success: true, ...entry })
      }

      // ── referral-use: a friend joined via a link ──
      if (route === 'referral-use') {
        const { code, wallet } = (req.body ?? {}) as { code?: string; wallet?: string }
        const codeRaw = String(code ?? '').trim()
        if (!codeRaw) return res.status(400).json({ success: false, error: 'code required' })
        if (await rateLimit('refuse', 30)) return res.status(429).json({ success: false, error: 'Too many attempts' })

        const indexed = await redis.get<string>(`ref:code:${codeRaw.toUpperCase()}`)
        let referrerKey = indexed ? String(indexed) : ''
        if (!referrerKey) {
          if (!/^[a-zA-Z0-9-]{2,32}$/.test(codeRaw)) return res.status(404).json({ success: false, error: 'Invalid referral code' })
          referrerKey = `nan:${codeRaw.toLowerCase()}`
        }

        const joined = keyOf(wallet)
        if (!joined) return res.status(400).json({ success: false, error: 'wallet required' })
        if (joined === referrerKey) return res.status(400).json({ success: false, error: 'You cannot refer yourself' })
        const first = await redis.set(`ref:joined:${joined}`, referrerKey, { nx: true })   // one referrer per wallet, ever
        if (!first) return res.json({ success: true, counted: false })

        const existing = await load(referrerKey)
        const entry: Entry = existing ?? { code: codeRaw.toUpperCase(), uses: 0, qualified: 0, createdAt: Date.now(), referrals: [] }
        entry.uses += 1
        entry.referrals = [...(entry.referrals ?? []), { handle: `${joined.slice(0, 6)}…${joined.slice(-4)}`, wallet: joined, joinedAt: Date.now(), status: 'pending' as const, firstTransfer: false }].slice(-200)
        await redis.set(`ref:${referrerKey}`, JSON.stringify(entry))
        if (!existing) await redis.set(`ref:code:${entry.code}`, referrerKey)
        await redis.set(`ref:joinedat:${joined}`, Date.now())
        return res.json({ success: true, counted: true, status: 'pending' })
      }

      // ── referral-qualify: the friend's $100+ transfer, verified on-chain ──
      if (route === 'referral-qualify') {
        const { wallet, txHash } = (req.body ?? {}) as { wallet?: string; txHash?: string }
        const joined = keyOf(wallet)
        const hash = String(txHash ?? '').trim().toLowerCase()
        if (!joined || !/^0x[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ success: false, error: 'wallet and txHash required' })
        if (await rateLimit('refqual', 60)) return res.status(429).json({ success: false, error: 'Too many attempts' })

        const referrerKey = await redis.get<string>(`ref:joined:${joined}`)
        if (!referrerKey) return res.json({ success: true, counted: false, reason: 'not_referred' })
        if (await redis.get(`ref:qualified:${joined}`)) return res.json({ success: true, counted: false, reason: 'already_qualified' })

        const { createPublicClient, http } = await import('viem')
        const client = createPublicClient({ transport: http(rpcUrl) })
        let receipt, block
        try {
          receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` })
          block = await client.getBlock({ blockHash: receipt.blockHash })
        } catch { return res.status(503).json({ success: false, error: 'Could not verify the transaction yet — try again shortly' }) }
        if (receipt.status !== 'success') return res.json({ success: true, counted: false, reason: 'tx_failed' })

        // must happen AFTER the friend joined (otherwise old transfers could be reused)
        const joinedAt = num(await redis.get(`ref:joinedat:${joined}`))
        if (joinedAt && Number(block.timestamp) * 1000 < joinedAt - 60_000) return res.json({ success: true, counted: false, reason: 'before_join' })

        const pad = (a: string) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0')
        const qualifying = receipt.logs.some(l => {
          if (l.address.toLowerCase() !== usdc || l.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || l.topics.length < 3) return false
          const from = String(l.topics[1]).toLowerCase(), to = String(l.topics[2]).toLowerCase()
          if (from !== pad(joined) || to === from) return false
          return Number(BigInt(l.data)) / 1e6 >= MIN_TX
        })
        if (!qualifying) return res.json({ success: true, counted: false, reason: 'below_minimum' })

        // each tx hash can only ever be used once; qualify each friend only once
        if (!(await redis.set(`ref:tx:${hash}`, joined, { nx: true }))) return res.json({ success: true, counted: false, reason: 'tx_used' })
        if (!(await redis.set(`ref:qualified:${joined}`, hash, { nx: true }))) return res.json({ success: true, counted: false, reason: 'already_qualified' })

        const entry = await load(String(referrerKey))
        if (entry) {
          entry.qualified = (entry.qualified ?? 0) + 1
          entry.referrals = (entry.referrals ?? []).map(r => r.wallet === joined ? { ...r, status: 'qualified' as const, qualifiedAt: Date.now(), txHash: hash, firstTransfer: true } : r)
          await redis.set(`ref:${String(referrerKey)}`, JSON.stringify(entry))
        }
        return res.json({ success: true, counted: true })
      }

      // ── rewards-balance ──
      if (route === 'rewards-balance') {
        const wallet = keyOf(req.query.wallet)
        const handle = keyOf(req.query.handle).replace(/^@/, '')
        if (!wallet) return res.status(400).json({ success: false, error: 'wallet required' })
        const b = await balanceFor(wallet, handle, false)
        const ids = (await redis.lrange<string>(`rewards:claims:${wallet}`, 0, 9)) ?? []
        const claims = (await Promise.all(ids.map(async id => { const c = await redis.get<Claim | string>(`rewards:claim:${id}`); return c ? (typeof c === 'string' ? JSON.parse(c) : c) as Claim : null }))).filter((c): c is Claim => !!c)
        return res.json({
          success: true,
          claimable: b.available.toFixed(2),          // available to request a payout for
          totalEarned: b.earned.toFixed(2),
          claimed: b.paid.toFixed(2),                 // already paid out
          requested: b.requested.toFixed(2),          // requested (pending approval / approved / paid)
          referralCount: b.joined,                    // friends who joined
          qualifiedCount: b.qualified,                // friends who made a $100+ transfer
          pendingFriends: Math.max(0, b.joined - b.qualified),
          minTxUsd: MIN_TX, rewardUsd: REWARD, nextPayout: nextPayoutISO(),
          claims: claims.map(c => ({ id: c.id, amount: c.amount.toFixed(2), status: c.status, createdAt: c.createdAt, txHash: c.txHash })),
        })
      }

      // ── rewards-claim: request a payout (admin approves; paid monthly) ──
      const { wallet: w, handle: hnd } = (req.body ?? {}) as { wallet?: string; handle?: string }
      const wallet = keyOf(w)
      const handle = keyOf(hnd).replace(/^@/, '')
      if (!/^0x[0-9a-f]{40}$/.test(wallet)) return res.status(400).json({ success: false, error: 'A wallet address is required' })
      if (await rateLimit('refclaim', 10)) return res.status(429).json({ success: false, error: 'Too many attempts' })
      if (!(await redis.set(`rewards:lock:${wallet}`, '1', { nx: true, ex: 10 }))) return res.status(429).json({ success: false, error: 'Please wait a moment' })

      const b = await balanceFor(wallet, handle, true)   // handle earnings count only if the handle is verifiably yours
      if (b.available < 1) return res.status(400).json({ success: false, error: b.qualified > 0 ? 'No unrequested rewards left.' : 'No rewards to claim yet — a friend must make a $' + MIN_TX + ' transfer first.' })
      const id = `rc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
      const claim: Claim = { id, wallet, handle: b.handleUsed || undefined, amount: Math.round(b.available * 100) / 100, status: 'pending', createdAt: new Date().toISOString() }
      await redis.set(`rewards:claim:${id}`, JSON.stringify(claim))
      await redis.lpush(`rewards:claims:${wallet}`, id)
      await redis.lpush('rewards:claims:all', id)
      await redis.set(`rewards:requested:${wallet}`, String(b.requested + claim.amount))
      return res.json({ success: true, id, amount: claim.amount.toFixed(2), status: 'pending', nextPayout: nextPayoutISO() })
    } catch (e) {
      console.error('[misc/referral]', e)
      return res.status(500).json({ success: false, error: 'Rewards are temporarily unavailable' })
    }
  }

  // ── Push notification routes ───────────────────────────────────────────────
  // Vercel Serverless Functions don't support persistent SSE (activity-stream),
  // so push subscriptions are stored in Redis and VAPID keys exposed here.
  if (route === 'push-vapid-key') {
    const publicKey = process.env.VAPID_PUBLIC_KEY ?? null
    return res.status(200).json({ publicKey })
  }

  if (route === 'push-subscribe') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { address, subscription } = (req.body ?? {}) as { address?: string; subscription?: { endpoint?: string } }
    if (!address || !subscription?.endpoint) return res.status(400).json({ success: false, error: 'address and subscription required' })
    const redis = getRedis()
    if (!redis) return res.status(503).json({ success: false, ...REDIS_NOT_CONFIGURED })
    const key = `push:${address.toLowerCase()}`
    const existing = await redis.get<string[]>(key) ?? []
    const merged = Array.from(new Set([...existing, JSON.stringify(subscription)])).slice(0, 10)
    await redis.set(key, merged, { ex: 60 * 60 * 24 * 90 }) // 90 days
    return res.status(200).json({ success: true })
  }

  if (route === 'push-unsubscribe') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { address, subscription } = (req.body ?? {}) as { address?: string; subscription?: object }
    if (!address) return res.status(200).json({ success: true })
    const redis = getRedis()
    if (!redis) return res.status(200).json({ success: true })
    const key = `push:${address.toLowerCase()}`
    const existing = await redis.get<string[]>(key) ?? []
    const filtered = existing.filter(s => s !== JSON.stringify(subscription))
    await redis.set(key, filtered, { ex: 60 * 60 * 24 * 90 })
    return res.status(200).json({ success: true })
  }

  // ── OTP (send + verify) — merged from api/otp.ts ─────────────────────────
  if (route === 'otp') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { email, action, code } = (req.body ?? {}) as { email?: string; action?: string; code?: string }
    if (!email) return res.status(400).json({ error: 'email required' })
    const kv = getRedis()
    const otpKey = `otp:${email.toLowerCase()}`

    if (action === 'send' || !action) {
      const isProd = process.env.VERCEL_ENV === 'production'
      if (isProd && !process.env.SMTP_HOST) return res.status(503).json({ error: 'Email delivery not configured.' })
      const otp = crypto.randomInt(100000, 1000000).toString()
      const expires = Date.now() + OTP_TTL_SECONDS * 1000
      if (kv) { await kv.set(otpKey, { code: otp, expires }, { ex: OTP_TTL_SECONDS }) }
      else { fallbackOtpStore.set(email, { code: otp, expires }) }
      if (process.env.SMTP_HOST) {
        const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT ?? '465'), secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
        await t.sendMail({ from: process.env.SMTP_USER, to: email, subject: 'Your NAN code', html: `<div style="font-family:Inter,sans-serif;max-width:400px;margin:0 auto"><h2 style="font-size:24px;font-weight:700;color:#0D0D0D">Your code</h2><div style="font-size:42px;font-weight:800;letter-spacing:8px;color:#0D0D0D;margin:24px 0">${otp}</div><p style="color:#5C5C6B;font-size:14px">Valid for 10 minutes. Never share this code.</p></div>` })
      } else { console.log(`[NAN OTP] ${email} → ${otp}`) }
      return res.status(200).json({ ok: true, ...(process.env.SMTP_HOST || isProd ? {} : { code: otp }) })
    }

    if (action === 'verify') {
      let entry: { code: string; expires: number } | null = null
      if (kv) { entry = await kv.get<{ code: string; expires: number }>(otpKey) }
      else { entry = fallbackOtpStore.get(email) ?? null }
      if (!entry) return res.status(400).json({ error: 'No code found. Request a new one.' })
      if (Date.now() > entry.expires) {
        if (kv) await kv.del(otpKey); else fallbackOtpStore.delete(email)
        return res.status(400).json({ error: 'Code expired.' })
      }
      if (entry.code !== code) return res.status(400).json({ error: 'Incorrect code.' })
      if (kv) await kv.del(otpKey); else fallbackOtpStore.delete(email)
      const token = Buffer.from(`${email}:${Date.now()}`).toString('base64')
      if (kv) await kv.set(`session:${token}`, { email, walletAddress: '', walletId: '', createdAt: Date.now() }, { ex: 60 * 60 * 24 * 7 })
      return res.status(200).json({ ok: true, token })
    }
    return res.status(400).json({ error: 'Invalid action' })
  }

  return res.status(400).json({ error: 'Unknown route.' })
}
