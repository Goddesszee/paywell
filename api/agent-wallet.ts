/**
 * api/agent-wallet.ts — NAN Personal Agent Wallet
 *
 * Every authenticated NAN user gets their OWN Circle developer-controlled
 * wallet for their AI agent. Wallets are stored in Redis keyed by the
 * user's email address (extracted from their NAN session token).
 *
 * Architecture:
 *   NAN USER (identified by session token → email)
 *     └── AGENT WALLET (separate Circle wallet, stored in Redis)
 *           ├── walletId      (Circle internal ID)
 *           ├── walletSetId   (Circle wallet set ID)
 *           ├── address       (on-chain address)
 *           ├── blockchain    (ARC-TESTNET)
 *           └── createdAt     (ISO timestamp)
 *
 * Routes (all POST):
 *   action=status     — get this user's agent wallet + balance
 *   action=provision  — create wallet for this user (idempotent)
 *   action=spend      — spend USDC from this user's agent wallet
 *   action=marketplace — public list of agent services (no auth needed)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'

// ── Redis key helpers ─────────────────────────────────────────────────────────

function agentWalletKey(email: string) {
  return `agent_wallet:${email.toLowerCase().trim()}`
}

interface AgentWalletRecord {
  walletId: string
  walletSetId: string
  address: string
  blockchain: string
  createdAt: string
}

// ── Auth: extract email from NAN session token ────────────────────────────────
// NAN session tokens are base64(email:timestamp) — same encoding as api/otp.ts

async function getUserEmail(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.body as Record<string, string>)?.sessionToken ?? ''

  if (!token) return null

  // 1. Try Redis session lookup (preferred — validates token is still live)
  try {
    const { getRedis } = await import('./_redis')
    const kv = getRedis()
    if (kv) {
      const session = await kv.get<{ email: string }>(`session:${token}`)
      if (session?.email) return session.email.toLowerCase().trim()
    }
  } catch { /* fall through to base64 decode */ }

  // 2. Fallback: base64 decode (works even without Redis)
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const [email] = decoded.split(':')
    if (email && email.includes('@')) return email.toLowerCase().trim()
  } catch { /* invalid token */ }

  return null
}

// ── Circle developer-controlled wallet client ─────────────────────────────────

async function getDevClient() {
  const apiKey = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
  if (!apiKey || !entitySecret) return null
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets')
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── marketplace — public, no auth needed ─────────────────────────────────
  if (action === 'marketplace') {
    try {
      const r = await fetch('https://agents.circle.com/services', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (r.ok) {
        const ct = r.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          return res.status(200).json({ services: await r.json(), source: 'live' })
        }
      }
    } catch { /* fall through */ }

    return res.status(200).json({
      source: 'static',
      services: [
        { id: 'perplexity-research', name: 'Perplexity AI Research',  category: 'research',  price_usdc: 0.002, description: 'Deep research with cited sources' },
        { id: 'brave-search',        name: 'Brave Search',            category: 'search',    price_usdc: 0,     description: 'Privacy-first web search' },
        { id: 'coingecko-prices',    name: 'CoinGecko Prices',        category: 'data',      price_usdc: 0,     description: 'Live crypto market data' },
        { id: 'exchangerate-fx',     name: 'Exchange Rate API',       category: 'data',      price_usdc: 0,     description: 'Live forex exchange rates' },
        { id: 'github-code-search',  name: 'GitHub Search',           category: 'developer', price_usdc: 0,     description: 'Search public repositories' },
        { id: 'openai-completion',   name: 'OpenAI GPT-4o',           category: 'ai',        price_usdc: 0.001, description: 'AI reasoning and generation' },
      ],
    })
  }

  // ── All other actions require authentication ──────────────────────────────
  const email = await getUserEmail(req)
  if (!email) {
    return res.status(401).json({
      error: 'Not authenticated. Please log in to NAN first.',
      auth_required: true,
    })
  }

  // ── All wallet actions require Circle credentials ─────────────────────────
  const client = await getDevClient()
  if (!client) {
    return res.status(503).json({
      error: 'Agent wallet service not available. Add CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET to Vercel environment variables.',
      setup_required: true,
    })
  }

  // ── Redis for per-user wallet persistence ────────────────────────────────
  const { getRedis } = await import('./_redis')
  const kv = getRedis()

  // ── status — get this user's agent wallet + live balance ─────────────────
  if (action === 'status') {
    try {
      // Look up this user's wallet record
      const record = kv ? await kv.get<AgentWalletRecord>(agentWalletKey(email)) : null

      if (!record?.walletId || !record?.address) {
        return res.status(200).json({ provisioned: false })
      }

      // Fetch live balance from Circle
      let balance_usdc = '0'
      try {
        const balRes = await client.getWalletTokenBalance({ id: record.walletId })
        const balances = balRes.data?.tokenBalances ?? []
        const usdc = balances.find(b => b.token?.symbol === 'USDC')
        balance_usdc = usdc?.amount ?? '0'
      } catch { /* non-fatal — return stale balance */ }

      return res.status(200).json({
        provisioned: true,
        walletId: record.walletId,
        address: record.address,
        blockchain: record.blockchain,
        createdAt: record.createdAt,
        balance_usdc,
      })
    } catch (e) {
      console.error('[agent-wallet] status error:', e instanceof Error ? e.message : e)
      return res.status(500).json({ error: 'Failed to load wallet status.' })
    }
  }

  // ── provision — create wallet for this user (idempotent) ─────────────────
  if (action === 'provision') {
    try {
      // Idempotency: if user already has a wallet, return it
      if (kv) {
        const existing = await kv.get<AgentWalletRecord>(agentWalletKey(email))
        if (existing?.walletId && existing?.address) {
          console.log(`[agent-wallet] returning existing wallet for ${email}`)
          return res.status(200).json({
            ok: true,
            walletId: existing.walletId,
            address: existing.address,
            blockchain: existing.blockchain,
            createdAt: existing.createdAt,
            already_existed: true,
          })
        }
      }

      console.log(`[agent-wallet] creating new wallet for ${email}`)

      // 1. Create a wallet set scoped to this user
      const safeEmail = email.replace(/[^a-z0-9]/gi, '-').slice(0, 40)
      const wsRes = await client.createWalletSet({
        idempotencyKey: randomUUID(),
        name: `NAN Agent — ${safeEmail}`,
      })
      const walletSetId = wsRes.data?.walletSet?.id
      if (!walletSetId) throw new Error('Failed to create wallet set')

      // 2. Create the agent wallet on Arc Testnet
      const wRes = await client.createWallets({
        idempotencyKey: randomUUID(),
        // @ts-expect-error SDK enum varies by version
        blockchains: ['ARC-TESTNET'],
        count: 1,
        walletSetId,
        metadata: [{ name: `NAN Agent Wallet — ${safeEmail}`, refId: `nan-agent-${safeEmail}` }],
      })
      const wallet = wRes.data?.wallets?.[0]
      if (!wallet?.address) throw new Error('Failed to create agent wallet — no address returned')

      const record: AgentWalletRecord = {
        walletId: wallet.id,
        walletSetId,
        address: wallet.address,
        blockchain: wallet.blockchain ?? 'ARC-TESTNET',
        createdAt: new Date().toISOString(),
      }

      // 3. Persist to Redis against this user's email
      if (kv) {
        await kv.set(agentWalletKey(email), record)
        console.log(`[agent-wallet] saved wallet ${wallet.id} for ${email}`)
      } else {
        // No Redis — wallet was created but can't be persisted server-side.
        // Return it anyway; the frontend will cache it in Zustand.
        console.warn('[agent-wallet] Redis not configured — wallet created but not persisted server-side')
      }

      return res.status(200).json({
        ok: true,
        walletId: record.walletId,
        address: record.address,
        blockchain: record.blockchain,
        createdAt: record.createdAt,
        walletSetId,
      })
    } catch (e) {
      console.error('[agent-wallet] provision error:', e instanceof Error ? e.message : e)
      return res.status(500).json({ error: 'Wallet creation failed. Please try again.' })
    }
  }

  // ── spend — send USDC from this user's agent wallet ───────────────────────
  if (action === 'spend') {
    const { recipient, amount_usdc, service_id, memo } = body
    if (!recipient || !amount_usdc) {
      return res.status(400).json({ error: 'recipient and amount_usdc required' })
    }

    // Look up this user's wallet
    const record = kv ? await kv.get<AgentWalletRecord>(agentWalletKey(email)) : null
    if (!record?.walletId) {
      return res.status(400).json({ error: 'No agent wallet found. Create one first.' })
    }

    // Safety cap: $10 USDC max per agent call
    if (parseFloat(amount_usdc) > 10) {
      return res.status(400).json({ error: 'Maximum $10 USDC per agent payment.' })
    }

    try {
      const txRes = await client.createTransaction({
        idempotencyKey: randomUUID(),
        walletId: record.walletId,
        destinationAddress: recipient,
        tokenAddress: '',
        amount: [amount_usdc],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: memo ?? `NAN Agent — ${service_id ?? 'service'}`,
      })
      return res.status(200).json({ ok: true, txId: txRes.data?.id, service_id, amount_usdc })
    } catch (e) {
      console.error('[agent-wallet] spend error:', e instanceof Error ? e.message : e)
      return res.status(500).json({ error: 'Payment failed.' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
