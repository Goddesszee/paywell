/**
 * api.ts — Paywell backend API client
 *
 * Set VITE_API_URL in .env to point at your backend.
 * Defaults to relative paths (same origin) when not set.
 */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ── helpers ────────────────────────────────────────────────────────────────────

async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data?.success === false) throw new Error(data?.error ?? `${path} failed (${res.status})`)
  return data as T
}

async function apiGet<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json()
  if (!res.ok || data?.success === false) throw new Error(data?.error ?? `GET ${path} failed (${res.status})`)
  return data as T
}

/** Returns true when a backend API URL is configured */
export function backendConfigured(): boolean {
  return typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL.length > 0
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

export interface ApiProduct {
  id: string
  name: string
  price: number
  merchant: string
  merchantId: string
  category: string
  description: string
  image: string
  rating: number
  reviewCount: number
  inStock: boolean
  tags: string[]
}

export interface Order {
  id: string
  productId: string
  productName: string
  amount: number
  merchant: string
  status: 'pending' | 'escrow' | 'complete' | 'cancelled'
  createdAt: string
  txId?: string
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
      `/api/activity-feed?wallet=${walletAddress}`, sessionToken,
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

// ── Marketplace ────────────────────────────────────────────────────────────────

export async function getProducts(): Promise<ApiProduct[]> {
  try {
    const data = await apiGet<{ products?: ApiProduct[] }>('/api/marketplace')
    return data.products ?? []
  } catch {
    return []
  }
}

/** Backward-compat alias used by AgentPage */
export async function nanChat(opts: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  usdcBal?: string
  userAddress?: string
  sessionToken?: string
}): Promise<{ reply: string }> {
  const last = opts.messages[opts.messages.length - 1]?.content ?? ''
  return apiPost('/api/chat', {
    message: last,
    messages: opts.messages,
    usdcBal: opts.usdcBal,
    userAddress: opts.userAddress,
  }, opts.sessionToken)
}

export async function placeOrder(
  sessionToken: string,
  productId: string,
  amount: number,
  walletId: string,
): Promise<Order> {
  return apiPost('/api/marketplace/order', { productId, amount, walletId }, sessionToken)
}
