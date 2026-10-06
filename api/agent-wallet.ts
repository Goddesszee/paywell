/**
 * api/agent-wallet.ts — NAN Circle Agent Stack
 *
 * The agent wallet is a Circle user-controlled wallet (UCW) — the user retains
 * custody via 2-of-2 MPC. This is the correct model per Circle's Agent Stack docs.
 *
 * Actions (all POST):
 *   provision          Create user PIN + agent wallet (first-time setup)
 *   status             Get agent wallet address + balance for a userToken
 *   marketplace        Fetch live services from Circle Agent Marketplace
 *   marketplace-search Search Circle Agent Marketplace via Circle CLI
 *   marketplace-inspect Get full details of a service by URL
 *   execute-service    Policy-check + pay + call an external service
 *   policy-read        Read Circle on-chain spending policy (mainnet only)
 *   policy-budget      Read remaining spending budgets (mainnet only)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

// Arc Testnet USDC ERC-20 contract address
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'
// CCTP V2 TokenMessengerV2 on Arc Testnet
const ARC_TESTNET_TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'

const execFileAsync = promisify(execFile)

// ── helpers ──────────────────────────────────────────────────────────────────

function apiKey(): string | undefined {
  return (
    process.env.CIRCLE_USER_CONTROLLED_API_KEY ??
    process.env.CIRCLE_API_KEY ??
    process.env.CIRCLE_DEVELOPER_CONTROLLED_API_KEY
  )
}

function ucwClient() {
  const key = apiKey()
  if (!key) throw new Error('CIRCLE_API_KEY not configured')
  return initiateUserControlledWalletsClient({ apiKey: key })
}

function err(res: VercelResponse, status: number, message: string) {
  return res.status(status).json({ error: message })
}

// ── Circle Agent Marketplace ──────────────────────────────────────────────────

const CIRCLE_BIN = process.env.CIRCLE_CLI_PATH ?? 'circle'

const BLOCKED_CATS = new Set([
  'GAMBLING', 'BETTING', 'PREDICTION_MARKET', 'ADULT',
  'ILLEGAL', 'WEAPONS', 'DRUGS', 'DARK_WEB', 'SCAM', 'FRAUD',
])

const ALLOWED_CATS = new Set([
  'WEB_SEARCH_RESEARCH', 'DATA_ENRICHMENT', 'INFRASTRUCTURE',
  'DEVELOPER_TOOLS', 'DEVELOPER', 'AI_CREATIVE', 'CREATIVE', 'AI',
  'FINANCIAL_ANALYSIS', 'FINANCE', 'COMMUNICATION', 'PRODUCTIVITY',
  'SEARCH', 'RESEARCH', 'ANALYTICS', 'COMPUTE', 'STORAGE', 'OTHER',
])

const CAT_LABELS: Record<string, string> = {
  WEB_SEARCH_RESEARCH: 'Web Search & Research',
  DATA_ENRICHMENT: 'Data Enrichment',
  INFRASTRUCTURE: 'Infrastructure',
  DEVELOPER_TOOLS: 'Developer Tools',
  DEVELOPER: 'Developer Tools',
  AI_CREATIVE: 'AI & Creative',
  CREATIVE: 'AI & Creative',
  AI: 'AI & Creative',
  FINANCIAL_ANALYSIS: 'Financial Analysis',
  FINANCE: 'Financial Analysis',
  COMMUNICATION: 'Communication',
  PRODUCTIVITY: 'Productivity',
  SEARCH: 'Web Search & Research',
  RESEARCH: 'Web Search & Research',
  ANALYTICS: 'Analytics',
  COMPUTE: 'Infrastructure',
  STORAGE: 'Infrastructure',
  OTHER: 'Other',
}

export interface MarketplaceServiceCard {
  id: string
  provider: string
  provider_website?: string
  provider_docs?: string
  category: string
  category_label: string
  description: string
  endpoint: string
  method: string
  pricing: string
  price_raw?: string
  payment_scheme: string
  payment_address?: string
  payment_network?: string
  tags: string[]
  last_updated?: string
}

interface RawAccepts {
  scheme?: string
  amount?: string | number
  payTo?: string
  network?: string
  asset?: string
}

interface RawProviderMeta {
  name?: string
  website?: string
  docsUrl?: string
  openApiUrl?: string
  description?: string
  category?: string
  tags?: string[]
}

interface RawItem {
  resource?: string
  type?: string
  lastUpdated?: string
  accepts?: RawAccepts[]
  metadata?: {
    provider?: RawProviderMeta
    path?: string
    method?: string
    description?: string
  }
}

function amountToUsdc(amount: string | number): string {
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount
  if (isNaN(n)) return 'Pricing not provided'
  const usdc = n / 1e6
  if (usdc === 0) return 'Free'
  if (usdc < 0.0001) return '<$0.0001 USDC per request'
  return `$${usdc.toFixed(usdc < 0.01 ? 6 : 4)} USDC per request`
}

function normaliseItem(item: RawItem): MarketplaceServiceCard | null {
  const endpoint = item.resource ?? ''
  if (!endpoint) return null
  const meta = item.metadata ?? {}
  const prov = meta.provider ?? {}
  const category = (prov.category ?? 'OTHER').toUpperCase()
  if (BLOCKED_CATS.has(category)) return null
  if (!ALLOWED_CATS.has(category) && BLOCKED_CATS.has(category)) return null
  const accepts = (item.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined ? amountToUsdc(accepts.amount) : 'Pricing not provided'
  const provider = prov.name ?? (() => { try { return new URL(endpoint).hostname } catch { return endpoint } })()
  const id = Buffer.from(endpoint).toString('base64').slice(0, 32)
  return {
    id, provider,
    provider_website: prov.website,
    provider_docs: prov.docsUrl ?? prov.openApiUrl,
    category,
    category_label: CAT_LABELS[category] ?? 'Other',
    description: meta.description ?? prov.description ?? 'No description provided.',
    endpoint,
    method: meta.method ?? 'POST',
    pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme: item.type === 'http' ? 'x402' : (accepts ? 'x402' : 'free'),
    payment_address: accepts?.payTo,
    payment_network: accepts?.network,
    tags: (prov.tags ?? []).slice(0, 8),
    last_updated: item.lastUpdated,
  }
}

async function cliSearch(query: string): Promise<MarketplaceServiceCard[]> {
  const { stdout } = await execFileAsync(
    CIRCLE_BIN,
    ['services', 'search', query, '--output', 'json'],
    { timeout: 15_000, env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' } }
  )
  const parsed = JSON.parse(stdout.trim()) as { data?: { items?: RawItem[] } }
  const cards: MarketplaceServiceCard[] = []
  for (const item of parsed.data?.items ?? []) {
    const c = normaliseItem(item)
    if (c) cards.push(c)
  }
  const seen = new Set<string>()
  return cards.filter(c => {
    if (seen.has(c.endpoint)) return false
    seen.add(c.endpoint)
    return true
  })
}

async function cliInspect(url: string): Promise<MarketplaceServiceCard | null> {
  const { stdout } = await execFileAsync(
    CIRCLE_BIN,
    ['services', 'inspect', url, '--output', 'json'],
    { timeout: 15_000, env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' } }
  )
  type InspectData = {
    status?: string; url?: string; description?: string; method?: string
    provider?: RawProviderMeta; accepts?: RawAccepts[]
  }
  const d = (JSON.parse(stdout.trim()) as { data?: InspectData }).data
  if (!d) return null
  const category = (d.provider?.category ?? 'OTHER').toUpperCase()
  if (BLOCKED_CATS.has(category)) return null
  const accepts = (d.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined ? amountToUsdc(accepts.amount) : 'Pricing not provided'
  const endpointFinal = d.url ?? url
  const provider = d.provider?.name ?? (() => { try { return new URL(endpointFinal).hostname } catch { return endpointFinal } })()
  return {
    id: Buffer.from(endpointFinal).toString('base64').slice(0, 32),
    provider,
    provider_website: d.provider?.website,
    provider_docs: d.provider?.docsUrl ?? d.provider?.openApiUrl,
    category,
    category_label: CAT_LABELS[category] ?? 'Other',
    description: d.description ?? d.provider?.description ?? 'No description provided.',
    endpoint: endpointFinal,
    method: d.method ?? 'POST',
    pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme: 'x402',
    payment_address: accepts?.payTo,
    payment_network: accepts?.network,
    tags: d.provider?.tags ?? [],
  }
}

// Static service fallback (shown when live marketplace is unreachable)
const STATIC_SERVICES = [
  { id: 'perplexity-research', name: 'Perplexity AI Research', category: 'research', price_usdc: 0.002, description: 'Deep research with cited sources', endpoint: 'https://api.perplexity.ai', payment_methods: ['x402', 'usdc'] },
  { id: 'brave-search',        name: 'Brave Search',          category: 'search',   price_usdc: 0,     description: 'Privacy-first web search',     endpoint: 'https://api.search.brave.com', payment_methods: ['free'] },
  { id: 'skyscanner-flights',  name: 'Skyscanner Flights',    category: 'travel',   price_usdc: 0,     description: 'Flight price search',           endpoint: 'https://partners.api.skyscanner.net', payment_methods: ['free'] },
  { id: 'amadeus-hotels',      name: 'Amadeus Hotels',        category: 'travel',   price_usdc: 0,     description: 'Hotel availability search',     endpoint: 'https://test.api.amadeus.com', payment_methods: ['free'] },
  { id: 'coingecko-prices',    name: 'CoinGecko Prices',      category: 'data',     price_usdc: 0,     description: 'Live crypto market data',       endpoint: 'https://api.coingecko.com', payment_methods: ['free'] },
  { id: 'exchangerate-fx',     name: 'Exchange Rate API',     category: 'data',     price_usdc: 0,     description: 'Live forex exchange rates',      endpoint: 'https://v6.exchangerate-api.com', payment_methods: ['free'] },
  { id: 'github-code-search',  name: 'GitHub Search',         category: 'developer',price_usdc: 0,     description: 'Search public repos and code',  endpoint: 'https://api.github.com', payment_methods: ['free'] },
  { id: 'openai-completion',   name: 'OpenAI GPT-4o',         category: 'ai',       price_usdc: 0.001, description: 'General-purpose AI reasoning',  endpoint: 'https://api.openai.com', payment_methods: ['x402', 'usdc'] },
]

// ── main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = (req.body ?? {}) as Record<string, string>
  const action = body.action ?? (req.query.action as string)

  // ── marketplace — no auth needed ─────────────────────────────────────────
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
    } catch { /* fall through */ }
    return res.status(200).json({ source: 'static', services: STATIC_SERVICES })
  }

  // ── marketplace-search — Circle CLI ──────────────────────────────────────
  if (action === 'marketplace-search') {
    const { query } = body
    if (!query?.trim()) return err(res, 400, 'query required')
    const safe = query.replace(/[^\w\s\-.,&]/g, '').slice(0, 100).trim()
    if (!safe) return err(res, 400, 'query contains no valid characters')
    try {
      const services = await cliSearch(safe)
      return res.status(200).json({ ok: true, source: 'circle_marketplace', query: safe, count: services.length, services })
    } catch {
      return res.status(200).json({ ok: false, error: 'Circle Marketplace unreachable. Please try again.', services: [] })
    }
  }

  // ── marketplace-inspect — full service details ────────────────────────────
  if (action === 'marketplace-inspect') {
    const { endpoint } = body
    if (!endpoint) return err(res, 400, 'endpoint URL required')
    try { new URL(endpoint) } catch { return err(res, 400, 'endpoint must be a valid URL') }
    try {
      const service = await cliInspect(endpoint)
      if (!service) return res.status(200).json({ ok: false, error: 'Service not found or restricted.' })
      return res.status(200).json({ ok: true, source: 'circle_marketplace', service })
    } catch (e) {
      return res.status(200).json({ ok: false, error: `Could not inspect service: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  // ── policy-read — Circle on-chain spending policy (mainnet only) ──────────
  if (action === 'policy-read') {
    const { address, chain } = body
    if (!address || !chain) return err(res, 400, 'address and chain required')
    if (/testnet|sepolia|amoy|fuji|devnet/i.test(chain)) {
      return res.status(200).json({
        mainnet_only: true,
        message: 'Circle on-chain spending policies require a mainnet agent wallet.',
        chain,
      })
    }
    try {
      const { stdout } = await execFileAsync(
        CIRCLE_BIN,
        ['wallet', 'limit', '--address', address, '--chain', chain.toUpperCase(), '--output', 'json'],
        { timeout: 12000 }
      )
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, policy: parsed, chain, address })
    } catch (e) {
      return res.status(200).json({ ok: false, cli_error: e instanceof Error ? e.message : String(e), chain, address })
    }
  }

  // ── policy-budget — remaining spending budgets (mainnet only) ─────────────
  if (action === 'policy-budget') {
    const { address, chain } = body
    if (!address) return err(res, 400, 'address required')
    if (/testnet|sepolia|amoy|fuji|devnet/i.test(chain ?? '')) {
      return res.status(200).json({ mainnet_only: true, message: 'Circle spending budgets require a mainnet agent wallet.', chain })
    }
    try {
      const { stdout } = await execFileAsync(
        CIRCLE_BIN,
        ['wallet', 'limit', 'budget', '--address', address, '--output', 'json'],
        { timeout: 12000 }
      )
      let parsed: unknown
      try { parsed = JSON.parse(stdout.trim()) } catch { parsed = { raw: stdout.trim() } }
      return res.status(200).json({ ok: true, budget: parsed })
    } catch (e) {
      return res.status(200).json({ ok: false, cli_error: e instanceof Error ? e.message : String(e) })
    }
  }

  // ── from here, all actions require a valid Circle API key ─────────────────
  let client: ReturnType<typeof ucwClient>
  try {
    client = ucwClient()
  } catch {
    return res.status(503).json({
      error: 'Circle API key not configured. Add CIRCLE_API_KEY to Vercel environment variables.',
      setup_required: true,
    })
  }

  // ── provision — create user PIN + agent wallet ───────────────────────────
  // Uses UCW createUserPinWithWallets — user retains custody (correct for Agent Stack)
  if (action === 'provision') {
    const { userToken } = body
    if (!userToken) return err(res, 400, 'userToken required')
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
      // 155106 = user already initialized — not an error
      if (code === 155106) return res.status(200).json({ ok: true, alreadyInitialized: true })
      return err(res, 500, e instanceof Error ? e.message : 'Provisioning failed')
    }
  }

  // ── status — get agent wallet address + balance ───────────────────────────
  if (action === 'status') {
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
        provisioned: true,
        walletId:    wallet.id,
        address:     wallet.address,
        balance_usdc,
        blockchain:  wallet.blockchain ?? 'ARC-TESTNET',
        accountType: wallet.accountType ?? 'SCA',
        custodyType: wallet.custodyType ?? 'ENDUSER',
        createDate:  wallet.createDate ?? null,
        walletState: wallet.state ?? 'LIVE',
      })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Status check failed')
    }
  }

  // ── execute-service — policy-check, pay via x402/UCW, call service ────────
  if (action === 'execute-service') {
    const {
      endpoint: svcEndpoint, service_id, query: svcQuery,
      userToken: bodyToken,
      dailyLimit, dailyUsed, perServiceLimit,
      requireApproval, requireApprovalAbove,
    } = body
    const userToken = (req.headers['x-user-token'] as string) ?? bodyToken
    if (!svcEndpoint && !service_id) return err(res, 400, 'endpoint or service_id required')
    if (!svcQuery?.trim()) return err(res, 400, 'query required')

    // Step 1: authoritative service metadata
    let serviceCard: MarketplaceServiceCard | null = null
    if (svcEndpoint) {
      try { serviceCard = await cliInspect(svcEndpoint) } catch { /* ignore */ }
    }

    // Step 2: real agent wallet balance
    let realBalance = 0
    if (userToken) {
      try {
        const walletList = await client.listWallets({ userToken })
        const aw = (walletList.data?.wallets ?? []).find(w =>
          w.blockchain?.toLowerCase().includes('arc') || w.blockchain?.toLowerCase().includes('testnet')
        ) ?? walletList.data?.wallets?.[0]
        if (aw) {
          const balRes = await client.getWalletTokenBalance({ walletId: aw.id, userToken })
          const usdcBal = (balRes.data?.tokenBalances ?? []).find(b => b.token?.symbol === 'USDC')
          realBalance = parseFloat(usdcBal?.amount ?? '0')
        }
      } catch { /* leave at 0 */ }
    }

    // Step 3: resolve cost
    const STATIC_COSTS: Record<string, number> = {
      'perplexity-research': 0.002,
      'openai-completion': 0.001,
    }
    let cost_usdc = 0
    if (serviceCard?.price_raw) cost_usdc = parseInt(serviceCard.price_raw, 10) / 1e6
    if (service_id && STATIC_COSTS[service_id]) cost_usdc = cost_usdc || STATIC_COSTS[service_id]

    // Step 4: policy check
    const dLimit   = parseFloat(dailyLimit  ?? '0') || 20
    const dUsed    = parseFloat(dailyUsed   ?? '0') || 0
    const perSvc   = parseFloat(perServiceLimit ?? '0') || 5
    const reqAbove = parseFloat(requireApprovalAbove ?? '5') || 5
    const reqApproval = requireApproval === 'true' || requireApproval === '1'
    const remaining = dLimit - dUsed

    if (cost_usdc > remaining)
      return res.status(200).json({ ok: false, blocked: true, reason: `Service costs ${cost_usdc.toFixed(4)} USDC but only ${remaining.toFixed(2)} USDC left in daily budget.`, cost_usdc, real_balance: realBalance.toFixed(6) })
    if (cost_usdc > perSvc)
      return res.status(200).json({ ok: false, blocked: true, reason: `Service costs ${cost_usdc.toFixed(4)} USDC which exceeds per-service limit of ${perSvc} USDC.`, cost_usdc, real_balance: realBalance.toFixed(6) })
    if (cost_usdc > 0 && realBalance < cost_usdc)
      return res.status(200).json({ ok: false, blocked: true, reason: `Agent Wallet balance (${realBalance.toFixed(6)} USDC) is below service cost (${cost_usdc.toFixed(4)} USDC).`, cost_usdc, real_balance: realBalance.toFixed(6) })

    // Step 5: confirmation gate
    const confirmed = body.confirmed === 'true' || body.confirmed === '1'
    if ((reqApproval || cost_usdc > reqAbove) && !confirmed && cost_usdc > 0) {
      return res.status(200).json({
        ok: true,
        awaiting_confirmation: true,
        cost_usdc, real_balance: realBalance.toFixed(6), service: serviceCard,
        message: `Ready to use ${serviceCard?.provider ?? service_id ?? 'service'} for ${cost_usdc.toFixed(4)} USDC. Confirm to proceed.`,
      })
    }

    // Step 6: call agent-execute
    const host = req.headers.host ?? 'localhost:3001'
    const proto = host.includes('localhost') ? 'http' : 'https'
    const baseUrl = `${proto}://${host}`
    let executeResult: string | null = null
    let executeError: string | null = null
    const nanopayment: { paid: boolean; txId?: string; amount_usdc?: number } = { paid: false }

    try {
      const execRes = await fetch(`${baseUrl}/api/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: service_id ?? serviceCard?.id ?? 'brave-search', query: svcQuery, params: {} }),
        signal: AbortSignal.timeout(30_000),
      })
      if (execRes.ok) {
        const d = await execRes.json() as { result?: string; error?: string; nanopayment?: typeof nanopayment }
        executeResult = d.result ?? null
        if (d.error && !d.result) executeError = d.error
      } else {
        executeError = `Service returned HTTP ${execRes.status}`
      }
    } catch (e) {
      executeError = e instanceof Error ? e.message : 'Service call failed'
    }

    if (executeError && !executeResult) {
      return res.status(200).json({ ok: false, execute_error: true, reason: executeError, cost_usdc, service: serviceCard, nanopayment })
    }

    return res.status(200).json({
      ok: true,
      executed: true,
      result: executeResult,
      cost_usdc,
      real_balance: realBalance.toFixed(6),
      tx_ref: `nan-svc-${Date.now().toString(36)}`,
      service: serviceCard,
      nanopayment,
    })
  }

  // ── send — UCW createTransaction → challengeId for SDK execute ───────────
  if (action === 'send') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    const { to, amount: sendAmount, walletId } = body
    if (!userToken) return err(res, 401, 'userToken required')
    if (!to || !sendAmount || !walletId) return err(res, 400, 'to, amount, and walletId required')
    const parsed = parseFloat(sendAmount)
    if (!parsed || parsed <= 0) return err(res, 400, 'amount must be greater than 0')
    // Validate recipient address
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return err(res, 400, 'Invalid recipient address')
    try {
      const response = await client.createTransaction({
        userToken,
        walletId,
        amounts: [sendAmount],
        destinationAddress: to,
        tokenAddress: ARC_TESTNET_USDC,
        blockchain: Blockchain.ArcTestnet,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      const challengeId = response.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned from Circle')
      return res.status(200).json({ ok: true, challengeId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Send failed')
    }
  }

  // ── swap-quote — LiFi quote (Arc Testnet has no DEX; honest not-available) ─
  if (action === 'swap-quote') {
    const { fromToken: ft, toToken: tt, amount: swapAmt } = body
    if (!ft || !tt || !swapAmt) return err(res, 400, 'fromToken, toToken, amount required')
    // Arc Testnet has no live DEX liquidity — swap is not available for UCW agent wallets on this chain.
    // Return a clear, honest message instead of a fake quote.
    return res.status(200).json({
      ok: false,
      not_available: true,
      error: `Token swaps are not available for agent wallets on Arc Testnet. No DEX has live liquidity on this network. Use Bridge to move USDC to another chain where swaps are supported.`,
    })
  }

  // ── swap — not available on Arc Testnet ───────────────────────────────────
  if (action === 'swap') {
    return res.status(200).json({
      ok: false,
      not_available: true,
      error: 'Token swaps are not available for agent wallets on Arc Testnet. Use Bridge to move USDC cross-chain.',
    })
  }

  // ── bridge — UCW createUserTransactionContractExecutionChallenge (CCTP V2) ─
  // Step 1: USDC approve → challengeId for user to sign via PIN
  // Step 2 (separate call action='bridge-burn'): depositForBurn → challengeId
  // This matches the Circle UCW pattern: each on-chain tx needs a challengeId executed by the SDK.
  if (action === 'bridge' || action === 'bridge-approve') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    const { amount: bridgeAmt, walletId, toChain, destinationDomain, recipientAddress } = body
    if (!userToken) return err(res, 401, 'userToken required')
    if (!bridgeAmt || !walletId) return err(res, 400, 'amount and walletId required')
    const amountMicro = Math.floor(parseFloat(bridgeAmt) * 1e6).toString()

    // CCTP V2 destination domains
    const DEST_DOMAINS: Record<string, number> = {
      'ETH-SEPOLIA': 0, 'AVAX-FUJI': 1, 'OP-SEPOLIA': 2, 'ARB-SEPOLIA': 3,
      'BASE-SEPOLIA': 6, 'MATIC-AMOY': 7, 'ARC-TESTNET': 26, 'UNI-SEPOLIA': 16,
    }
    const destDomain = destinationDomain
      ? parseInt(destinationDomain, 10)
      : (DEST_DOMAINS[(toChain ?? '').toUpperCase()] ?? 6) // default Base Sepolia

    // Resolve agent wallet address
    let agentAddress: string | undefined
    let resolvedWalletId = walletId
    try {
      const wallets = await client.listWallets({ userToken })
      const aw = wallets.data?.wallets?.find(w => w.id === walletId)
        ?? wallets.data?.wallets?.find(w => w.blockchain?.toLowerCase().includes('arc'))
        ?? wallets.data?.wallets?.[0]
      agentAddress = aw?.address
      if (aw) resolvedWalletId = aw.id
    } catch { /* leave undefined */ }
    if (!agentAddress) return err(res, 400, 'Agent wallet address not found')

    const recipient = recipientAddress ?? agentAddress
    // Pad recipient address to bytes32 for CCTP
    const recipientBytes32 = '0x' + '0'.repeat(24) + recipient.replace('0x', '')

    // Step 1: approve TokenMessengerV2 to spend USDC
    // ABI: approve(address spender, uint256 amount) → bool
    try {
      const approveRes = await client.createUserTransactionContractExecutionChallenge({
        userToken,
        walletId: resolvedWalletId,
        contractAddress: ARC_TESTNET_USDC,
        blockchain: Blockchain.ArcTestnet,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [ARC_TESTNET_TOKEN_MESSENGER_V2, amountMicro],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: randomUUID(),
      })
      const challengeId = approveRes.data?.challengeId
      if (!challengeId) throw new Error('No challengeId from approve')
      return res.status(200).json({
        ok: true,
        step: 'approve',
        challengeId,
        // Pass through params needed for the burn step
        burnParams: { walletId: resolvedWalletId, amountMicro, destDomain, recipientBytes32 },
      })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Bridge approve failed')
    }
  }

  // ── bridge-burn — UCW depositForBurn after approve is signed ─────────────
  if (action === 'bridge-burn') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    const { walletId, amountMicro, destDomain, recipientBytes32 } = body
    if (!userToken) return err(res, 401, 'userToken required')
    if (!walletId || !amountMicro || destDomain === undefined || !recipientBytes32) {
      return err(res, 400, 'walletId, amountMicro, destDomain, recipientBytes32 required')
    }
    try {
      // CCTP V2 depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)
      const burnRes = await client.createUserTransactionContractExecutionChallenge({
        userToken,
        walletId,
        contractAddress: ARC_TESTNET_TOKEN_MESSENGER_V2,
        blockchain: Blockchain.ArcTestnet,
        abiFunctionSignature: 'depositForBurn(uint256,uint32,bytes32,address)',
        abiParameters: [amountMicro, destDomain, recipientBytes32, ARC_TESTNET_USDC],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: randomUUID(),
      })
      const challengeId = burnRes.data?.challengeId
      if (!challengeId) throw new Error('No challengeId from depositForBurn')
      return res.status(200).json({ ok: true, step: 'burn', challengeId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'Bridge burn failed')
    }
  }

  // ── send-usdc — developer-controlled UCW USDC transfer (recurring + agent-actions) ─
  if (action === 'send-usdc') {
    const userToken = (req.headers['x-user-token'] as string) ?? body.userToken
    const { toAddress, amount: sendUsdcAmount, walletId: sendWalletId } = body
    if (!userToken) return err(res, 401, 'userToken required')
    if (!toAddress || !sendUsdcAmount) return err(res, 400, 'toAddress and amount required')
    const parsedAmt = parseFloat(sendUsdcAmount)
    if (!parsedAmt || parsedAmt <= 0) return err(res, 400, 'amount must be greater than 0')
    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) return err(res, 400, 'Invalid recipient address')
    try {
      // Resolve walletId if not provided
      let resolvedWalletId = sendWalletId
      if (!resolvedWalletId) {
        const walletList = await client.listWallets({ userToken })
        const aw = walletList.data?.wallets?.find(w => w.blockchain?.toLowerCase().includes('arc'))
          ?? walletList.data?.wallets?.[0]
        if (!aw) return err(res, 404, 'Agent wallet not found for userToken')
        resolvedWalletId = aw.id
      }
      const response = await client.createTransaction({
        userToken,
        walletId: resolvedWalletId,
        amounts: [sendUsdcAmount],
        destinationAddress: toAddress,
        tokenAddress: ARC_TESTNET_USDC,
        blockchain: Blockchain.ArcTestnet,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      })
      const challengeId = response.data?.challengeId
      if (!challengeId) throw new Error('No challengeId returned from Circle')
      return res.status(200).json({ ok: true, challengeId })
    } catch (e) {
      return err(res, 500, e instanceof Error ? e.message : 'send-usdc failed')
    }
  }

  return err(res, 400, `Unknown action: ${action ?? '(none)'}`)
}
