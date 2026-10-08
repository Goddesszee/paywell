/**
 * api.ts — NAN backend API client
 *
 * Set VITE_API_URL in .env to point at your backend.
 * Defaults to relative paths (same origin) when not set.
 */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ── Marketplace types (mirrors api/agent-marketplace.ts) ─────────────────────
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

// ── helpers ────────────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  const data = await res.json() as { success?: boolean; error?: string }
  if (!res.ok || data?.success === false) throw new Error(data?.error ?? `${path} failed (${res.status})`)
  return data as unknown as T
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json() as { success?: boolean; error?: string }
  if (!res.ok || data?.success === false) throw new Error(data?.error ?? `GET ${path} failed (${res.status})`)
  return data as unknown as T
}

/** Always true — /api/* routes are available on both Vercel (serverless) and local dev (Express proxy) */
export function backendConfigured(): boolean {
  return true
}

// ── types ──────────────────────────────────────────────────────────────────────

export interface AuthSession {
  email: string
  sessionToken: string
  walletAddress: string
  walletId: string
}

export interface WalletBalance {
  usdc: string
  eurc: string
  walletAddress: string
  walletId: string
}

export interface TxRecord {
  id: string
  type: 'send' | 'receive' | 'swap' | 'bridge' | 'purchase' | 'agent_purchase'
  description: string
  amount: string
  sign: '+' | '-'
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
  counterparty?: string
  txHash?: string
  agentInitiated?: boolean
}


// ── Auth ───────────────────────────────────────────────────────────────────────

export async function sendOtp(email: string): Promise<{ token: string; expiresAt: number; dev?: boolean }> {
  return apiPost('/api/otp', { action: 'send', email })
}

export async function verifyOtp(
  email: string, otp: string, token: string, expiresAt: number,
): Promise<{ sessionToken: string }> {
  return apiPost('/api/otp', { action: 'verify', email, otp, token, expiresAt })
}

// ── Wallet ─────────────────────────────────────────────────────────────────────

export async function getWallet(email: string, sessionToken: string): Promise<WalletBalance> {
  const data = await apiPost<{
    wallet: { id: string; address: string }
    balances: Array<{ symbol: string; amount: string }>
  }>('/api/circle-wallets', { action: 'getWallet', email }, sessionToken)
  return {
    usdc: data.balances?.find((b) => b.symbol === 'USDC')?.amount ?? '0.00',
    eurc: data.balances?.find((b) => b.symbol === 'EURC')?.amount ?? '0.00',
    walletAddress: data.wallet?.address ?? '',
    walletId: data.wallet?.id ?? '',
  }
}

export async function sendUsdc(
  email: string, sessionToken: string,
  to: string, amount: string, token: 'USDC' | 'EURC' = 'USDC',
): Promise<{ txId: string; txHash?: string }> {
  return apiPost('/api/circle-wallets', { action: 'transfer', email, to, amount, tokenSymbol: token }, sessionToken)
}

// ── Activity ───────────────────────────────────────────────────────────────────

export async function getActivity(walletAddress: string, sessionToken?: string): Promise<TxRecord[]> {
  try {
    const data = await apiGet<{ activities?: TxRecord[]; transactions?: TxRecord[] }>(
      `/api/misc?route=activity-feed&address=${walletAddress}`, sessionToken,
    )
    return data.activities ?? data.transactions ?? []
  } catch {
    return []
  }
}

// ── AI chat ────────────────────────────────────────────────────────────────────

export async function sendChat(
  message: string,
  sessionToken: string,
  opts: { userAddress?: string; walletId?: string } = {},
): Promise<{ reply: string }> {
  return apiPost('/api/chat', { message, userAddress: opts.userAddress, walletId: opts.walletId }, sessionToken)
}


/** Full context sent to the NAN AI Agent — extends as platform grows */
export interface NanChatContext {
  // Balances & wallet
  mainBalance?: string
  mainAddress?: string
  agentBalance?: string
  agentAddress?: string
  agentWalletProvisioned?: boolean
  agentWalletId?: string
  agentWalletBlockchain?: string
  agentWalletAccountType?: string
  // Policy
  dailyLimit?: number
  perTxLimit?: number
  perServiceLimit?: number
  remainingToday?: number
  agentEnabled?: boolean
  requireApproval?: boolean
  requireApprovalAbove?: number
  autoApproveUnder?: number
  agentDailyUsed?: number
  // Cross-chain
  crossChainBalances?: Record<string, string>
  crossChainSummary?: string
  totalCrossChainBalance?: string
  // Activity (last 10 tx for context)
  recentActivity?: Array<{
    type: string; amount: number; sign: string; description: string
    counterparty?: string; timestamp: string; status: string; txHash?: string
  }>
  // Recurring tasks
  recurringTasks?: Array<{
    name: string; recipient: string; amount: string; frequency: string
    active: boolean; nextRunAt?: string; runCount: number
  }>
  // Open payment requests
  openPaymentRequests?: Array<{
    refNumber: string; title: string; amount: number; status: string; dueDate?: string
  }>
  // Recent invoices
  recentInvoices?: Array<{
    number: string; customerName: string; total: number; status: string; dueDate: string; amountDue: number
  }>
  // Profile
  displayName?: string
  // Agent execution history (last 5)
  recentAgentActions?: Array<{
    userRequest: string; serviceName?: string; status: string; cost: number; timestamp: string
  }>
  // Notifications
  unreadNotifications?: number
}

/** Backward-compat alias used by AgentPage */
export async function nanChat(opts: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  usdcBal?: string
  userAddress?: string
  sessionToken?: string
  context?: NanChatContext
}): Promise<{ reply: string; service_used?: string | null; action?: Record<string, unknown> | null; marketplace_services?: MarketplaceServiceCard[] }> {
  const last = opts.messages[opts.messages.length - 1]?.content ?? ''
  return apiPost<{ reply: string; service_used?: string | null; action?: Record<string, unknown> | null; marketplace_services?: MarketplaceServiceCard[] }>('/api/chat', {
    message: last,
    messages: opts.messages,
    history: opts.messages.slice(0, -1),
    usdcBal: opts.usdcBal,
    userAddress: opts.userAddress,
    context: opts.context,
  }, opts.sessionToken)
}


