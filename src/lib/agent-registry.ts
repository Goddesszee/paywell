/**
 * NAN Service Registry
 * Central catalogue of agent-callable external services and network agents.
 * Add new services here — the orchestrator picks them up automatically.
 *
 * Phase 3A/3B additions:
 * - NetworkAgent: structured agent identity with capabilities, schemas, and payment config
 * - AgentStatus: lifecycle states
 * - AgentCapability: typed capability declaration
 * - AGENT_NETWORK_REGISTRY: seed network agents discoverable by the A2A layer
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
export type PaymentMethod = 'usdc_arc' | 'usdc_base' | 'free' | 'subscription' | 'x402'

// ── Phase 1/2: Service schema ─────────────────────────────────────────────────

export interface NanService {
  service_id: string
  name: string
  description: string
  category: ServiceCategory
  provider: string
  endpoint: string
  endpoint_type: EndpointType
  capabilities: string[]
  price_usdc: number
  currency: 'USDC' | 'free'
  payment_method: PaymentMethod
  supported_chains: string[]
  authentication_method: AuthMethod
  avg_response_ms: number
  reliability: number
  response_format: 'json' | 'text' | 'markdown' | 'html'
  terms: string
  enabled: boolean
}

export interface ServiceDiscoveryResult {
  service: NanService
  capability_match: string
  score: number
}

// ── Phase 3A: Network Agent schema ────────────────────────────────────────────

export type AgentStatus = 'active' | 'inactive' | 'pending' | 'suspended'
export type AgentVerification = 'unverified' | 'verified' | 'trusted'

export interface AgentCapability {
  id: string
  name: string
  description: string
  keywords: string[]
  input_schema: Record<string, string>
  output_schema: Record<string, string>
  price_usdc: number
  currency: 'USDC' | 'free'
}

export interface NetworkAgent {
  agent_id: string
  name: string
  description: string
  provider: string
  categories: ServiceCategory[]
  capabilities: AgentCapability[]
  endpoint: string
  payment_address?: string
  payment_methods: PaymentMethod[]
  supported_networks: string[]
  status: AgentStatus
  verification_status: AgentVerification
  total_requests: number
  successful_requests: number
  avg_response_ms: number
  created_at: string
}

// ── Phase 1/2 service registry ────────────────────────────────────────────────

const SERVICE_REGISTRY: NanService[] = [
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
    description: 'Search hotels by location, dates and guest count.',
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
    terms: 'Requires AMADEUS_API_KEY + AMADEUS_API_SECRET.',
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
    terms: 'Requires PERPLEXITY_API_KEY. $0.002 USDC per query.',
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
    terms: 'Requires LINKEDIN_ACCESS_TOKEN.',
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
    terms: 'Requires ALIBABA_APP_KEY + ALIBABA_APP_SECRET.',
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
    terms: 'Requires OPENAI_API_KEY.',
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
    terms: 'Public API. 30 req/min.',
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
    terms: 'Requires EXCHANGERATE_API_KEY.',
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
    terms: 'Requires GITHUB_TOKEN for higher rate limits.',
    enabled: true,
  },
  {
    service_id: 'circle-agent-marketplace',
    name: 'Circle Agent Marketplace',
    description: "Discover and call other AI agents registered on Circle's agent marketplace.",
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

// ── Phase 3A: Network agent registry ─────────────────────────────────────────

const AGENT_NETWORK_REGISTRY: NetworkAgent[] = [
  {
    agent_id: 'nan-research-agent',
    name: 'NAN Research Agent',
    description: 'Deep research, synthesis, and structured report generation.',
    provider: 'NAN Network',
    categories: ['research'],
    capabilities: [
      {
        id: 'cap-research-web', name: 'Web Research',
        description: 'Research any topic and synthesize a structured report.',
        keywords: ['research', 'analyze', 'analyse', 'deep dive', 'comprehensive', 'overview', 'summarize', 'explain'],
        input_schema: { query: 'string' },
        output_schema: { report: 'string', sources: 'string[]' },
        price_usdc: 0.002, currency: 'USDC',
      },
      {
        id: 'cap-research-compare', name: 'Comparison Research',
        description: 'Compare multiple options with structured analysis.',
        keywords: ['compare', 'comparison', 'vs', 'versus', 'which is better', 'pros and cons'],
        input_schema: { items: 'string[]', criteria: 'string' },
        output_schema: { comparison: 'object', recommendation: 'string' },
        price_usdc: 0.003, currency: 'USDC',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['usdc_arc', 'x402'],
    supported_networks: ['arc-testnet', 'arc', 'base'],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 142,
    successful_requests: 139,
    avg_response_ms: 3200,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    agent_id: 'nan-supplier-agent',
    name: 'NAN Supplier Agent',
    description: 'Find and compare product manufacturers, suppliers, and wholesalers globally.',
    provider: 'NAN Network',
    categories: ['supplier', 'commerce'],
    capabilities: [
      {
        id: 'cap-supplier-find', name: 'Find Manufacturers',
        description: 'Discover manufacturers with MOQ, lead time, and certifications.',
        keywords: ['supplier', 'manufacturer', 'wholesale', 'source', 'factory', 'alibaba', 'import', 'bulk', 'product sourcing'],
        input_schema: { product: 'string', quantity: 'number' },
        output_schema: { suppliers: 'array', count: 'number' },
        price_usdc: 0.05, currency: 'USDC',
      },
      {
        id: 'cap-supplier-verify', name: 'Verify Supplier',
        description: 'Verify supplier legitimacy, certifications, and trading history.',
        keywords: ['verify supplier', 'supplier check', 'legitimate', 'certified supplier'],
        input_schema: { supplier_name: 'string', country: 'string' },
        output_schema: { verified: 'boolean', certifications: 'string[]', risk_score: 'string' },
        price_usdc: 0.02, currency: 'USDC',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['usdc_arc', 'x402'],
    supported_networks: ['arc-testnet', 'arc'],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 87,
    successful_requests: 82,
    avg_response_ms: 2800,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    agent_id: 'nan-data-agent',
    name: 'NAN Data Agent',
    description: 'Company verification, market data, structured datasets, and business intelligence.',
    provider: 'NAN Network',
    categories: ['data'],
    capabilities: [
      {
        id: 'cap-data-company', name: 'Company Lookup',
        description: 'Verify company registration, directors, and status.',
        keywords: ['company', 'verify', 'verification', 'business', 'corporate', 'registration', 'directors', 'legit'],
        input_schema: { company_name: 'string', country: 'string?' },
        output_schema: { status: 'string', registration: 'string', directors: 'string[]' },
        price_usdc: 0.01, currency: 'USDC',
      },
      {
        id: 'cap-data-market', name: 'Market Data',
        description: 'Retrieve market size, trends, and competitive landscape.',
        keywords: ['market', 'sector', 'industry', 'landscape', 'data', 'trends', 'competitive', 'market size'],
        input_schema: { sector: 'string', region: 'string?' },
        output_schema: { market_size: 'string', growth_rate: 'string', top_players: 'string[]' },
        price_usdc: 0.03, currency: 'USDC',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['usdc_arc'],
    supported_networks: ['arc-testnet', 'arc'],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 203,
    successful_requests: 199,
    avg_response_ms: 1100,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    agent_id: 'nan-career-agent',
    name: 'NAN Career Agent',
    description: 'Job discovery, matching, CV analysis, and career opportunity research.',
    provider: 'NAN Network',
    categories: ['career'],
    capabilities: [
      {
        id: 'cap-career-search', name: 'Job Search',
        description: 'Find matching job opportunities by role, location, and level.',
        keywords: ['job', 'jobs', 'career', 'hiring', 'employment', 'work', 'vacancy', 'position', 'role', 'remote work'],
        input_schema: { role: 'string', location: 'string?', level: 'string?' },
        output_schema: { jobs: 'array', count: 'number' },
        price_usdc: 0.01, currency: 'USDC',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['usdc_arc', 'free'],
    supported_networks: ['arc-testnet', 'arc'],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 56,
    successful_requests: 55,
    avg_response_ms: 900,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    agent_id: 'nan-translate-agent',
    name: 'NAN Translate & Write Agent',
    description: 'Document translation, content generation, summarisation, and rewriting.',
    provider: 'NAN Network',
    categories: ['ai'],
    capabilities: [
      {
        id: 'cap-translate', name: 'Translate',
        description: 'Translate text between languages.',
        keywords: ['translate', 'translation', 'language', 'localize', 'french', 'spanish', 'arabic', 'yoruba', 'igbo', 'hausa'],
        input_schema: { text: 'string', from_lang: 'string', to_lang: 'string' },
        output_schema: { translated: 'string', confidence: 'number' },
        price_usdc: 0.005, currency: 'USDC',
      },
      {
        id: 'cap-summarise', name: 'Summarise',
        description: 'Summarise long documents or articles.',
        keywords: ['summarize', 'summarise', 'summary', 'brief', 'tldr', 'shorten', 'condense'],
        input_schema: { text: 'string', length: 'string' },
        output_schema: { summary: 'string', key_points: 'string[]' },
        price_usdc: 0.002, currency: 'USDC',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['usdc_arc'],
    supported_networks: ['arc-testnet', 'arc'],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 34,
    successful_requests: 34,
    avg_response_ms: 2100,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    agent_id: 'nan-developer-agent',
    name: 'NAN Developer Agent',
    description: 'Code search, repository analysis, open-source discovery, and developer tools.',
    provider: 'NAN Network',
    categories: ['developer'],
    capabilities: [
      {
        id: 'cap-dev-search', name: 'Repository Search',
        description: 'Search GitHub for repositories, code examples, and libraries.',
        keywords: ['code', 'github', 'library', 'npm', 'repository', 'open source', 'sdk', 'framework', 'developer', 'package'],
        input_schema: { query: 'string', language: 'string?' },
        output_schema: { repositories: 'array', count: 'number' },
        price_usdc: 0, currency: 'free',
      },
    ],
    endpoint: '/api/agent-execute',
    payment_methods: ['free'],
    supported_networks: [],
    status: 'active',
    verification_status: 'trusted',
    total_requests: 91,
    successful_requests: 91,
    avg_response_ms: 350,
    created_at: '2026-09-01T00:00:00Z',
  },
]

// ── Registry accessors — Phase 1/2 services ───────────────────────────────────

export function getEnabledServices(): NanService[] {
  return SERVICE_REGISTRY.filter(s => s.enabled)
}

export function getAllServices(): NanService[] {
  return [...SERVICE_REGISTRY]
}

export function getServiceById(id: string): NanService | undefined {
  return SERVICE_REGISTRY.find(s => s.service_id === id)
}

export function getServicesByCategory(category: ServiceCategory): NanService[] {
  return SERVICE_REGISTRY.filter(s => s.category === category && s.enabled)
}

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
    if (svc.capabilities.some(c => intent.toLowerCase().includes(c.toLowerCase()))) score = Math.min(1, score + 0.3)
    return { service: svc, capability_match: bestCapability, score }
  })
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults)
}

// ── Registry accessors — Phase 3A network agents ──────────────────────────────

export function getAllNetworkAgents(): NetworkAgent[] {
  return [...AGENT_NETWORK_REGISTRY]
}

export function getActiveNetworkAgents(): NetworkAgent[] {
  return AGENT_NETWORK_REGISTRY.filter(a => a.status === 'active')
}

export function getNetworkAgentById(id: string): NetworkAgent | undefined {
  return AGENT_NETWORK_REGISTRY.find(a => a.agent_id === id)
}

export function getNetworkAgentsByCategory(category: ServiceCategory): NetworkAgent[] {
  return getActiveNetworkAgents().filter(a => a.categories.includes(category))
}

/**
 * Discover network agents whose capabilities match a free-text intent.
 * Scores against capability keywords for precise matching.
 */
export function discoverNetworkAgents(intent: string): NetworkAgent[] {
  const lower = intent.toLowerCase()
  return getActiveNetworkAgents().filter(agent =>
    agent.capabilities.some(cap =>
      cap.keywords.some(k => lower.includes(k) || k.includes(lower.split(' ')[0]))
    )
  )
}

/**
 * Search network agents by name/description/capability keywords.
 */
export function searchNetworkAgents(query: string): NetworkAgent[] {
  const lower = query.toLowerCase()
  return getActiveNetworkAgents().filter(agent =>
    agent.name.toLowerCase().includes(lower) ||
    agent.description.toLowerCase().includes(lower) ||
    agent.capabilities.some(cap =>
      cap.name.toLowerCase().includes(lower) ||
      cap.description.toLowerCase().includes(lower) ||
      cap.keywords.some(k => k.includes(lower) || lower.includes(k))
    )
  )
}

export const ALL_CATEGORIES: ServiceCategory[] = [
  'research', 'search', 'travel', 'career', 'supplier',
  'commerce', 'data', 'developer', 'ai', 'infrastructure',
  'digital_services', 'other_agents',
]
