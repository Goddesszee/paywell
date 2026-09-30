/**
 * NAN Agent Orchestrator — Phase 1
 *
 * Implements the full pipeline:
 *   decomposeTask → discoverServices → checkPolicy → executeService → synthesizeResult
 *
 * SECURITY:
 *   - Never auto-executes paid services without policy check
 *   - Payments always route through the existing Nan wallet architecture
 *   - No private keys or secrets live in this module
 */

import { discoverServices, getServiceById, type NanService, type ServiceDiscoveryResult } from './agent-registry'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskType =
  | 'direct_answer'      // Agent can answer without an external service
  | 'web_search'         // Needs a search engine
  | 'travel_search'      // Needs a travel/flight/hotel service
  | 'research'           // Needs deep research / synthesis
  | 'data_lookup'        // Needs structured data (prices, FX, etc.)
  | 'ai_generation'      // Needs an AI service for generation / translation
  | 'supplier_search'    // Needs supplier / product sourcing
  | 'career_search'      // Needs job listings
  | 'developer_tools'    // Needs code / repo search
  | 'agent_marketplace'  // Needs another autonomous agent
  | 'unknown'

export type ExecutionStatus =
  | 'pending'
  | 'discovering'
  | 'awaiting_confirmation'
  | 'executing'
  | 'complete'
  | 'blocked_by_policy'
  | 'no_service_found'
  | 'failed'

export interface PolicyCheck {
  allowed: boolean
  reason: string
  requiresConfirmation: boolean
  estimatedCost: number
}

export interface ExecutionPlan {
  taskId: string
  userRequest: string
  taskType: TaskType
  intent: string
  steps: string[]
  services: ServiceDiscoveryResult[]
  selectedService: NanService | null
  policyCheck: PolicyCheck
  requiresConfirmation: boolean
}

export interface OrchestrationUpdate {
  step: 'decompose' | 'discover' | 'policy' | 'execute' | 'synthesize' | 'complete' | 'error'
  message: string
  data?: unknown
}

export interface OrchestrationResult {
  taskId: string
  status: ExecutionStatus
  plan: ExecutionPlan
  result: string
  servicesConsidered: ServiceDiscoveryResult[]
  selectedService: NanService | null
  costUsdc: number
  updates: OrchestrationUpdate[]
}

export interface AgentPolicy {
  enabled: boolean
  dailyLimit: number
  dailyUsed: number
  perServiceLimit: number
  requireApprovalAbove: number
  requireApproval: boolean
}

// ── Intent classification ──────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ type: TaskType; patterns: string[] }> = [
  { type: 'travel_search',    patterns: ['flight', 'hotel', 'flights', 'travel', 'fly', 'book trip', 'cheapest flight', 'ticket', 'accommodation', 'where to stay'] },
  { type: 'web_search',       patterns: ['search', 'find', 'look up', 'what is', 'who is', 'where is', 'news', 'latest', 'current', 'tell me about', 'information about'] },
  { type: 'research',         patterns: ['research', 'analyze', 'compare', 'deep dive', 'explain in detail', 'comprehensive', 'summarize', 'overview of'] },
  { type: 'data_lookup',      patterns: ['price of', 'how much is', 'exchange rate', 'convert', 'crypto price', 'bitcoin', 'ethereum', 'market cap', 'usd to', 'rate'] },
  { type: 'supplier_search',  patterns: ['supplier', 'manufacturer', 'wholesale', 'bulk', 'source', 'alibaba', 'factory', 'import', 'product sourcing'] },
  { type: 'career_search',    patterns: ['job', 'jobs', 'career', 'hiring', 'employment', 'work', 'vacancy', 'position', 'role', 'remote work'] },
  { type: 'ai_generation',    patterns: ['write', 'draft', 'translate', 'generate', 'create text', 'summarize this', 'rewrite', 'make this', 'edit this'] },
  { type: 'developer_tools',  patterns: ['github', 'code', 'library', 'npm package', 'repository', 'open source', 'api', 'sdk', 'framework'] },
  { type: 'agent_marketplace',patterns: ['agent', 'autonomous', 'circle agent', 'find an agent', 'ai service', 'agent marketplace'] },
]

export function classifyIntent(userRequest: string): TaskType {
  const lower = userRequest.toLowerCase()
  for (const { type, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return type
  }
  // Fallback: if it ends with a question mark or starts with "what/who/where/how" → web search
  if (/^(what|who|where|how|when|why|is |are |can |does |do )/i.test(lower) || lower.endsWith('?')) return 'web_search'
  return 'direct_answer'
}

// ── Policy check ──────────────────────────────────────────────────────────────

export function checkPolicy(service: NanService, policy: AgentPolicy): PolicyCheck {
  if (!policy.enabled) {
    return { allowed: false, reason: 'NAN Agent is disabled. Enable it in the Policy tab.', requiresConfirmation: false, estimatedCost: service.price_usdc }
  }
  if (service.price_usdc > policy.perServiceLimit) {
    return { allowed: false, reason: `Service costs ${service.price_usdc} USDC but your per-service limit is ${policy.perServiceLimit} USDC.`, requiresConfirmation: false, estimatedCost: service.price_usdc }
  }
  const remaining = policy.dailyLimit - policy.dailyUsed
  if (service.price_usdc > remaining) {
    return { allowed: false, reason: `Only ${remaining.toFixed(2)} USDC remains today (daily limit ${policy.dailyLimit} USDC).`, requiresConfirmation: false, estimatedCost: service.price_usdc }
  }
  const needsConfirmation = policy.requireApproval || service.price_usdc > policy.requireApprovalAbove
  if (needsConfirmation && service.price_usdc > 0) {
    return { allowed: true, reason: `Service costs ${service.price_usdc} USDC. Requires your confirmation.`, requiresConfirmation: true, estimatedCost: service.price_usdc }
  }
  return { allowed: true, reason: service.price_usdc === 0 ? 'Free service — no payment required.' : `${service.price_usdc} USDC will be used from your agent wallet.`, requiresConfirmation: false, estimatedCost: service.price_usdc }
}

// ── Execution plan builder ─────────────────────────────────────────────────────

export function buildPlan(
  userRequest: string,
  taskType: TaskType,
  services: ServiceDiscoveryResult[],
  policy: AgentPolicy,
): ExecutionPlan {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const selected = services[0]?.service ?? null
  const policyCheck = selected ? checkPolicy(selected, policy) : {
    allowed: false, reason: 'No matching service found.', requiresConfirmation: false, estimatedCost: 0,
  }

  const steps = taskType === 'direct_answer'
    ? ['Answering directly from NAN Agent knowledge.']
    : [
        `Identified task type: ${taskType.replace(/_/g, ' ')}`,
        `Discovered ${services.length} matching service${services.length !== 1 ? 's' : ''}`,
        selected ? `Selected: ${selected.name} (${selected.provider})` : 'No suitable service found',
        selected?.price_usdc ? `Estimated cost: ${selected.price_usdc} USDC` : 'Service is free',
        policyCheck.requiresConfirmation ? 'Awaiting your confirmation before proceeding' : policyCheck.allowed ? 'Policy approved — ready to execute' : `Blocked: ${policyCheck.reason}`,
      ]

  return {
    taskId,
    userRequest,
    taskType,
    intent: userRequest,
    steps,
    services,
    selectedService: selected,
    policyCheck,
    requiresConfirmation: policyCheck.requiresConfirmation,
  }
}

// ── Main orchestration pipeline ───────────────────────────────────────────────

export async function orchestrate(
  userRequest: string,
  policy: AgentPolicy,
  onUpdate?: (update: OrchestrationUpdate) => void,
  confirmedServiceId?: string,   // set when user has confirmed a paid service
): Promise<OrchestrationResult> {
  const updates: OrchestrationUpdate[] = []
  const emit = (u: OrchestrationUpdate) => { updates.push(u); onUpdate?.(u) }

  // 1. Decompose
  emit({ step: 'decompose', message: 'Understanding your request…' })
  await delay(180)
  const taskType = classifyIntent(userRequest)

  if (taskType === 'direct_answer') {
    const plan = buildPlan(userRequest, taskType, [], policy)
    emit({ step: 'complete', message: 'Answering directly.' })
    return {
      taskId: plan.taskId, status: 'complete', plan,
      result: '', servicesConsidered: [], selectedService: null,
      costUsdc: 0, updates,
    }
  }

  // 2. Discover services
  emit({ step: 'discover', message: 'Searching service registry…' })
  await delay(250)
  const discovered = discoverServices(userRequest, 5)

  if (discovered.length === 0) {
    const plan = buildPlan(userRequest, taskType, [], policy)
    emit({ step: 'error', message: 'No matching service found in the registry.' })
    return {
      taskId: plan.taskId, status: 'no_service_found', plan,
      result: `I couldn't find a registered service to help with "${userRequest}". I'll answer from my own knowledge instead.`,
      servicesConsidered: [], selectedService: null, costUsdc: 0, updates,
    }
  }

  emit({ step: 'discover', message: `Found ${discovered.length} matching service${discovered.length > 1 ? 's' : ''}: ${discovered.map(d => d.service.name).join(', ')}`, data: discovered })

  // 3. Policy check
  emit({ step: 'policy', message: 'Checking spending policy…' })
  await delay(150)

  const selected = confirmedServiceId
    ? (getServiceById(confirmedServiceId) ?? discovered[0].service)
    : discovered[0].service

  const policyCheck = checkPolicy(selected, policy)
  const plan = buildPlan(userRequest, taskType, discovered, policy)

  if (!policyCheck.allowed) {
    emit({ step: 'error', message: `Blocked by policy: ${policyCheck.reason}` })
    return {
      taskId: plan.taskId, status: 'blocked_by_policy', plan,
      result: `I found a service (${selected.name}) but it's blocked by your spending policy: ${policyCheck.reason}`,
      servicesConsidered: discovered, selectedService: selected, costUsdc: 0, updates,
    }
  }

  if (policyCheck.requiresConfirmation && !confirmedServiceId) {
    emit({ step: 'policy', message: `Confirmation needed: ${policyCheck.reason}`, data: { service: selected, cost: selected.price_usdc } })
    return {
      taskId: plan.taskId, status: 'awaiting_confirmation', plan,
      result: `I found **${selected.name}** by ${selected.provider}. Cost: **${selected.price_usdc} USDC**. Confirm to proceed.`,
      servicesConsidered: discovered, selectedService: selected, costUsdc: 0, updates,
    }
  }

  // 4. Execute
  emit({ step: 'execute', message: `Calling ${selected.name}…` })
  await delay(400)

  // Return the plan + service info. Actual HTTP calls happen server-side via /api/agent-execute
  // The frontend passes this to the backend which holds the API keys securely.
  emit({ step: 'synthesize', message: 'Preparing results…' })
  await delay(200)

  emit({ step: 'complete', message: 'Done.' })

  return {
    taskId: plan.taskId,
    status: 'complete',
    plan,
    result: `__EXECUTE__:${selected.service_id}`,   // sentinel — AgentPage replaces this with the API call result
    servicesConsidered: discovered,
    selectedService: selected,
    costUsdc: selected.price_usdc,
    updates,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
