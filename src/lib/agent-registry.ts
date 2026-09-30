/**
 * NAN Service Registry
 * Central catalogue of agent-callable external services.
 * Add new services here — the orchestrator picks them up automatically.
 */

export type ServiceCategory =
  | 'research'
  | 'search'
  | 'travel'
  | 'career'
  | 'supplier'
  | 'commerce'
  | 'data'
  | 'developer'
  | 'ai'
  | 'infrastructure'
  | 'digital_services'
  | 'other_agents'

export type EndpointType = 'rest' | 'graphql' | 'websocket' | 'x402' | 'agent'
export type AuthMethod = 'api_key' | 'bearer' | 'none' | 'x402_usdc'
export type PaymentMethod = 'usdc_arc' | 'usdc_base' | 'free' | 'subscription'

export interface NanService {
  service_id: string
  name: string
  description: string
  category: ServiceCategory
  provider: string
  endpoint: string
  endpoint_type: EndpointType
  /** Natural-language capability tags the orchestrator matches against user intent */
  capabilities: string[]
  /** USDC cost per call. 0 = free */
  price_usdc: number
  currency: 'USDC' | 'free'
  payment_method: PaymentMethod
  supported_chains: string[]
  authentication_method: AuthMethod
  /** Avg response time in ms */
  avg_response_ms: number
  /** 0–1 reliability score */
  reliability: number
  response_format: 'json' | 'text' | 'markdown' | 'html'
  /** Any usage restrictions */
  terms: string
  enabled: boolean
}

export interface ServiceDiscoveryResult {
  service: NanService
  capability_match: string
  score: number          // 0–1 relevance score
}

// ── Seed registry ─────────────────────────────────────────────────────────────
const REGISTRY: NanService[] = [
  {
    service_id: 'brave-search',
    name: 'Brave Search API',
    description: 'Privacy-first web search returning structured results.',
    category: 'search',
    provider: 'Brave Software',
    endpoint: 'https://api.search.brave.com/res/v1/web/search',
    endpoint_type: 'rest',
    capabilities: ['web search', 'news search', 'find information', 'look up', 'research topic', 'current events'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'api_key',
    avg_response_ms: 400,
    reliability: 0.98,
    response_format: 'json',
    terms: 'Requires BRAVE_SEARCH_API_KEY env var. 2000 free calls/month.',
    enabled: true,
  },
  {
    service_id: 'serper-search',
    name: 'Serper Google Search',
    description: 'Google search results via Serper API — fast and structured.',
    category: 'search',
    provider: 'Serper.dev',
    endpoint: 'https://google.serper.dev/search',
    endpoint_type: 'rest',
    capabilities: ['google search', 'web search', 'find information', 'search the web', 'look up', 'current news'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'api_key',
    avg_response_ms: 300,
    reliability: 0.99,
    response_format: 'json',
    terms: 'Requires SERPER_API_KEY env var. 2500 free calls/month.',
    enabled: true,
  },
  {
    service_id: 'skyscanner-flights',
    name: 'Flight Search (Skyscanner)',
    description: 'Search for flights, compare prices and airlines for any route and date.',
    category: 'travel',
    provider: 'Skyscanner',
    endpoint: 'https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create',
    endpoint_type: 'rest',
    capabilities: ['find flights', 'cheapest flight', 'flight search', 'travel', 'book flight', 'flight prices', 'airline comparison'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'api_key',
    avg_response_ms: 1800,
    reliability: 0.94,
    response_format: 'json',
    terms: 'Requires SKYSCANNER_API_KEY. Search only — booking redirects to provider.',
    enabled: true,
  },
  {
    service_id: 'amadeus-hotels',
    name: 'Hotel Search (Amadeus)',
    description: 'Search hotels by location, dates and guest count. Returns prices and availability.',
    category: 'travel',
    provider: 'Amadeus',
    endpoint: 'https://test.api.amadeus.com/v2/shopping/hotel-offers',
    endpoint_type: 'rest',
    capabilities: ['find hotels', 'hotel search', 'accommodation', 'where to stay', 'hotel prices', 'book hotel'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'bearer',
    avg_response_ms: 1200,
    reliability: 0.93,
    response_format: 'json',
    terms: 'Requires AMADEUS_API_KEY + AMADEUS_API_SECRET. Test environment by default.',
    enabled: true,
  },
  {
    service_id: 'perplexity-research',
    name: 'Perplexity AI Research',
    description: 'Deep research with cited sources. Best for complex questions requiring synthesis.',
    category: 'research',
    provider: 'Perplexity AI',
    endpoint: 'https://api.perplexity.ai/chat/completions',
    endpoint_type: 'rest',
    capabilities: ['deep research', 'research topic', 'find information with sources', 'explain', 'summarize', 'compare options', 'analyze'],
    price_usdc: 0.002,
    currency: 'USDC',
    payment_method: 'usdc_arc',
    supported_chains: ['arc-testnet', 'arc'],
    authentication_method: 'api_key',
    avg_response_ms: 3500,
    reliability: 0.96,
    response_format: 'json',
    terms: 'Requires PERPLEXITY_API_KEY. $0.002 USDC per query charged from agent wallet.',
    enabled: true,
  },
  {
    service_id: 'linkedin-jobs',
    name: 'LinkedIn Job Search',
    description: 'Search job listings by title, location and seniority.',
    category: 'career',
    provider: 'LinkedIn',
    endpoint: 'https://api.linkedin.com/v2/jobSearch',
    endpoint_type: 'rest',
    capabilities: ['find jobs', 'job search', 'career', 'hiring', 'work opportunities', 'remote jobs', 'employment'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'bearer',
    avg_response_ms: 800,
    reliability: 0.91,
    response_format: 'json',
    terms: 'Requires LINKEDIN_ACCESS_TOKEN. Rate limited to 500 req/day.',
    enabled: false,
  },
  {
    service_id: 'alibaba-suppliers',
    name: 'Alibaba Supplier Search',
    description: 'Find and compare product suppliers on Alibaba with pricing and MOQ.',
    category: 'supplier',
    provider: 'Alibaba',
    endpoint: 'https://gw.api.alibaba.com/openapi/param2/2/portals.open/api.findKeywordProducts',
    endpoint_type: 'rest',
    capabilities: ['find suppliers', 'supplier search', 'wholesale', 'manufacturer', 'product sourcing', 'bulk buy', 'import'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'api_key',
    avg_response_ms: 1100,
    reliability: 0.89,
    response_format: 'json',
    terms: 'Requires ALIBABA_APP_KEY + ALIBABA_APP_SECRET. Search only.',
    enabled: true,
  },
  {
    service_id: 'openai-completion',
    name: 'OpenAI GPT-4o',
    description: 'General-purpose AI reasoning, summarization, translation and generation.',
    category: 'ai',
    provider: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    endpoint_type: 'rest',
    capabilities: ['summarize', 'translate', 'write', 'analyze', 'generate', 'explain', 'reasoning', 'coding help', 'drafting'],
    price_usdc: 0.001,
    currency: 'USDC',
    payment_method: 'usdc_arc',
    supported_chains: ['arc-testnet', 'arc'],
    authentication_method: 'api_key',
    avg_response_ms: 2200,
    reliability: 0.99,
    response_format: 'json',
    terms: 'Requires OPENAI_API_KEY. $0.001 USDC per 1k tokens approx.',
    enabled: true,
  },
  {
    service_id: 'coingecko-prices',
    name: 'CoinGecko Crypto Prices',
    description: 'Real-time and historical crypto prices, market cap and volume.',
    category: 'data',
    provider: 'CoinGecko',
    endpoint: 'https://api.coingecko.com/api/v3/simple/price',
    endpoint_type: 'rest',
    capabilities: ['crypto price', 'token price', 'bitcoin price', 'ethereum price', 'market data', 'coin price', 'crypto market'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'none',
    avg_response_ms: 250,
    reliability: 0.97,
    response_format: 'json',
    terms: 'Public API. No key required. 30 req/min rate limit.',
    enabled: true,
  },
  {
    service_id: 'exchangerate-fx',
    name: 'Exchange Rate API',
    description: 'Live and historical fiat currency exchange rates.',
    category: 'data',
    provider: 'ExchangeRate-API',
    endpoint: 'https://v6.exchangerate-api.com/v6',
    endpoint_type: 'rest',
    capabilities: ['currency exchange rate', 'forex', 'convert currency', 'usd to ngn', 'exchange rate', 'fiat conversion'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'api_key',
    avg_response_ms: 200,
    reliability: 0.99,
    response_format: 'json',
    terms: 'Requires EXCHANGERATE_API_KEY. 1500 free req/month.',
    enabled: true,
  },
  {
    service_id: 'github-code-search',
    name: 'GitHub Code & Repo Search',
    description: 'Search public GitHub repositories, issues and code.',
    category: 'developer',
    provider: 'GitHub',
    endpoint: 'https://api.github.com/search/repositories',
    endpoint_type: 'rest',
    capabilities: ['find code', 'github search', 'open source', 'repository search', 'developer tools', 'code examples', 'find library'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: [],
    authentication_method: 'bearer',
    avg_response_ms: 350,
    reliability: 0.98,
    response_format: 'json',
    terms: 'Requires GITHUB_TOKEN for higher rate limits. 60 unauthenticated req/hr.',
    enabled: true,
  },
  {
    service_id: 'circle-agent-marketplace',
    name: 'Circle Agent Marketplace',
    description: 'Discover and call other AI agents registered on Circle\'s agent marketplace.',
    category: 'other_agents',
    provider: 'Circle',
    endpoint: 'https://agents.circle.com/services',
    endpoint_type: 'agent',
    capabilities: ['find agents', 'agent marketplace', 'ai agent', 'autonomous service', 'circle agent', 'agent services'],
    price_usdc: 0,
    currency: 'free',
    payment_method: 'free',
    supported_chains: ['arc-testnet', 'arc', 'base', 'ethereum'],
    authentication_method: 'none',
    avg_response_ms: 500,
    reliability: 0.95,
    response_format: 'json',
    terms: 'Public marketplace. Individual agents may charge USDC via x402.',
    enabled: true,
  },
]

// ── Registry CRUD ─────────────────────────────────────────────────────────────

/** Return all enabled services */
export function getEnabledServices(): NanService[] {
  return REGISTRY.filter(s => s.enabled)
}

/** Return all services (including disabled) */
export function getAllServices(): NanService[] {
  return [...REGISTRY]
}

/** Find a service by id */
export function getServiceById(id: string): NanService | undefined {
  return REGISTRY.find(s => s.service_id === id)
}

/** Return services in a category */
export function getServicesByCategory(category: ServiceCategory): NanService[] {
  return REGISTRY.filter(s => s.category === category && s.enabled)
}

/**
 * Discover services that match a free-text intent string.
 * Returns results sorted by score descending.
 */
export function discoverServices(intent: string, maxResults = 5): ServiceDiscoveryResult[] {
  const words = intent.toLowerCase().split(/\s+/)
  const scored = getEnabledServices().map(svc => {
    let score = 0
    let bestCapability = ''
    for (const cap of svc.capabilities) {
      const capWords = cap.toLowerCase().split(/\s+/)
      const hits = capWords.filter(w => words.some(iw => iw.includes(w) || w.includes(iw))).length
      if (hits > 0) {
        const s = hits / capWords.length
        if (s > score) { score = s; bestCapability = cap }
      }
    }
    // Boost exact phrase matches
    if (svc.capabilities.some(c => intent.toLowerCase().includes(c.toLowerCase()))) score = Math.min(1, score + 0.3)
    return { service: svc, capability_match: bestCapability, score }
  })
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults)
}

/** All distinct categories present in the registry */
export const ALL_CATEGORIES: ServiceCategory[] = [
  'research', 'search', 'travel', 'career', 'supplier',
  'commerce', 'data', 'developer', 'ai', 'infrastructure',
  'digital_services', 'other_agents',
]
