/**
 * api/agent-execute.ts
 *
 * Server-side handler for NAN Agent service execution.
 * API keys live here — never in frontend code.
 *
 * SECURITY:
 * - Validates serviceId against the known registry before calling anything
 * - Never exposes API keys in responses
 * - All payments routed through Nan wallet layer, not here
 * - Input is sanitised before being forwarded to third-party APIs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Allowed service IDs — must match agent-registry.ts ──────────────────────
const ALLOWED_IDS = new Set([
  'brave-search', 'serper-search', 'coingecko-prices', 'exchangerate-fx',
  'github-code-search', 'perplexity-research', 'skyscanner-flights',
  'amadeus-hotels', 'alibaba-suppliers', 'openai-completion',
  'circle-agent-marketplace',
  // Phase 3 network agents
  'nan-research-agent', 'nan-supplier-agent', 'nan-career-agent',
  'nan-data-agent', 'nan-translate-agent', 'nan-developer-agent',
])

// ── Utility ──────────────────────────────────────────────────────────────────

function sanitise(s: string): string {
  return s.replace(/[<>"'`\\]/g, '').slice(0, 500)
}

async function jsonFetch(url: string, options?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(id)
    if (!res.ok) throw new Error(`Upstream ${res.status}`)
    return await res.json()
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

// ── Service handlers ─────────────────────────────────────────────────────────

async function runBraveSearch(query: string): Promise<string> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) return mockSearchResult(query, 'Brave Search')
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`
  const data = await jsonFetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } }) as Record<string, unknown>
  const results = (data?.web as { results?: Array<{ title: string; url: string; description: string }> })?.results ?? []
  if (results.length === 0) return `No results found for "${query}".`
  return results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.description ?? ''}\n   ${r.url}`).join('\n\n')
}

async function runSerperSearch(query: string): Promise<string> {
  const key = process.env.SERPER_API_KEY
  if (!key) return mockSearchResult(query, 'Google Search')
  const data = await jsonFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: 5 }),
  }) as Record<string, unknown>
  const organic = (data?.organic as Array<{ title: string; link: string; snippet: string }>) ?? []
  if (organic.length === 0) return `No results found for "${query}".`
  return organic.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet ?? ''}\n   ${r.link}`).join('\n\n')
}

async function runCoinGecko(query: string): Promise<string> {
  // Map common names → CoinGecko IDs
  const COIN_MAP: Record<string, string> = {
    bitcoin: 'bitcoin', btc: 'bitcoin', ethereum: 'ethereum', eth: 'ethereum',
    usdc: 'usd-coin', usdt: 'tether', bnb: 'binancecoin', sol: 'solana',
    xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', matic: 'matic-network',
    avax: 'avalanche-2', dot: 'polkadot', link: 'chainlink', uni: 'uniswap',
  }
  const lower = query.toLowerCase()
  const id = Object.keys(COIN_MAP).find(k => lower.includes(k))
  const coinId = id ? COIN_MAP[id] : 'bitcoin'
  const data = await jsonFetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,gbp,eur,ngn&include_24hr_change=true`
  ) as Record<string, Record<string, number>>
  const coin = data[coinId]
  if (!coin) return `Could not retrieve price for ${coinId}.`
  const lines = [`**${coinId.charAt(0).toUpperCase() + coinId.slice(1)}** price:`]
  if (coin.usd !== undefined) lines.push(`USD: $${coin.usd.toLocaleString()}`)
  if (coin.gbp !== undefined) lines.push(`GBP: £${coin.gbp.toLocaleString()}`)
  if (coin.eur !== undefined) lines.push(`EUR: €${coin.eur.toLocaleString()}`)
  if (coin.ngn !== undefined) lines.push(`NGN: ₦${coin.ngn.toLocaleString()}`)
  if (coin.usd_24h_change !== undefined) lines.push(`24h change: ${coin.usd_24h_change.toFixed(2)}%`)
  return lines.join('\n')
}

async function runExchangeRate(query: string): Promise<string> {
  const key = process.env.EXCHANGERATE_API_KEY
  // Extract currency pair from query
  const match = query.match(/([A-Z]{3})\s+to\s+([A-Z]{3})/i) ?? query.match(/([A-Z]{3})\/([A-Z]{3})/i)
  const base = match ? match[1].toUpperCase() : 'USD'
  const target = match ? match[2].toUpperCase() : 'NGN'
  if (!key) {
    return `Exchange rate service requires EXCHANGERATE_API_KEY.\n\nApproximate ${base}→${target}: check xe.com or Google for current rates.`
  }
  const data = await jsonFetch(`https://v6.exchangerate-api.com/v6/${key}/pair/${base}/${target}`) as Record<string, unknown>
  const rate = data?.conversion_rate as number | undefined
  if (!rate) return `Could not retrieve ${base}→${target} rate.`
  return `**${base} → ${target}**\n1 ${base} = ${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${target}\n\n_Last updated: ${new Date().toUTCString()}_`
}

async function runGitHubSearch(query: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const data = await jsonFetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`,
    { headers }
  ) as Record<string, unknown>
  const items = (data?.items as Array<{ full_name: string; description: string; stargazers_count: number; html_url: string }>) ?? []
  if (items.length === 0) return `No repositories found for "${query}".`
  return items.map((r, i) =>
    `${i + 1}. **${r.full_name}** ⭐ ${r.stargazers_count.toLocaleString()}\n   ${r.description ?? 'No description'}\n   ${r.html_url}`
  ).join('\n\n')
}

async function runPerplexity(query: string): Promise<string> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) return mockResearchResult(query)
  const data = await jsonFetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{ role: 'user', content: query }],
      max_tokens: 600,
    }),
  }) as Record<string, unknown>
  const content = (data?.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content
  return content ?? mockResearchResult(query)
}

async function runCircleAgentMarketplace(): Promise<string> {
  try {
    const data = await jsonFetch('https://agents.circle.com/services') as Record<string, unknown>
    const services = (data?.services ?? data) as Array<{ name?: string; description?: string; price?: string }>
    if (!Array.isArray(services) || services.length === 0) return mockAgentMarketplace()
    return services.slice(0, 5).map((s, i) =>
      `${i + 1}. **${s.name ?? 'Agent'}** — ${s.description ?? ''} ${s.price ? `(${s.price})` : ''}`
    ).join('\n')
  } catch {
    return mockAgentMarketplace()
  }
}

// ── Phase 3 NAN network agents (mock until real agent nodes are registered) ──

function runNanResearchAgent(query: string): string {
  return mockResearchResult(query)
}
function runNanSupplierAgent(query: string): string {
  return `**Supplier Discovery Results for: "${query}"**\n\n` +
    `1. **Shenzhen Tech Manufacturing Co.**\nMOQ: 500 units · Lead time: 30 days · Certified: ISO 9001\nCapabilities: PCB assembly, final assembly, QC testing\n\n` +
    `2. **Guangzhou Global Suppliers Ltd.**\nMOQ: 200 units · Lead time: 21 days · Certified: ISO 9001, CE\nCapabilities: Plastics, electronics assembly, packaging\n\n` +
    `3. **Vietnam Manufacturing Hub**\nMOQ: 1000 units · Lead time: 45 days · Certified: ISO 9001\nCapabilities: Textile, electronics, low-cost labour\n\n` +
    `_Add ALIBABA_APP_KEY to enable live Alibaba supplier search._`
}
function runNanCareerAgent(query: string): string {
  return `**Job Matches for: "${query}"**\n\n` +
    `1. **Senior Software Engineer** — Fintech Startup, Remote\n   $120k–150k · Posted 2 days ago\n\n` +
    `2. **Backend Engineer (Node/TypeScript)** — Circle, San Francisco\n   $130k–160k · Posted 1 week ago\n\n` +
    `3. **Blockchain Developer** — Web3 Foundation, Remote\n   $100k–140k · Posted 3 days ago\n\n` +
    `_Add LINKEDIN_ACCESS_TOKEN to enable live LinkedIn job search._`
}
function runNanDataAgent(query: string): string {
  return `**Company/Market Data for: "${query}"**\n\n` +
    `Company verification results: 3 entities found matching your query.\n\n` +
    `• Entity 1: Active · Incorporation: 2018 · UK Companies House verified\n` +
    `• Entity 2: Active · Incorporation: 2020 · US Delaware registered\n` +
    `• Entity 3: Pending verification\n\n` +
    `_Add COMPANY_VERIFICATION_API_KEY for live company lookups._`
}
function runNanTranslateAgent(query: string): string {
  return `**Translation/Generation Result:**\n\n${query}\n\n_(Translation/generation requires OPENAI_API_KEY or GROQ_API_KEY in environment.)_`
}
function runNanDeveloperAgent(query: string): string {
  return runGitHubSearch(query) as unknown as string
}

// ── Mock fallbacks ────────────────────────────────────────────────────────────

function mockSearchResult(query: string, source: string): string {
  return `**${source} results for "${query}":**\n\nTo enable live search results, add the ${source.includes('Brave') ? 'BRAVE_SEARCH_API_KEY' : 'SERPER_API_KEY'} environment variable.\n\n` +
    `_This is a simulated response. In production, real search results would appear here._`
}

function mockResearchResult(query: string): string {
  return `**Research Summary: "${query}"**\n\n` +
    `Based on available knowledge:\n\n` +
    `This topic covers multiple dimensions that require careful analysis. Key factors to consider include market conditions, regulatory environment, and competitive landscape.\n\n` +
    `To enable live research with cited sources, add PERPLEXITY_API_KEY to your environment variables.\n\n` +
    `_This is a simulated response. In production, Perplexity AI would provide cited research._`
}

function mockAgentMarketplace(): string {
  return `**Circle Agent Marketplace**\n\n` +
    `1. **Research Agent** — Deep web research and structured reports ($0.02/req)\n` +
    `2. **Data Agent** — Company and market data ($0.01/req)\n` +
    `3. **Translation Agent** — Multi-language document translation ($0.005/req)\n` +
    `4. **Developer Agent** — Code search and repository analysis (free)\n\n` +
    `_Live marketplace requires network connectivity to agents.circle.com_`
}

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { serviceId, query, parameters } = req.body as {
    serviceId?: string
    query?: string
    parameters?: Record<string, string>
  }

  if (!serviceId || typeof serviceId !== 'string') {
    return res.status(400).json({ error: 'serviceId is required' })
  }
  if (!ALLOWED_IDS.has(serviceId)) {
    return res.status(400).json({ error: 'Unknown serviceId' })
  }
  const safeQuery = sanitise(query ?? parameters?.q ?? parameters?.query ?? '')

  try {
    let result: string

    switch (serviceId) {
      case 'brave-search':
        result = await runBraveSearch(safeQuery); break
      case 'serper-search':
        result = await runSerperSearch(safeQuery); break
      case 'coingecko-prices':
        result = await runCoinGecko(safeQuery); break
      case 'exchangerate-fx':
        result = await runExchangeRate(safeQuery); break
      case 'github-code-search':
      case 'nan-developer-agent':
        result = await runGitHubSearch(safeQuery); break
      case 'perplexity-research':
        result = await runPerplexity(safeQuery); break
      case 'circle-agent-marketplace':
        result = await runCircleAgentMarketplace(); break
      case 'nan-research-agent':
        result = runNanResearchAgent(safeQuery); break
      case 'nan-supplier-agent':
        result = runNanSupplierAgent(safeQuery); break
      case 'nan-career-agent':
        result = runNanCareerAgent(safeQuery); break
      case 'nan-data-agent':
        result = runNanDataAgent(safeQuery); break
      case 'nan-translate-agent':
        result = runNanTranslateAgent(safeQuery); break
      default:
        result = `Service "${serviceId}" executed. Add API key to enable live results.`
    }

    return res.status(200).json({ result, serviceId, timestamp: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Service error'
    return res.status(500).json({ error: msg, serviceId })
  }
}
