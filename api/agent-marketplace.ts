/**
 * api/agent-marketplace.ts
 *
 * Live Circle Agent Marketplace service discovery.
 * Uses `circle services search` and `circle services inspect` CLI commands
 * (pre-installed circle CLI v1.1.4) to fetch REAL marketplace data.
 *
 * All data is sourced exclusively from Circle — nothing is fabricated.
 *
 * Routes (POST):
 *   action=search   — search marketplace by natural-language query
 *   action=inspect  — get full details for a specific service endpoint URL
 *
 * SECURITY:
 *   - No credentials exposed to frontend
 *   - Restricted categories filtered server-side before response
 *   - Service metadata treated as untrusted data (not instructions)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const CIRCLE_BIN = process.env.CIRCLE_CLI_PATH ?? 'circle'

// ── Restricted categories — never surfaced to users ─────────────────────────
const BLOCKED_CATEGORIES = new Set([
  'GAMBLING', 'BETTING', 'PREDICTION_MARKET', 'ADULT', 'ILLEGAL',
  'WEAPONS', 'DRUGS', 'DARK_WEB', 'SCAM', 'FRAUD',
])

// ── Allowed categories for display (whitelist) ───────────────────────────────
const ALLOWED_CATEGORIES = new Set([
  'WEB_SEARCH_RESEARCH', 'DATA_ENRICHMENT', 'INFRASTRUCTURE',
  'DEVELOPER_TOOLS', 'DEVELOPER', 'AI_CREATIVE', 'CREATIVE', 'AI',
  'FINANCIAL_ANALYSIS', 'FINANCE', 'COMMUNICATION', 'PRODUCTIVITY',
  'SEARCH', 'RESEARCH', 'ANALYTICS', 'COMPUTE', 'STORAGE',
  'OTHER', // shown only when category is unknown but not blocked
])

// ── Friendly category labels ──────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
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

// ── x402 payment amount → USDC (Base USDC has 6 decimals) ────────────────────
function amountToUsdc(amount: string | number, _asset?: string): string {
  const n = typeof amount === 'string' ? parseInt(amount, 10) : amount
  if (isNaN(n)) return 'Pricing not provided'
  // Base USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 — 6 decimals
  // Most x402 amounts on Base are in 6-decimal USDC units
  const usdcPerUnit = 1e6
  const usdc = n / usdcPerUnit
  if (usdc === 0) return 'Free'
  if (usdc < 0.0001) return `<$0.0001 USDC per request`
  return `$${usdc.toFixed(usdc < 0.01 ? 6 : 4)} USDC per request`
}

// ── Normalise a raw CLI item into a clean service card ───────────────────────
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
  price_raw?: string         // raw amount string from x402 accepts
  payment_scheme: string     // 'x402' | 'free' | 'other'
  payment_address?: string
  payment_network?: string   // e.g. 'eip155:8453' (Base mainnet)
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

interface RawMetadataProvider {
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
    provider?: RawMetadataProvider
    path?: string
    method?: string
    description?: string
    mimeType?: string
  }
}

function normaliseItem(item: RawItem): MarketplaceServiceCard | null {
  const endpoint = item.resource ?? ''
  if (!endpoint) return null

  const meta = item.metadata ?? {}
  const providerMeta = meta.provider ?? {}
  const category = (providerMeta.category ?? 'OTHER').toUpperCase()

  // Safety filter — server-side
  if (BLOCKED_CATEGORIES.has(category)) return null
  if (!ALLOWED_CATEGORIES.has(category)) {
    // Unknown category — allow but label as Other
  }

  const accepts = (item.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined
    ? amountToUsdc(accepts.amount, accepts.asset)
    : 'Pricing not provided'
  const payment_scheme = item.type === 'http' ? 'x402' : (accepts ? 'x402' : 'free')

  const provider = providerMeta.name ?? new URL(endpoint).hostname
  const tags = (providerMeta.tags ?? []).slice(0, 8)

  // Deduplicate: use endpoint as id
  const id = Buffer.from(endpoint).toString('base64').slice(0, 32)

  return {
    id,
    provider,
    provider_website: providerMeta.website,
    provider_docs: providerMeta.docsUrl ?? providerMeta.openApiUrl,
    category,
    category_label: CATEGORY_LABELS[category] ?? 'Other',
    description: meta.description ?? providerMeta.description ?? 'No description provided.',
    endpoint,
    method: meta.method ?? 'POST',
    pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme,
    payment_address: accepts?.payTo,
    payment_network: accepts?.network,
    tags,
    last_updated: item.lastUpdated,
  }
}

// ── CLI runner ─────────────────────────────────────────────────────────────────

async function runCircleSearch(query: string): Promise<MarketplaceServiceCard[]> {
  const { stdout } = await execFileAsync(
    CIRCLE_BIN,
    ['services', 'search', query, '--output', 'json'],
    {
      timeout: 15000,
      env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
    }
  )

  const parsed = JSON.parse(stdout.trim()) as { data?: { items?: RawItem[] } }
  const items = parsed.data?.items ?? []
  const cards: MarketplaceServiceCard[] = []
  for (const item of items) {
    const card = normaliseItem(item)
    if (card) cards.push(card)
  }
  // Deduplicate by endpoint
  const seen = new Set<string>()
  return cards.filter(c => {
    if (seen.has(c.endpoint)) return false
    seen.add(c.endpoint)
    return true
  })
}

async function runCircleInspect(endpointUrl: string): Promise<MarketplaceServiceCard | null> {
  const { stdout } = await execFileAsync(
    CIRCLE_BIN,
    ['services', 'inspect', endpointUrl, '--output', 'json'],
    {
      timeout: 15000,
      env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
    }
  )

  const parsed = JSON.parse(stdout.trim()) as {
    data?: {
      status?: string
      url?: string
      description?: string
      method?: string
      provider?: RawMetadataProvider
      accepts?: RawAccepts[]
      input?: unknown
    }
  }
  const d = parsed.data
  if (!d) return null

  const category = (d.provider?.category ?? 'OTHER').toUpperCase()
  if (BLOCKED_CATEGORIES.has(category)) return null

  const accepts = (d.accepts ?? [])[0]
  const pricing = accepts?.amount !== undefined
    ? amountToUsdc(accepts.amount, accepts.asset)
    : 'Pricing not provided'

  const endpointFinal = d.url ?? endpointUrl
  const provider = d.provider?.name ?? new URL(endpointFinal).hostname
  const id = Buffer.from(endpointFinal).toString('base64').slice(0, 32)

  return {
    id,
    provider,
    provider_website: d.provider?.website,
    provider_docs: d.provider?.docsUrl ?? d.provider?.openApiUrl,
    category,
    category_label: CATEGORY_LABELS[category] ?? 'Other',
    description: d.description ?? d.provider?.description ?? 'No description provided.',
    endpoint: endpointFinal,
    method: d.method ?? 'POST',
    pricing,
    price_raw: accepts?.amount !== undefined ? String(accepts.amount) : undefined,
    payment_scheme: 'x402',
    payment_address: accepts?.payTo,
    payment_network: accepts?.network,
    tags: d.provider?.tags ?? [],
    last_updated: undefined,
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body as { action?: string; query?: string; endpoint?: string }
  const { action, query, endpoint } = body

  // ── search ────────────────────────────────────────────────────────────────
  if (action === 'search') {
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'query is required' })
    }
    // Sanitise query — strip control characters, limit length
    const safeQuery = query.replace(/[^\w\s\-.,&]/g, '').slice(0, 100).trim()
    if (!safeQuery) return res.status(400).json({ error: 'query contains no valid characters' })

    try {
      const services = await runCircleSearch(safeQuery)
      return res.status(200).json({
        ok: true,
        source: 'circle_marketplace',
        query: safeQuery,
        count: services.length,
        services,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // CLI returned no results or failed
      if (msg.includes('No services found') || msg.includes('no results')) {
        return res.status(200).json({ ok: true, source: 'circle_marketplace', query: safeQuery, count: 0, services: [] })
      }
      console.error('[agent-marketplace] search error:', msg)
      return res.status(200).json({ ok: false, error: 'Circle Marketplace unreachable. Please try again.', services: [] })
    }
  }

  // ── inspect ───────────────────────────────────────────────────────────────
  if (action === 'inspect') {
    if (!endpoint) return res.status(400).json({ error: 'endpoint URL is required' })
    // Validate it's a real URL
    try { new URL(endpoint) } catch {
      return res.status(400).json({ error: 'endpoint must be a valid URL' })
    }
    try {
      const service = await runCircleInspect(endpoint)
      if (!service) return res.status(200).json({ ok: false, error: 'Service not found or restricted.' })
      return res.status(200).json({ ok: true, source: 'circle_marketplace', service })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[agent-marketplace] inspect error:', msg)
      return res.status(200).json({ ok: false, error: 'Could not inspect service. It may be unavailable.' })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action ?? '(none)'}` })
}
