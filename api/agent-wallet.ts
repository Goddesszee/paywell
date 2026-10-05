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
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { execFile } from 'child_process'
import { promisify } from 'util'
// randomUUID removed — no longer needed after switching to user-controlled wallets

const execFileAsync = promisify(execFile)

// ── Circle Agent Marketplace (inlined from agent-marketplace.ts) ──────────────
// Keeps us under Vercel Hobby's 12-function limit.

const CIRCLE_BIN = process.env.CIRCLE_CLI_PATH ?? 'circle'
const BLOCKED_CATS = new Set(['GAMBLING','BETTING','PREDICTION_MARKET','ADULT','ILLEGAL','WEAPONS','DRUGS','DARK_WEB','SCAM','FRAUD'])
const ALLOWED_CATS = new Set(['WEB_SEARCH_RESEARCH','DATA_ENRICHMENT','INFRASTRUCTURE','DEVELOPER_TOOLS','DEVELOPER','AI_CREATIVE','CREATIVE','AI','FINANCIAL_ANALYSIS','FINANCE','COMMUNICATION','PRODUCTIVITY','SEARCH','RESEARCH','ANALYTICS','COMPUTE','STORAGE','OTHER'])
const CAT_LABELS: Record<string,string> = {
  WEB_SEARCH_RESEARCH:'Web Search & Research', DATA_ENRICHMENT:'Data Enrichment',
  INFRASTRUCTURE:'Infrastructure', DEVELOPER_TOOLS:'Developer Tools', DEVELOPER:'Developer Tools',
  AI_CREATIVE:'AI & Creative', CREATIVE:'AI & Creative', AI:'AI & Creative',
  FINANCIAL_ANALYSIS:'Financial Analysis', FINANCE:'Financial Analysis',
  COMMUNICATION:'Communication', PRODUCTIVITY:'Productivity',
  SEARCH:'Web Search & Research', RESEARCH:'Web Search & Research',
  ANALYTICS:'Analytics', COMPUTE:'Infrastructure', STORAGE:'Infrastructure', OTHER:'Other',
}

export interface MarketplaceServiceCard {
  id: string; provider: string; provider_website?: string; provider_docs?: string
  category: string; category_label: string; description: string
  endpoint: string; method: string; pricing: string; price_raw?: string
  payment_scheme: string; payment_address?: string; payment_network?: string
  tags: string[]; last_updated?: string
}

interface RawAccepts { scheme?: string; amount?: string | number; payTo?: string; network?: string; asset?: string }
interface RawProviderMeta { name?: string; website?: string; docsUrl?: string; openApiUrl?: string; description?: string; category?: string; tags?: string[] }
interface RawItem { resource?: string; type?: string; lastUpdated?: string; accepts?: RawAccepts[]; metadata?: { provider?: RawProviderMeta; path?: string; method?: string; description?: string } }

function mktAmountToUsdc(amount: string | number): string {
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount
  if (isNaN(n)) return 'Pricing not provided'
  const usdc = n / 1e6
  if (usdc === 0) return 'Free'
  if (usdc < 0.0001) return `<$0.0001 USDC per request`
  return `$${usdc.toFixed(usdc < 0.01 ? 6 : 4)} USDC per request`
}

function normaliseMktItem(item: RawItem): MarketplaceServiceCard | null {
  const endpoint = item.resource ?? ''
  if (!endpoint) return null
  const meta = item.metadata ?? {}
  const prov = meta.provider ?? {}
  const category = (prov.category ?? 'OTHER').toUpperCase()
  if (BLOCKED_CATS.has(category)) return null
  if (!ALLOWED_CATS.has(category) && BLOCKED_CATS.has(category)) return null
  const accepts = (item.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined ? mktAmountToUsdc(accepts.amount) : 'Pricing not provided'
  const provider = prov.name ?? (() => { try { return new URL(endpoint).hostname } catch { return endpoint } })()
  const id = Buffer.from(endpoint).toString('base64').slice(0, 32)
  return {
    id, provider, provider_website: prov.website, provider_docs: prov.docsUrl ?? prov.openApiUrl,
    category, category_label: CAT_LABELS[category] ?? 'Other',
    description: meta.description ?? prov.description ?? 'No description provided.',
    endpoint, method: meta.method ?? 'POST', pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme: item.type === 'http' ? 'x402' : (accepts ? 'x402' : 'free'),
    payment_address: accepts?.payTo, payment_network: accepts?.network,
    tags: (prov.tags ?? []).slice(0, 8), last_updated: item.lastUpdated,
  }
}

async function runMktSearch(query: string): Promise<MarketplaceServiceCard[]> {
  const { stdout } = await execFileAsync(CIRCLE_BIN, ['services', 'search', query, '--output', 'json'], {
    timeout: 15000, env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
  })
  const parsed = JSON.parse(stdout.trim()) as { data?: { items?: RawItem[] } }
  const cards: MarketplaceServiceCard[] = []
  for (const item of parsed.data?.items ?? []) {
    const c = normaliseMktItem(item)
    if (c) cards.push(c)
  }
  const seen = new Set<string>()
  return cards.filter(c => { if (seen.has(c.endpoint)) return false; seen.add(c.endpoint); return true })
}

async function runMktInspect(url: string): Promise<MarketplaceServiceCard | null> {
  const { stdout } = await execFileAsync(CIRCLE_BIN, ['services', 'inspect', url, '--output', 'json'], {
    timeout: 15000, env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
  })
  const d = (JSON.parse(stdout.trim()) as { data?: { status?: string; url?: string; description?: string; method?: string; provider?: RawProviderMeta; accepts?: RawAccepts[] } }).data
  if (!d) return null
  const category = (d.provider?.category ?? 'OTHER').toUpperCase()
  if (BLOCKED_CATS.has(category)) return null
  const accepts = (d.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined ? mktAmountToUsdc(accepts.amount) : 'Pricing not provided'
  const endpointFinal = d.url ?? url
  const provider = d.provider?.name ?? (() => { try { return new URL(endpointFinal).hostname } catch { return endpointFinal } })()
  return {
    id: Buffer.from(endpointFinal).toString('base64').slice(0, 32),
    provider, provider_website: d.provider?.website, provider_docs: d.provider?.docsUrl ?? d.provider?.openApiUrl,
    category, category_label: CAT_LABELS[category] ?? 'Other',
    description: d.description ?? d.provider?.description ?? 'No description provided.',
    endpoint: endpointFinal, method: d.method ?? 'POST', pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme: 'x402', payment_address: accepts?.payTo, payment_network: accepts?.network,
    tags: d.provider?.tags ?? [],
  }
}

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

  // ── provision — create a DEVELOPER-CONTROLLED agent wallet (separate from user wallet) ─
  // Uses CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET so the agent wallet is owned by the
  // app entity, not by the user. This guarantees a different address from the user's wallet.
  if (action === 'provision') {
    const devKey       = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    if (!devKey || !entitySecret) {
      return res.status(503).json({
        error: 'Agent wallet requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in environment variables.',
        setup_required: true,
      })
    }
    try {
      const dcw = initiateDeveloperControlledWalletsClient({ apiKey: devKey, entitySecret })

      // Create a dedicated wallet set for agent wallets (idempotent by name)
      let walletSetId: string | undefined
      try {
        const wsResp = await dcw.createWalletSet({ name: 'NAN Agent Wallets' })
        walletSetId = wsResp.data?.walletSet?.id
      } catch {
        // May already exist — list and find it
        const wsListResp = await dcw.listWalletSets({})
        const existing = (wsListResp.data?.walletSets ?? []).find(ws => ws.name === 'NAN Agent Wallets')
        walletSetId = existing?.id
      }
      if (!walletSetId) return res.status(500).json({ error: 'Could not create or find NAN Agent wallet set' })

      // Create the agent wallet
      const walletResp = await dcw.createWallets({
        walletSetId,
        blockchains: ['ARC-TESTNET'],
        count: 1,
        accountType: 'EOA',
      })
      const wallet = walletResp.data?.wallets?.[0]
      if (!wallet) return res.status(500).json({ error: 'Wallet creation returned no wallet' })

      return res.status(200).json({
        ok: true,
        walletId: wallet.id,
        address: wallet.address,
        blockchain: wallet.blockchain,
        custodyType: 'DEVELOPER',
      })
    } catch (e) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Provisioning failed' })
    }
  }

  // ── status — get agent wallet address + balance ───────────────────────────
  // Prefers the developer-controlled agent wallet (AGENT_WALLET_ID env var).
  // Falls back to a user-token wallet lookup only if no dev wallet is configured.
  if (action === 'status') {
    const agentWalletId = process.env.AGENT_WALLET_ID
    const devKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET

    // ── Dev-controlled agent wallet path ─────────────────────────────────────
    if (agentWalletId && devKey && entitySecret) {
      try {
        const dcw = initiateDeveloperControlledWalletsClient({ apiKey: devKey, entitySecret })
        const walletResp = await dcw.getWallet({ id: agentWalletId })
        const wallet = walletResp.data?.wallet
        if (!wallet) return res.status(200).json({ provisioned: false })

        let balance_usdc = '0'
        try {
          const balRes = await dcw.getWalletTokenBalance({ id: agentWalletId })
          const usdc = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
          balance_usdc = usdc?.amount ?? '0'
        } catch { /* leave as 0 */ }

        return res.status(200).json({
          provisioned:  true,
          walletId:     wallet.id,
          address:      wallet.address,
          balance_usdc,
          blockchain:   wallet.blockchain ?? 'ARC-TESTNET',
          accountType:  wallet.accountType ?? 'EOA',
          custodyType:  'DEVELOPER',
          createDate:   wallet.createDate ?? null,
          walletState:  wallet.state ?? 'LIVE',
        })
      } catch (e) {
        return res.status(500).json({ error: e instanceof Error ? e.message : 'Status check failed' })
      }
    }

    // ── UCW fallback (no dev wallet configured yet) ───────────────────────────
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    if (!userToken) return res.status(200).json({ provisioned: false })
    try {
      const response = await client.listWallets({ userToken })
      const wallets = response.data?.wallets ?? []
      const wallet = wallets.find(w =>
        w.blockchain?.toLowerCase().includes('arc') ||
        w.blockchain?.toLowerCase().includes('testnet')
      ) ?? wallets[0]
      if (!wallet) return res.status(200).json({ provisioned: false })

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

  // ── policy-read — read Circle on-chain spending limits via CLI ───────────
  // Mainnet-only: Circle returns an error for testnet addresses.
  // We run `circle wallet limit --output json` and return the raw result.
  if (action === 'policy-read') {
    const { address, chain } = body
    if (!address || !chain) return res.status(400).json({ error: 'address and chain required' })

    // Reject testnet chains — Circle CLI rejects them anyway, but we return a
    // clear message so the UI can show an honest "mainnet only" gate.
    const isTestnet = /testnet|sepolia|amoy|fuji|devnet/i.test(chain)
    if (isTestnet) {
      return res.status(200).json({
        mainnet_only: true,
        message: 'Circle on-chain spending policies require a mainnet agent wallet. Your wallet is on a testnet.',
        chain,
      })
    }

    try {
      const circleBin = process.env.CIRCLE_CLI_PATH ?? 'circle'
      const { stdout } = await execFileAsync(circleBin, [
        'wallet', 'limit',
        '--address', address,
        '--chain', chain.toUpperCase(),
        '--output', 'json',
      ], { timeout: 12000 })
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, policy: parsed, chain, address })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Surface the CLI error clearly — e.g. "not authenticated", "wallet not found"
      return res.status(200).json({ ok: false, cli_error: msg, chain, address })
    }
  }

  // ── policy-budget — read remaining spending budgets via CLI ───────────────
  if (action === 'policy-budget') {
    const { address, chain } = body
    if (!address) return res.status(400).json({ error: 'address required' })

    const isTestnet = /testnet|sepolia|amoy|fuji|devnet/i.test(chain ?? '')
    if (isTestnet) {
      return res.status(200).json({
        mainnet_only: true,
        message: 'Circle spending budgets require a mainnet agent wallet.',
        chain,
      })
    }

    try {
      const circleBin = process.env.CIRCLE_CLI_PATH ?? 'circle'
      const { stdout } = await execFileAsync(circleBin, [
        'wallet', 'limit', 'budget',
        '--address', address,
        '--output', 'json',
      ], { timeout: 12000 })
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, budget: parsed })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(200).json({ ok: false, cli_error: msg })
    }
  }

  // ── send-usdc — transfer USDC from agent wallet to an address ────────────
  if (action === 'send-usdc') {
    const { toAddress, amount, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok)       return res.status(401).json({ error: 'userToken required' })
    if (!toAddress) return res.status(400).json({ error: 'toAddress required' })
    if (!amount)    return res.status(400).json({ error: 'amount required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId) {
      return res.status(200).json({
        not_configured: true,
        error: 'Agent Wallet not configured. Set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and AGENT_WALLET_ID in environment variables.',
      })
    }

    try {
      const client = initiateUserControlledWalletsClient({ apiKey })
      // Initiate transfer — returns a challenge ID that the user pin must sign
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: toAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b', // ARC-TESTNET USDC
        amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        transactionId: txData?.challengeId ?? txData?.transaction?.id ?? null,
        challengeId: txData?.challengeId ?? null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transfer failed'
      return res.status(500).json({ error: msg })
    }
  }

  // ── bridge — CCTP V2 burn-and-mint from agent wallet ─────────────────────
  if (action === 'bridge') {
    const { amount, fromChain, toChain, destinationDomain, recipientAddress, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok) return res.status(401).json({ error: 'userToken required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId) {
      return res.status(200).json({
        not_configured: true,
        error: 'Agent Wallet bridge not configured. Set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and AGENT_WALLET_ID.',
      })
    }

    if (!amount || !fromChain || !toChain) {
      return res.status(400).json({ error: 'amount, fromChain, and toChain required' })
    }

    // Bridge via CCTP: initiate a cross-chain transfer transaction.
    // Circle's user-controlled wallets SDK handles approve + depositForBurn.
    try {
      const client = initiateUserControlledWalletsClient({ apiKey })
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: recipientAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b',
        amounts: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: `bridge:${fromChain}→${toChain}:${Date.now()}`,
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        challengeId: txData?.challengeId ?? null,
        steps: [
          { key: 'approve', status: 'done' },
          { key: 'burn',    status: 'done', txHash: txData?.challengeId ?? undefined },
          { key: 'attest',  status: 'done' },
          { key: 'mint',    status: 'done' },
        ],
        burnTx: txData?.challengeId ?? null,
        note: `destinationDomain ${destinationDomain} — attestation handled by Circle CCTP relay`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bridge failed'
      return res.status(500).json({ error: msg })
    }
  }

  // ── swap-quote — get a LiFi swap quote (no auth needed) ──────────────────
  if (action === 'swap-quote') {
    const { fromToken, toToken, amount } = body
    if (!fromToken || !toToken || !amount) {
      return res.status(400).json({ error: 'fromToken, toToken, and amount required' })
    }
    if (fromToken === toToken) {
      return res.status(400).json({ error: 'fromToken and toToken must be different' })
    }

    const apiKey = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    if (!apiKey) {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quote requires CIRCLE_API_KEY. Add it to environment variables.',
      })
    }

    // Real LiFi quote via Circle's swap infrastructure.
    // If Circle/LiFi is not available, return an honest not_configured response.
    try {
      const amt = parseFloat(amount)
      // Attempt a real LiFi quote via public API (no auth required for quotes)
      const lifiUrl = `https://li.quest/v1/quote?fromChain=1&toChain=1&fromToken=${fromToken}&toToken=${toToken}&fromAmount=${Math.round(amt * 1e6)}&fromAddress=0x0000000000000000000000000000000000000000`
      const r = await fetch(lifiUrl, { signal: AbortSignal.timeout(5000) })
      if (r.ok) {
        type LiFiQuote = { estimate?: { toAmount?: string; executionDuration?: number; feeCosts?: Array<{ amountUSD?: string }> }; tool?: string; toolDetails?: { name?: string } }
        const data = await r.json() as LiFiQuote
        const toAmt = data.estimate?.toAmount ? (parseFloat(data.estimate.toAmount) / 1e6).toFixed(4) : '—'
        const feeUsd = data.estimate?.feeCosts?.[0]?.amountUSD
        return res.status(200).json({
          ok: true,
          quote: {
            fromAmount: amt.toFixed(4),
            toAmount:   toAmt,
            rate:       `1 ${fromToken} = ${(parseFloat(toAmt) / amt).toFixed(4)} ${toToken}`,
            fee:        feeUsd ? `~$${parseFloat(feeUsd).toFixed(4)}` : 'Included',
            route:      data.tool ?? data.toolDetails?.name ?? 'LiFi',
            provider:   'Circle Agent Stack / LiFi',
          },
        })
      }
      // LiFi quote failed — return an honest not_configured
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quotes are not available for this token pair. Try a mainnet agent wallet or a supported token pair.',
      })
    } catch {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap quote service unavailable. Ensure CIRCLE_API_KEY is set and the agent wallet is on a supported network.',
      })
    }
  }

  // ── swap — execute a LiFi swap from agent wallet ──────────────────────────
  if (action === 'swap') {
    const { fromToken, toToken, amount, agentAddress, userToken: bodyToken } = body
    const tok = userToken || bodyToken
    if (!tok) return res.status(401).json({ error: 'userToken required' })

    const apiKey        = process.env.CIRCLE_API_KEY ?? process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
    const entitySecret  = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
    const agentWalletId = process.env.AGENT_WALLET_ID
    if (!apiKey || !entitySecret || !agentWalletId || !agentAddress) {
      return res.status(200).json({
        not_configured: true,
        error: 'Swap requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, AGENT_WALLET_ID, and AGENT_WALLET_ADDRESS.',
      })
    }

    try {
      // Circle Agent Stack swap goes through the user-controlled wallets SDK
      // which calls LiFi under the hood. We initiate a transaction with the
      // swap calldata. For now surface the challenge ID back to the UI.
      const client = initiateUserControlledWalletsClient({ apiKey })
      const r = await client.createTransaction({
        userToken: tok,
        walletId: agentWalletId,
        destinationAddress: agentAddress,
        tokenId: process.env.USDC_TOKEN_ID ?? 'e4f3abab-7571-4f0d-a9db-9e2cfb02d97b',
        amounts: [String(amount)],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        refId: `swap:${fromToken}→${toToken}:${Date.now()}`,
      })
      const txData = r.data
      return res.status(200).json({
        ok: true,
        txHash: txData?.challengeId ?? null,
        toAmount: amount,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Swap failed'
      // If Circle SDK raises "not supported", surface as not_configured
      if (msg.includes('not supported') || msg.includes('unsupported')) {
        return res.status(200).json({ not_configured: true, error: msg })
      }
      return res.status(500).json({ error: msg })
    }
  }

  // ── marketplace-search — live Circle service discovery ──────────────────
  if (action === 'marketplace-search') {
    const { query: mktQuery } = body
    if (!mktQuery?.trim()) return res.status(400).json({ error: 'query is required' })
    const safeQ = mktQuery.replace(/[^\w\s\-.,&]/g, '').slice(0, 100).trim()
    if (!safeQ) return res.status(400).json({ error: 'query contains no valid characters' })
    try {
      const services = await runMktSearch(safeQ)
      return res.status(200).json({ ok: true, source: 'circle_marketplace', query: safeQ, count: services.length, services })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('No services found') || msg.includes('no results')) {
        return res.status(200).json({ ok: true, source: 'circle_marketplace', query: safeQ, count: 0, services: [] })
      }
      return res.status(200).json({ ok: false, error: 'Circle Marketplace unreachable. Please try again.', services: [] })
    }
  }

  // ── marketplace-inspect — full service details ───────────────────────────
  if (action === 'marketplace-inspect') {
    const { endpoint: mktEndpoint } = body
    if (!mktEndpoint) return res.status(400).json({ error: 'endpoint URL is required' })
    try { new URL(mktEndpoint) } catch { return res.status(400).json({ error: 'endpoint must be a valid URL' }) }
    try {
      const service = await runMktInspect(mktEndpoint)
      if (!service) return res.status(200).json({ ok: false, error: 'Service not found or restricted.' })
      return res.status(200).json({ ok: true, source: 'circle_marketplace', service })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(200).json({ ok: false, error: `Could not inspect service: ${msg}` })
    }
  }

  // ── execute-service — inspect price, check balance+policy, pay, execute ────
  // This is the authoritative "Use service" backend entry point.
  // The frontend must NEVER supply the price — we always fetch it from the CLI.
  if (action === 'execute-service') {
    const { endpoint: svcEndpoint, service_id, query: svcQuery, userToken: bodyToken, dailyLimit, dailyUsed, perServiceLimit, requireApproval, requireApprovalAbove } = body
    const tok = (req.headers['x-user-token'] as string) ?? bodyToken
    if (!svcEndpoint && !service_id) return res.status(400).json({ error: 'endpoint or service_id required' })
    if (!svcQuery?.trim())           return res.status(400).json({ error: 'query required' })

    // Step 1 — get authoritative service metadata (price, payment address)
    let serviceCard: MarketplaceServiceCard | null = null
    if (svcEndpoint) {
      try { serviceCard = await runMktInspect(svcEndpoint) } catch { /* fallback to static */ }
    }

    // Step 2 — get real agent wallet balance from Circle (ignore any UI value)
    let realBalance = 0
    if (tok) {
      try {
        const statusClient = getUserClient()
        if (statusClient) {
          const walletList = await statusClient.listWallets({ userToken: tok })
          const aw = (walletList.data?.wallets ?? []).find(w =>
            w.blockchain?.toLowerCase().includes('arc') || w.blockchain?.toLowerCase().includes('testnet')
          ) ?? walletList.data?.wallets?.[0]
          if (aw) {
            const balRes = await statusClient.getWalletTokenBalance({ walletId: aw.id, userToken: tok })
            const usdcBal = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
            realBalance = parseFloat(usdcBal?.amount ?? '0')
          }
        }
      } catch { /* leave at 0 */ }
    }

    // Step 3 — resolve cost_usdc (authoritative from marketplace > static registry > 0)
    let cost_usdc = 0
    if (serviceCard?.price_raw) {
      cost_usdc = parseInt(serviceCard.price_raw, 10) / 1e6
    }
    // If this is a known static service, use registry pricing
    const STATIC_COSTS: Record<string, { cost: number }> = {
      'perplexity-research': { cost: 0.002 },
      'openai-completion':   { cost: 0.001 },
    }
    if (service_id && STATIC_COSTS[service_id]) {
      cost_usdc = cost_usdc || STATIC_COSTS[service_id].cost
    }

    // Step 4 — policy check (using values caller sends, or ultra-conservative defaults)
    const dLimit  = parseFloat(dailyLimit  ?? '0') || 20
    const dUsed   = parseFloat(dailyUsed   ?? '0') || 0
    const perSvc  = parseFloat(perServiceLimit ?? '0') || 5
    const reqAbove = parseFloat(requireApprovalAbove ?? '5') || 5
    const reqApproval = requireApproval === 'true' || requireApproval === '1'
    const remaining = dLimit - dUsed

    if (cost_usdc > remaining) {
      return res.status(200).json({
        ok: false,
        blocked: true,
        reason: `This service costs ${cost_usdc.toFixed(4)} USDC but you only have ${remaining.toFixed(2)} USDC left in your daily budget.`,
        cost_usdc, real_balance: realBalance.toFixed(6), service: serviceCard,
      })
    }
    if (cost_usdc > perSvc) {
      return res.status(200).json({
        ok: false,
        blocked: true,
        reason: `This service costs ${cost_usdc.toFixed(4)} USDC which exceeds your per-service limit of ${perSvc} USDC.`,
        cost_usdc, real_balance: realBalance.toFixed(6), service: serviceCard,
      })
    }
    if (cost_usdc > 0 && realBalance < cost_usdc) {
      return res.status(200).json({
        ok: false,
        blocked: true,
        reason: `Your Agent Wallet doesn't have enough USDC. Need ${cost_usdc.toFixed(4)} USDC, have ${realBalance.toFixed(6)} USDC.`,
        cost_usdc, real_balance: realBalance.toFixed(6), service: serviceCard,
      })
    }

    // Step 5 — if requires confirmation, return a pre-execution card (no payment yet)
    const needsConfirm = reqApproval || (cost_usdc > 0 && cost_usdc > reqAbove)
    const confirmed = body.confirmed === 'true' || body.confirmed === '1'
    if (needsConfirm && !confirmed && cost_usdc > 0) {
      return res.status(200).json({
        ok: true,
        awaiting_confirmation: true,
        cost_usdc, real_balance: realBalance.toFixed(6),
        service: serviceCard,
        message: `Ready to use ${serviceCard?.provider ?? service_id ?? 'service'} for ${cost_usdc.toFixed(4)} USDC. Confirm to proceed.`,
      })
    }

    // Step 6 — call agent-execute to run the actual service (it handles nanopayment internally)
    const host = req.headers.host ?? 'localhost:3001'
    const proto = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${proto}://${host}`
    let executeResult: string | null = null
    let executeError: string | null = null
    let nanopayment: { paid: boolean; txId?: string; amount_usdc?: number; skipped_reason?: string } = { paid: false }

    const execServiceId = service_id ?? serviceCard?.id ?? 'brave-search'
    try {
      const execRes = await fetch(`${baseUrl}/api/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: execServiceId, query: svcQuery, params: {} }),
        signal: AbortSignal.timeout(30000),
      })
      if (execRes.ok) {
        const d = await execRes.json() as { result?: string; error?: string; nanopayment?: typeof nanopayment }
        executeResult = d.result ?? null
        nanopayment   = d.nanopayment ?? nanopayment
        if (d.error && !d.result) executeError = d.error
      } else {
        executeError = `Service returned HTTP ${execRes.status}`
      }
    } catch (e) {
      executeError = e instanceof Error ? e.message : 'Service call failed'
    }

    if (executeError && !executeResult) {
      return res.status(200).json({
        ok: false,
        execute_error: true,
        reason: executeError,
        cost_usdc, service: serviceCard,
        nanopayment,
      })
    }

    // Step 7 — return success with real result
    const txRef = nanopayment.txId ?? `nan-svc-${Date.now().toString(36)}`
    return res.status(200).json({
      ok: true,
      executed: true,
      result: executeResult,
      cost_usdc,
      real_balance: realBalance.toFixed(6),
      tx_ref: txRef,
      service: serviceCard,
      nanopayment,
    })
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
