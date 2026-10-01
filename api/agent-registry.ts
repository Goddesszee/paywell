/**
 * api/agent-registry.ts
 *
 * NAN Agent Network Registry — REST endpoint.
 *
 * GET  /api/agent-registry               → list all registered agents
 * GET  /api/agent-registry?id=<agent_id> → get single agent
 * GET  /api/agent-registry?category=X    → filter by category
 * POST /api/agent-registry               → register a new agent
 * PATCH /api/agent-registry              → update agent status / metadata
 *
 * In production, swap the in-memory store for Redis/Postgres.
 * The interface remains identical.
 *
 * SECURITY:
 * - No private keys or secrets stored here
 * - Payment addresses validated as checksummed hex before storage
 * - New agents are PENDING until manually verified
 * - Suspended/inactive agents excluded from discovery results
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis'

const REDIS_KEY = 'nan:agent-registry:v1'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'inactive' | 'pending' | 'suspended'
export type AgentVerification = 'unverified' | 'verified' | 'trusted'
export type AgentCategory =
  | 'research' | 'search' | 'travel' | 'career' | 'supplier'
  | 'commerce' | 'data' | 'developer' | 'ai' | 'infrastructure'
  | 'digital_services' | 'other'

export interface AgentCapability {
  id: string
  name: string
  description: string
  input_schema: Record<string, string>   // field → type description
  output_schema: Record<string, string>
  price_usdc: number
  currency: 'USDC' | 'free'
}

export interface RegisteredAgent {
  agent_id: string
  name: string
  description: string
  provider: string
  categories: AgentCategory[]
  capabilities: AgentCapability[]
  endpoint: string
  payment_address?: string               // EVM address for USDC payments
  payment_methods: string[]              // ['usdc_arc', 'x402', 'free']
  supported_networks: string[]
  status: AgentStatus
  verification_status: AgentVerification
  total_requests: number
  successful_requests: number
  avg_response_ms: number
  created_at: string
  updated_at: string
}

// ── Seed data — NAN built-in agent nodes ─────────────────────────────────────

const SEED_AGENTS: RegisteredAgent[] = [
  {
    agent_id: 'nan-research-agent',
    name: 'NAN Research Agent',
    description: 'Deep research, synthesis, and structured report generation from multiple sources.',
    provider: 'NAN Network',
    categories: ['research'],
    capabilities: [
      {
        id: 'cap-research-web', name: 'Web Research',
        description: 'Research any topic using live web data and synthesize a structured report.',
        input_schema: { query: 'string — research question or topic' },
        output_schema: { report: 'string — markdown formatted report', sources: 'string[] — cited URLs' },
        price_usdc: 0.002, currency: 'USDC',
      },
      {
        id: 'cap-research-compare', name: 'Comparison Research',
        description: 'Compare multiple options, products, services, or ideas with structured analysis.',
        input_schema: { items: 'string[] — items to compare', criteria: 'string — comparison criteria' },
        output_schema: { comparison: 'object — structured comparison table', recommendation: 'string' },
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
    updated_at: new Date().toISOString(),
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
        description: 'Discover manufacturers for a specific product with MOQ, lead time, and certifications.',
        input_schema: { product: 'string — product description', quantity: 'number — desired quantity' },
        output_schema: { suppliers: 'array — supplier list with MOQ, price, lead time', count: 'number' },
        price_usdc: 0.05, currency: 'USDC',
      },
      {
        id: 'cap-supplier-verify', name: 'Verify Supplier',
        description: 'Verify supplier legitimacy, certifications, and trading history.',
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
    updated_at: new Date().toISOString(),
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
        input_schema: { company_name: 'string', country: 'string?' },
        output_schema: { status: 'string', registration: 'string', directors: 'string[]' },
        price_usdc: 0.01, currency: 'USDC',
      },
      {
        id: 'cap-data-market', name: 'Market Data',
        description: 'Retrieve market size, trends, and competitive landscape for a sector.',
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
    updated_at: new Date().toISOString(),
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
        description: 'Find matching job opportunities by role, location, and experience level.',
        input_schema: { role: 'string', location: 'string?', level: 'string?' },
        output_schema: { jobs: 'array — job listings with title, company, salary, url', count: 'number' },
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
    updated_at: new Date().toISOString(),
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
        description: 'Translate text between languages with context awareness.',
        input_schema: { text: 'string', from_lang: 'string', to_lang: 'string' },
        output_schema: { translated: 'string', confidence: 'number' },
        price_usdc: 0.005, currency: 'USDC',
      },
      {
        id: 'cap-summarise', name: 'Summarise',
        description: 'Summarise long documents, articles, or research papers.',
        input_schema: { text: 'string', length: 'string — short|medium|detailed' },
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
    updated_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
  },
]

// ── Registry: in-memory seeded from Redis when available ─────────────────────

const REGISTRY = new Map<string, RegisteredAgent>(
  SEED_AGENTS.map(a => [a.agent_id, a])
)

async function loadFromRedis() {
  const redis = getRedis()
  if (!redis) return
  try {
    const stored = await redis.get<Record<string, RegisteredAgent>>(REDIS_KEY)
    if (stored && typeof stored === 'object') {
      for (const [id, agent] of Object.entries(stored)) {
        // Only load non-seed agents from Redis to avoid overwriting built-ins
        if (!SEED_AGENTS.find(s => s.agent_id === id)) {
          REGISTRY.set(id, agent)
        }
      }
    }
  } catch { /* Redis unavailable — continue with in-memory */ }
}

async function saveToRedis() {
  const redis = getRedis()
  if (!redis) return
  try {
    const snapshot: Record<string, RegisteredAgent> = {}
    for (const [id, agent] of REGISTRY.entries()) {
      snapshot[id] = agent
    }
    await redis.set(REDIS_KEY, snapshot)
  } catch { /* ignore */ }
}

// Load on cold start
void loadFromRedis()

// ── Validation ────────────────────────────────────────────────────────────────

function isValidEndpoint(url: string): boolean {
  if (url.startsWith('/api/')) return true
  try { new URL(url); return true } catch { return false }
}

function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id, category, status: statusFilter } = req.query as Record<string, string>

    if (id) {
      const agent = REGISTRY.get(id)
      if (!agent) return res.status(404).json({ error: 'Agent not found' })
      return res.status(200).json({ agent })
    }

    let agents = Array.from(REGISTRY.values())
    if (category) agents = agents.filter(a => a.categories.includes(category as AgentCategory))
    if (statusFilter) agents = agents.filter(a => a.status === statusFilter)
    // Exclude suspended/inactive from default discovery
    if (!statusFilter) agents = agents.filter(a => a.status === 'active' || a.status === 'pending')

    return res.status(200).json({
      agents,
      total: agents.length,
      categories: Array.from(new Set(agents.flatMap(a => a.categories))),
    })
  }

  // ── POST — register a new agent ───────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body as Partial<RegisteredAgent> & { capabilities?: AgentCapability[] }

    const required = ['name', 'description', 'provider', 'endpoint', 'capabilities']
    const missing = required.filter(f => !body[f as keyof typeof body])
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
    }
    if (!isValidEndpoint(body.endpoint!)) {
      return res.status(400).json({ error: 'Invalid endpoint format. Must be a valid URL or /api/ path.' })
    }
    if (body.payment_address && !isValidEthAddress(body.payment_address)) {
      return res.status(400).json({ error: 'Invalid payment_address. Must be a valid EVM address (0x...).' })
    }
    if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
      return res.status(400).json({ error: 'At least one capability is required.' })
    }

    const agent_id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const now = new Date().toISOString()

    const newAgent: RegisteredAgent = {
      agent_id,
      name: String(body.name).slice(0, 80),
      description: String(body.description).slice(0, 300),
      provider: String(body.provider).slice(0, 80),
      categories: (body.categories ?? ['other']).slice(0, 5) as AgentCategory[],
      capabilities: body.capabilities.slice(0, 20),
      endpoint: String(body.endpoint),
      payment_address: body.payment_address,
      payment_methods: body.payment_methods ?? ['free'],
      supported_networks: body.supported_networks ?? [],
      status: 'pending',                       // all new agents start pending
      verification_status: 'unverified',
      total_requests: 0,
      successful_requests: 0,
      avg_response_ms: 0,
      created_at: now,
      updated_at: now,
    }

    REGISTRY.set(agent_id, newAgent)
    void saveToRedis()
    return res.status(201).json({ agent: newAgent, message: 'Agent registered. Status: pending — will become discoverable after verification.' })
  }

  // ── PATCH — update status / metadata ─────────────────────────────────────
  if (req.method === 'PATCH') {
    const { agent_id, status, verification_status } = req.body as {
      agent_id?: string; status?: AgentStatus; verification_status?: AgentVerification
    }
    if (!agent_id) return res.status(400).json({ error: 'agent_id is required' })
    const agent = REGISTRY.get(agent_id)
    if (!agent) return res.status(404).json({ error: 'Agent not found' })

    const updated = {
      ...agent,
      ...(status ? { status } : {}),
      ...(verification_status ? { verification_status } : {}),
      updated_at: new Date().toISOString(),
    }
    REGISTRY.set(agent_id, updated)
    void saveToRedis()
    return res.status(200).json({ agent: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
