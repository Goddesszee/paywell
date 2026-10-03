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
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'
// randomUUID removed — no longer needed after switching to user-controlled wallets

// ── SDK initialisation ───────────────────────────────────────────────────────

function getUserClient() {
  const apiKey =
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  if (!apiKey) return null
  return initiateUserControlledWalletsClient({ apiKey })
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
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      let r: Response
      try {
        r = await fetch('https://agents.circle.com/services', {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(t)
      }
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

  const client = getUserClient()
  if (!client) {
    return res.status(503).json({
      error: 'Circle API key not configured. Add CIRCLE_USER_CONTROLLED_API_KEY to Vercel environment variables.',
      setup_required: true,
    })
  }

  // ── provision — create user pin + agent wallet (same as main app initialize) ─
  if (action === 'provision') {
    const { userToken } = body
    if (!userToken) return res.status(400).json({ error: 'userToken required' })
    try {
      const response = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      const challengeId = response.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned from Circle')
      return res.status(200).json({ ok: true, challengeId })
    } catch (e) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      // 155106 = user already initialized — treat as success, just list wallets
      if (code === 155106) {
        return res.status(200).json({ ok: true, alreadyInitialized: true })
      }
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Provisioning failed' })
    }
  }

  // ── status — get wallets + balance for a userToken ───────────────────────
  if (action === 'status') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    if (!userToken) {
      // No token — not yet authenticated
      return res.status(200).json({ provisioned: false })
    }
    try {
      const response = await client.listWallets({ userToken })
      const wallets = response.data?.wallets ?? []
      const wallet = wallets.find(w =>
        w.blockchain?.toLowerCase().includes('arc') ||
        w.blockchain?.toLowerCase().includes('testnet')
      ) ?? wallets[0]
      if (!wallet) return res.status(200).json({ provisioned: false })

      // Get balance
      let balance_usdc = '0'
      try {
        const balRes = await client.getWalletTokenBalance({ walletId: wallet.id, userToken })
        const usdc = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
        balance_usdc = usdc?.amount ?? '0'
      } catch { /* leave as 0 */ }

      return res.status(200).json({
        provisioned:  true,
        walletId:     wallet.id,
        address:      wallet.address,
        balance_usdc,
        blockchain:   wallet.blockchain ?? 'ARC-TESTNET',
        accountType:  wallet.accountType ?? 'SCA',
        custodyType:  wallet.custodyType ?? 'ENDUSER',
        createDate:   wallet.createDate ?? null,
        walletState:  wallet.state ?? 'LIVE',
      })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Status check failed' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
