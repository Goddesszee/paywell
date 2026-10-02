/**
 * api/agent-wallet.ts — NAN Circle Agent Stack Integration
 *
 * Manages the NAN Agent's own dedicated Circle developer-controlled wallet.
 * This wallet is separate from the user's wallet — it belongs to the agent
 * and is funded by the user as an "agent budget".
 *
 * Routes (all POST):
 *   action=provision    — create wallet set + agent wallet (one-time setup)
 *   action=status       — get agent wallet address, balance, and spend history
 *   action=topup        — create a transfer challenge for user to fund the agent wallet
 *   action=spend        — spend USDC from agent wallet for a service call
 *   action=marketplace  — fetch live services from Circle Agent Marketplace
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'

// ── SDK initialisation (lazy — only when creds are present) ──────────────────

async function getDevClient() {
  const apiKey = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
  if (!apiKey || !entitySecret) return null
  const { initiateDeveloperControlledWalletsClient } = await import('@circle-fin/developer-controlled-wallets')
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── marketplace — no creds needed ────────────────────────────────────────
  if (action === 'marketplace') {
    try {
      const r = await fetch('https://agents.circle.com/services', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      if (r.ok) {
        const ct = r.headers.get('content-type') ?? ''
        if (ct.includes('application/json')) {
          const data = await r.json()
          return res.status(200).json({ services: data, source: 'live' })
        }
      }
    } catch { /* fall through to static */ }

    // Static curated list as fallback
    return res.status(200).json({
      source: 'static',
      services: [
        { id: 'perplexity-research', name: 'Perplexity AI Research', category: 'research', price_usdc: 0.002, description: 'Deep research with cited sources', endpoint: 'https://api.perplexity.ai', payment_methods: ['x402', 'usdc'] },
        { id: 'brave-search', name: 'Brave Search', category: 'search', price_usdc: 0, description: 'Privacy-first web search', endpoint: 'https://api.search.brave.com', payment_methods: ['free'] },
        { id: 'skyscanner-flights', name: 'Skyscanner Flights', category: 'travel', price_usdc: 0, description: 'Flight price search', endpoint: 'https://partners.api.skyscanner.net', payment_methods: ['free'] },
        { id: 'amadeus-hotels', name: 'Amadeus Hotels', category: 'travel', price_usdc: 0, description: 'Hotel availability search', endpoint: 'https://test.api.amadeus.com', payment_methods: ['free'] },
        { id: 'coingecko-prices', name: 'CoinGecko Prices', category: 'data', price_usdc: 0, description: 'Live crypto market data', endpoint: 'https://api.coingecko.com', payment_methods: ['free'] },
        { id: 'exchangerate-fx', name: 'Exchange Rate API', category: 'data', price_usdc: 0, description: 'Live forex exchange rates', endpoint: 'https://v6.exchangerate-api.com', payment_methods: ['free'] },
        { id: 'github-code-search', name: 'GitHub Search', category: 'developer', price_usdc: 0, description: 'Search public repositories and code', endpoint: 'https://api.github.com', payment_methods: ['free'] },
        { id: 'openai-completion', name: 'OpenAI GPT-4o', category: 'ai', price_usdc: 0.001, description: 'General-purpose AI reasoning and generation', endpoint: 'https://api.openai.com', payment_methods: ['x402', 'usdc'] },
      ],
    })
  }

  // All other actions require Circle developer-controlled wallet credentials
  const client = await getDevClient()
  if (!client) {
    return res.status(503).json({
      error: 'Agent wallet credentials not configured. Add CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET to Vercel environment variables.',
      setup_required: true,
    })
  }

  // ── provision — create the agent wallet (one-time) ────────────────────────
  if (action === 'provision') {
    try {
      // 1. Create wallet set
      const wsRes = await client.createWalletSet({
        idempotencyKey: randomUUID(),
        name: 'NAN Agent Wallet Set',
      })
      const walletSetId = wsRes.data?.walletSet?.id
      if (!walletSetId) throw new Error('Failed to create wallet set')

      // 2. Create agent wallet on Arc Testnet (EOA — needed for Gateway nanopayments)
      const wRes = await client.createWallets({
        idempotencyKey: randomUUID(),
        // @ts-expect-error SDK enum may vary
        blockchains: ['ARC-TESTNET'],
        count: 1,
        walletSetId,
        metadata: [{ name: 'NAN Agent Wallet', refId: 'nan-agent-v1' }],
      })
      const wallet = wRes.data?.wallets?.[0]
      if (!wallet) throw new Error('Failed to create agent wallet')

      return res.status(200).json({
        ok: true,
        walletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        walletSetId,
        message: 'Agent wallet provisioned. Store AGENT_WALLET_ID and AGENT_WALLET_ADDRESS in your Vercel environment variables.',
      })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Provisioning failed' })
    }
  }

  // ── status — get balance + spend log ──────────────────────────────────────
  if (action === 'status') {
    const walletId = process.env.AGENT_WALLET_ID
    const address = process.env.AGENT_WALLET_ADDRESS
    if (!walletId || !address) {
      return res.status(200).json({
        provisioned: false,
        message: 'Agent wallet not yet provisioned. Call action=provision to create one.',
      })
    }
    try {
      const balRes = await client.getWalletTokenBalance({ id: walletId })
      const balances = balRes.data?.tokenBalances ?? []
      const usdc = balances.find(b => b.token?.symbol === 'USDC')
      return res.status(200).json({
        provisioned: true,
        walletId,
        address,
        balance_usdc: usdc?.amount ?? '0',
        balances,
      })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Balance check failed' })
    }
  }

  // ── spend — send USDC from agent wallet for a service call ────────────────
  if (action === 'spend') {
    const { recipient, amount_usdc, service_id, memo } = body
    if (!recipient || !amount_usdc) return res.status(400).json({ error: 'recipient and amount_usdc required' })

    const walletId = process.env.AGENT_WALLET_ID
    if (!walletId) return res.status(400).json({ error: 'AGENT_WALLET_ID not set — run action=provision first' })

    // Safety cap: max $0.10 USDC per service call from agent wallet
    if (parseFloat(amount_usdc) > 0.10) {
      return res.status(400).json({ error: 'Agent wallet spend cap is 0.10 USDC per call. Adjust spending policy.' })
    }

    try {
      const txRes = await client.createTransaction({
        idempotencyKey: randomUUID(),
        walletId,
        destinationAddress: recipient,
        // tokenAddress: '' means native token (USDC on Arc)
        tokenAddress: '',
        amount: [amount_usdc],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: memo ?? `NAN Agent payment for ${service_id ?? 'service'}`,
      })
      const txId = txRes.data?.id
      return res.status(200).json({ ok: true, txId, service_id, amount_usdc })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Spend failed' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
