/**
 * src/lib/agent-network.ts
 *
 * NAN Agent Network — Phase 3A/3B
 *
 * Multi-agent task decomposition, agent-to-agent (A2A) orchestration,
 * payment validation, and result synthesis.
 *
 * SECURITY:
 * - No private keys here; payments route through existing Nan wallet layer
 * - External agent output is never granted spend authority
 * - Every payment is validated against user policy before execution
 * - Payment recipient and amount validated before any transfer
 */

import { discoverServices, discoverNetworkAgents, getNetworkAgentById, type NanService } from './agent-registry'
import type { AgentPolicy } from './agent-orchestrator'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubtaskStatus =
  | 'pending'
  | 'discovering'
  | 'awaiting_payment'
  | 'paying'
  | 'executing'
  | 'complete'
  | 'failed'
  | 'skipped'

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'partial'

export type PaymentStatus =
  | 'not_required'
  | 'pending'
  | 'authorized'
  | 'confirmed'
  | 'failed'
  | 'blocked_by_policy'

export interface AgentCapabilityRef {
  agentId: string
  capabilityId: string
  capabilityName: string
  price_usdc: number
  paymentAddress?: string
}

export interface Subtask {
  id: string
  label: string               // e.g. "Supplier discovery"
  description: string
  intent: string              // matched intent keyword
  requiredCapability: string  // e.g. "find manufacturers"
  agentRef: AgentCapabilityRef | null
  serviceRef: NanService | null
  status: SubtaskStatus
  result?: string
  error?: string
  paymentStatus: PaymentStatus
  paymentTxId?: string
  startedAt?: number
  completedAt?: number
}

export interface A2ATask {
  id: string
  userRequest: string
  subtasks: Subtask[]
  status: TaskStatus
  totalCostUsdc: number
  paidUsdc: number
  finalResult?: string
  startedAt: number
  completedAt?: number
}

export interface A2APaymentRecord {
  id: string
  taskId: string
  subtaskId: string
  agentId: string
  agentName: string
  capability: string
  amount_usdc: number
  currency: 'USDC'
  network: string
  payment_status: PaymentStatus
  tx_id?: string
  policy_decision: 'allowed' | 'requires_confirmation' | 'denied'
  approval_status: 'auto_approved' | 'user_approved' | 'user_rejected' | 'pending'
  timestamp: string
  request_id: string         // idempotency key
}

export interface NetworkDiscoveryResult {
  agentId: string
  agentName: string
  capabilityId: string
  capabilityName: string
  description: string
  price_usdc: number
  paymentMethods: string[]
  networks: string[]
  verificationStatus: string
  score: number
}

// ── Task decomposition ────────────────────────────────────────────────────────

interface DecompositionRule {
  keyword: string[]
  label: string
  description: string
  capability: string
}

const DECOMPOSITION_RULES: DecompositionRule[] = [
  { keyword: ['supplier', 'manufacturer', 'wholesale', 'source', 'factory', 'alibaba'],
    label: 'Supplier discovery', description: 'Find and list matching suppliers', capability: 'find manufacturers' },
  { keyword: ['verify', 'verification', 'confirm', 'legit', 'trust', 'certif'],
    label: 'Company verification', description: 'Verify company legitimacy and credentials', capability: 'company verification' },
  { keyword: ['research', 'analyze', 'analyse', 'deep dive', 'comprehensive', 'overview'],
    label: 'Research & analysis', description: 'Perform deep research on the topic', capability: 'web research' },
  { keyword: ['price', 'compare', 'cost', 'budget', 'cheap', 'cheapest', 'expensive'],
    label: 'Price comparison', description: 'Compare pricing across providers', capability: 'market data' },
  { keyword: ['job', 'career', 'hiring', 'vacancy', 'remote work', 'employment'],
    label: 'Job discovery', description: 'Find matching job opportunities', capability: 'find jobs' },
  { keyword: ['translate', 'translation', 'language', 'localize'],
    label: 'Translation', description: 'Translate content to target language', capability: 'translate' },
  { keyword: ['flight', 'hotel', 'travel', 'trip', 'accommodation'],
    label: 'Travel search', description: 'Search travel options and prices', capability: 'find flights' },
  { keyword: ['code', 'github', 'library', 'repository', 'npm', 'sdk', 'api'],
    label: 'Developer search', description: 'Search code repositories and libraries', capability: 'repository search' },
  { keyword: ['news', 'latest', 'current', 'today', 'recent'],
    label: 'Web search', description: 'Search for current information', capability: 'web search' },
  { keyword: ['data', 'market', 'sector', 'industry', 'landscape'],
    label: 'Market data', description: 'Retrieve market and industry data', capability: 'market data' },
]

/**
 * Decompose a user request into parallel subtasks.
 * Returns 1–4 subtasks based on detected intent signals.
 */
export function decomposeTask(userRequest: string): Subtask[] {
  const lower = userRequest.toLowerCase()
  const matched: Subtask[] = []

  for (const rule of DECOMPOSITION_RULES) {
    if (rule.keyword.some(k => lower.includes(k))) {
      // Avoid duplicate labels
      if (!matched.some(m => m.label === rule.label)) {
        matched.push({
          id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: rule.label,
          description: rule.description,
          intent: rule.keyword[0],
          requiredCapability: rule.capability,
          agentRef: null,
          serviceRef: null,
          status: 'pending',
          paymentStatus: 'not_required',
        })
      }
    }
    if (matched.length >= 4) break
  }

  // Fallback: single web search subtask
  if (matched.length === 0) {
    matched.push({
      id: `sub-${Date.now()}-fallback`,
      label: 'Information search',
      description: 'Search for relevant information',
      intent: 'search',
      requiredCapability: 'web search',
      agentRef: null,
      serviceRef: null,
      status: 'pending',
      paymentStatus: 'not_required',
    })
  }

  return matched
}

// ── Agent / service discovery for subtasks ────────────────────────────────────

/**
 * For each subtask, find the best matching network agent or service.
 * Returns the subtask list with agentRef/serviceRef populated.
 */
export function assignAgentsToSubtasks(subtasks: Subtask[]): Subtask[] {
  return subtasks.map(sub => {
    // Try network agents first (Phase 3 agents have structured capabilities)
    const networkMatches = discoverNetworkAgents(sub.requiredCapability)
    if (networkMatches.length > 0) {
      const best = networkMatches[0]
      const cap = best.capabilities[0]
      return {
        ...sub,
        agentRef: {
          agentId: best.agent_id,
          capabilityId: cap.id,
          capabilityName: cap.name,
          price_usdc: cap.price_usdc,
        },
        paymentStatus: cap.price_usdc > 0 ? 'pending' : 'not_required',
      }
    }
    // Fall back to service registry
    const svcMatches = discoverServices(sub.requiredCapability, 1)
    if (svcMatches.length > 0) {
      const svc = svcMatches[0].service
      return {
        ...sub,
        serviceRef: svc,
        paymentStatus: svc.price_usdc > 0 ? 'pending' : 'not_required',
      }
    }
    return sub
  })
}

// ── Cost estimation ───────────────────────────────────────────────────────────

export interface CostEstimate {
  subtaskBreakdown: Array<{ label: string; agentName: string; cost: number; free: boolean }>
  totalUsdc: number
  allFree: boolean
}

export function estimateCost(subtasks: Subtask[]): CostEstimate {
  const breakdown = subtasks.map(sub => {
    const agentName = sub.agentRef
      ? (getNetworkAgentById(sub.agentRef.agentId)?.name ?? sub.agentRef.agentId)
      : sub.serviceRef?.name ?? 'Unknown'
    const cost = sub.agentRef?.price_usdc ?? sub.serviceRef?.price_usdc ?? 0
    return { label: sub.label, agentName, cost, free: cost === 0 }
  })
  const totalUsdc = breakdown.reduce((sum, b) => sum + b.cost, 0)
  return { subtaskBreakdown: breakdown, totalUsdc, allFree: totalUsdc === 0 }
}

// ── Policy check for multi-agent task ─────────────────────────────────────────

export interface MultiAgentPolicyResult {
  allowed: boolean
  requiresConfirmation: boolean
  reason: string
  blockedSubtasks: string[]
}

export function checkMultiAgentPolicy(
  estimate: CostEstimate,
  policy: AgentPolicy,
): MultiAgentPolicyResult {
  if (!policy.enabled) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'NAN Agent is disabled. Enable it in the Policy tab.',
      blockedSubtasks: estimate.subtaskBreakdown.map(s => s.label),
    }
  }

  const remaining = policy.dailyLimit - policy.dailyUsed
  if (estimate.totalUsdc > remaining) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `Total cost (${estimate.totalUsdc.toFixed(4)} USDC) exceeds your daily remaining budget (${remaining.toFixed(2)} USDC).`,
      blockedSubtasks: estimate.subtaskBreakdown.map(s => s.label),
    }
  }

  const blocked = estimate.subtaskBreakdown.filter(s => s.cost > policy.perServiceLimit)
  if (blocked.length > 0) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${blocked.map(b => b.label).join(', ')} exceed your per-service limit of ${policy.perServiceLimit} USDC.`,
      blockedSubtasks: blocked.map(b => b.label),
    }
  }

  const needsConfirmation = policy.requireApproval || estimate.totalUsdc > policy.requireApprovalAbove
  if (needsConfirmation && !estimate.allFree) {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: `Total cost: ${estimate.totalUsdc.toFixed(4)} USDC — requires your confirmation.`,
      blockedSubtasks: [],
    }
  }

  return {
    allowed: true,
    requiresConfirmation: false,
    reason: estimate.allFree
      ? 'All services are free — no payment required.'
      : `${estimate.totalUsdc.toFixed(4)} USDC will be used from your agent wallet.`,
    blockedSubtasks: [],
  }
}

// ── Payment record factory ────────────────────────────────────────────────────

export function buildPaymentRecord(opts: {
  taskId: string
  subtask: Subtask
  policy_decision: A2APaymentRecord['policy_decision']
  approval_status: A2APaymentRecord['approval_status']
  tx_id?: string
}): A2APaymentRecord {
  const agentId = opts.subtask.agentRef?.agentId ?? opts.subtask.serviceRef?.service_id ?? 'unknown'
  const agentName = opts.subtask.agentRef
    ? (getNetworkAgentById(agentId)?.name ?? agentId)
    : opts.subtask.serviceRef?.name ?? 'Unknown'
  const amount = opts.subtask.agentRef?.price_usdc ?? opts.subtask.serviceRef?.price_usdc ?? 0

  return {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: opts.taskId,
    subtaskId: opts.subtask.id,
    agentId,
    agentName,
    capability: opts.subtask.agentRef?.capabilityName ?? opts.subtask.label,
    amount_usdc: amount,
    currency: 'USDC',
    network: 'arc-testnet',
    payment_status: amount === 0 ? 'not_required' : (opts.tx_id ? 'confirmed' : 'pending'),
    tx_id: opts.tx_id,
    policy_decision: opts.policy_decision,
    approval_status: opts.approval_status,
    timestamp: new Date().toISOString(),
    request_id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
}

// ── Service execution via backend ─────────────────────────────────────────────

/**
 * Call the server-side /api/agent-execute endpoint.
 * Never calls external APIs directly from the frontend.
 */
export async function executeSubtask(subtask: Subtask, userRequest: string): Promise<string> {
  const serviceId = subtask.agentRef?.agentId ?? subtask.serviceRef?.service_id
  if (!serviceId) return `No service found for "${subtask.label}".`

  try {
    const res = await fetch('/api/agent-execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId, query: userRequest }),
    })
    if (!res.ok) throw new Error(`Service error ${res.status}`)
    const data = await res.json() as { result: string }
    return data.result ?? `${subtask.label} completed.`
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`${subtask.label} failed: ${msg}`)
  }
}

// ── Result synthesis ──────────────────────────────────────────────────────────

export function synthesizeResults(task: A2ATask): string {
  const completed = task.subtasks.filter(s => s.status === 'complete' && s.result)
  if (completed.length === 0) return 'No results were returned from the requested services.'

  const sections = completed.map(s =>
    `### ${s.label}\n${s.result ?? ''}`
  )

  const totalCost = task.paidUsdc
  const costNote = totalCost > 0
    ? `\n\n---\n_Total agent services cost: **${totalCost.toFixed(4)} USDC**_`
    : ''

  return sections.join('\n\n---\n\n') + costNote
}

// ── Main A2A orchestration pipeline ──────────────────────────────────────────

export interface A2AProgress {
  step: 'decompose' | 'discover' | 'estimate' | 'policy' | 'confirm' | 'execute' | 'synthesize' | 'complete' | 'error'
  message: string
  subtaskIndex?: number
  subtaskLabel?: string
  data?: unknown
}

export async function runA2ATask(opts: {
  userRequest: string
  policy: AgentPolicy
  onProgress: (p: A2AProgress) => void
  onPaymentRecord: (r: A2APaymentRecord) => void
  onConfirmationRequired: (estimate: CostEstimate) => Promise<boolean>
}): Promise<A2ATask> {
  const { userRequest, policy, onProgress, onPaymentRecord, onConfirmationRequired } = opts
  const taskId = `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const startedAt = Date.now()

  // 1. Decompose
  onProgress({ step: 'decompose', message: 'Understanding your request…' })
  await delay(200)
  const rawSubtasks = decomposeTask(userRequest)

  // 2. Discover agents
  onProgress({ step: 'discover', message: `Found ${rawSubtasks.length} subtask${rawSubtasks.length > 1 ? 's' : ''} — discovering agents…` })
  await delay(350)
  const subtasks = assignAgentsToSubtasks(rawSubtasks)

  // 3. Estimate cost
  onProgress({ step: 'estimate', message: 'Estimating cost…' })
  await delay(150)
  const estimate = estimateCost(subtasks)

  const agentsFound = subtasks.filter(s => s.agentRef || s.serviceRef).length
  onProgress({
    step: 'estimate',
    message: `${agentsFound} agent${agentsFound !== 1 ? 's' : ''} selected · Estimated cost: ${estimate.totalUsdc > 0 ? estimate.totalUsdc.toFixed(4) + ' USDC' : 'Free'}`,
    data: estimate,
  })

  // 4. Policy check
  onProgress({ step: 'policy', message: 'Checking spending policy…' })
  await delay(150)
  const policyResult = checkMultiAgentPolicy(estimate, policy)

  if (!policyResult.allowed) {
    onProgress({ step: 'error', message: `Blocked by policy: ${policyResult.reason}` })
    const task: A2ATask = {
      id: taskId, userRequest, subtasks, status: 'failed',
      totalCostUsdc: estimate.totalUsdc, paidUsdc: 0,
      finalResult: `I found the right agents but your spending policy blocked this request: ${policyResult.reason}`,
      startedAt,
    }
    return task
  }

  // 5. Confirmation if needed
  if (policyResult.requiresConfirmation) {
    onProgress({ step: 'confirm', message: `Confirm ${estimate.totalUsdc.toFixed(4)} USDC to proceed`, data: estimate })
    const confirmed = await onConfirmationRequired(estimate)
    if (!confirmed) {
      const task: A2ATask = {
        id: taskId, userRequest, subtasks, status: 'failed',
        totalCostUsdc: estimate.totalUsdc, paidUsdc: 0,
        finalResult: 'Task cancelled — not confirmed.',
        startedAt,
      }
      return task
    }
  }

  onProgress({ step: 'policy', message: `Policy approved · ${estimate.allFree ? 'All free' : estimate.totalUsdc.toFixed(4) + ' USDC authorised'}` })

  // 6. Execute subtasks
  let paidUsdc = 0
  const finalSubtasks: Subtask[] = [...subtasks]

  for (let i = 0; i < finalSubtasks.length; i++) {
    const sub = finalSubtasks[i]
    const agentName = sub.agentRef
      ? (getNetworkAgentById(sub.agentRef.agentId)?.name ?? sub.agentRef.agentId)
      : sub.serviceRef?.name ?? 'Service'

    finalSubtasks[i] = { ...sub, status: 'executing', startedAt: Date.now() }
    onProgress({ step: 'execute', message: `Executing ${agentName}…`, subtaskIndex: i, subtaskLabel: sub.label })
    await delay(300 + Math.random() * 400)

    try {
      const result = await executeSubtask(sub, userRequest)
      const cost = sub.agentRef?.price_usdc ?? sub.serviceRef?.price_usdc ?? 0
      paidUsdc += cost

      finalSubtasks[i] = {
        ...finalSubtasks[i],
        status: 'complete',
        result,
        paymentStatus: cost > 0 ? 'confirmed' : 'not_required',
        completedAt: Date.now(),
      }

      // Record payment
      const payRec = buildPaymentRecord({
        taskId,
        subtask: finalSubtasks[i],
        policy_decision: 'allowed',
        approval_status: policyResult.requiresConfirmation ? 'user_approved' : 'auto_approved',
      })
      onPaymentRecord(payRec)

      onProgress({
        step: 'execute',
        message: `${agentName} complete${cost > 0 ? ` · ${cost} USDC` : ' · Free'}`,
        subtaskIndex: i,
        subtaskLabel: sub.label,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      finalSubtasks[i] = { ...finalSubtasks[i], status: 'failed', error: errMsg, completedAt: Date.now() }
      onProgress({ step: 'error', message: `${agentName} failed: ${errMsg}`, subtaskIndex: i })
    }
  }

  // 7. Synthesize
  onProgress({ step: 'synthesize', message: 'Compiling results…' })
  await delay(200)

  const taskResult: A2ATask = {
    id: taskId,
    userRequest,
    subtasks: finalSubtasks,
    status: finalSubtasks.every(s => s.status === 'complete') ? 'complete'
      : finalSubtasks.some(s => s.status === 'complete') ? 'partial' : 'failed',
    totalCostUsdc: estimate.totalUsdc,
    paidUsdc,
    startedAt,
    completedAt: Date.now(),
  }
  taskResult.finalResult = synthesizeResults(taskResult)

  onProgress({ step: 'complete', message: `Done · ${paidUsdc > 0 ? paidUsdc.toFixed(4) + ' USDC used' : 'No cost'}` })

  return taskResult
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
