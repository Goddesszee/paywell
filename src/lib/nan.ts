/**
 * nan.ts — typed client for all Nan backend API routes
 *
 * Zee² calls these instead of making direct onchain calls.
 * The Nan backend at NAN_BASE_URL handles Circle wallets, CCTP,
 * Gateway, marketplace escrow, orders, and activity feeds.
 *
 * In development the Vite proxy rewrites /nan-api → NAN_BASE_URL.
 * In production both apps deploy to the same Vercel project so
 * /nan-api is served by the same origin.
 */

// Base URL: in dev we proxy through Vite; in prod Nan and Zee² share the same origin.
// Override by setting VITE_NAN_API_URL in .env (e.g. https://nanarc.xyz)
const BASE = (import.meta.env.VITE_NAN_API_URL as string | undefined) ?? ''

// ── helpers ──────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error ?? `${path} failed (${res.status})`)
  }
  return data as T
}

async function get<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { headers })
  const data = await res.json()
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error ?? `GET ${path} failed (${res.status})`)
  }
  return data as T
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface NanSession {
  email: string
  sessionToken: string
  walletAddress: string
  walletId: string
}

export interface NanBalance {
  usdc: string     // human-readable e.g. "42.50"
  eurc: string
  walletAddress: string
  walletId: string
}

export interface NanTx {
  id: string
  type: 'send' | 'receive' | 'swap' | 'bridge' | 'purchase' | 'agent_purchase'
  description: string
  amount: string
  sign: '+' | '-'
  timestamp: string   // ISO string
  status: 'pending' | 'confirmed' | 'failed'
  counterparty?: string
  txHash?: string
  agentInitiated?: boolean
}

export interface NanProduct {
  id: string
  name: string
  price: number      // in USDC
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

export interface NanOrder {
  id: string
  productId: string
  productName: string
  amount: number
  merchant: string
  status: 'pending' | 'escrow' | 'complete' | 'cancelled'
  createdAt: string
  txId?: string
}

// ── Auth — OTP ────────────────────────────────────────────────────────────────

/**
 * Step 1: Send OTP to email.
 * Returns { token, expiresAt } that must be passed back to verifyOtp.
 */
export async function sendOtp(email: string): Promise<{ token: string; expiresAt: number; dev?: boolean }> {
  return post('/api/otp', { action: 'send', email })
}

/**
 * Step 2: Verify the 6-digit code.
 * Returns a session token — store in Zustand + localStorage.
 */
export async function verifyOtp(
  email: string,
  otp: string,
  token: string,
  expiresAt: number,
): Promise<{ sessionToken: string }> {
  return post('/api/otp', { action: 'verify', email, otp, token, expiresAt })
}

// ── Wallet — balance + send ───────────────────────────────────────────────────

/**
 * Get or create the Circle developer-controlled wallet for this user.
 * Returns wallet address, walletId, and USDC/EURC balances.
 */
export async function getWallet(email: string, sessionToken: string): Promise<NanBalance> {
  const data = await post<{
    wallet: { id: string; address: string }
    balances: Array<{ symbol: string; amount: string }>
  }>('/api/circle-wallets', { action: 'getWallet', email }, sessionToken)

  const usdc = data.balances?.find((b) => b.symbol === 'USDC')?.amount ?? '0.00'
  const eurc = data.balances?.find((b) => b.symbol === 'EURC')?.amount ?? '0.00'
  return {
    usdc,
    eurc,
    walletAddress: data.wallet?.address ?? '',
    walletId: data.wallet?.id ?? '',
  }
}

/**
 * Send USDC or EURC to a recipient address.
 * amount: human-readable string e.g. "25.00"
 */
export async function sendUsdc(
  email: string,
  sessionToken: string,
  to: string,
  amount: string,
  token: 'USDC' | 'EURC' = 'USDC',
): Promise<{ txId: string; txHash?: string }> {
  return post(
    '/api/circle-wallets',
    { action: 'transfer', email, to, amount, tokenSymbol: token },
    sessionToken,
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

/**
 * Fetch the persistent activity feed for a wallet address.
 * Falls back to an empty array if the route is unavailable.
 */
export async function getActivity(
  walletAddress: string,
  sessionToken?: string,
): Promise<NanTx[]> {
  try {
    const data = await get<{ activities?: NanTx[]; transactions?: NanTx[] }>(
      `/api/activity-feed?wallet=${walletAddress}`,
      sessionToken,
    )
    return data.activities ?? data.transactions ?? []
  } catch {
    return []
  }
}

// ── Marketplace ───────────────────────────────────────────────────────────────

/** List all available marketplace products/listings */
export async function getListings(): Promise<NanProduct[]> {
  try {
    const data = await post<{ listings?: NanProduct[]; success: boolean }>(
      '/api/marketplace',
      { action: 'listings' },
    )
    return data.listings ?? []
  } catch {
    return []
  }
}

/** Place a buy order — funds go to escrow until merchant confirms */
export async function buyListing(
  email: string,
  sessionToken: string,
  listingId: string,
  quantity = 1,
): Promise<NanOrder> {
  return post(
    '/api/marketplace',
    { action: 'buy', email, listingId, quantity },
    sessionToken,
  )
}

/** Get all orders for a wallet */
export async function getOrders(walletAddress: string, sessionToken?: string): Promise<NanOrder[]> {
  try {
    const data = await get<{ orders?: NanOrder[] }>(
      `/api/orders?wallet=${walletAddress}`,
      sessionToken,
    )
    return data.orders ?? []
  } catch {
    return []
  }
}

// ── Agent wallets ─────────────────────────────────────────────────────────────

export interface AgentWalletInfo {
  walletAddress: string
  walletId: string
  balance: string
  blockchain: string
}

/** Get or create the agent sub-wallet for this user (spending-policy enforced) */
export async function getAgentWallet(
  userAddress: string,
  sessionToken: string,
): Promise<AgentWalletInfo | null> {
  try {
    const data = await post<{
      wallets?: Record<string, { address: string; walletId: string }>
      balances?: Record<string, string>
    }>('/api/agent-wallets', { action: 'get', userAddress }, sessionToken)
    const arcWallet = data.wallets?.['ARC-TESTNET']
    if (!arcWallet) return null
    return {
      walletAddress: arcWallet.address,
      walletId: arcWallet.walletId,
      balance: data.balances?.['ARC-TESTNET'] ?? '0.00',
      blockchain: 'ARC-TESTNET',
    }
  } catch {
    return null
  }
}

/** Set a spending policy on the agent wallet */
export async function setAgentPolicy(
  userAddress: string,
  sessionToken: string,
  perTx: number,
  daily: number,
): Promise<void> {
  await post(
    '/api/agent-wallets',
    { action: 'set-policy', userAddress, perTx, daily },
    sessionToken,
  )
}

/** Execute an agent-approved purchase */
export async function executeAgentPurchase(
  userAddress: string,
  sessionToken: string,
  to: string,
  amount: string,
  note?: string,
): Promise<{ txId: string }> {
  return post(
    '/api/agent-wallets',
    { action: 'transfer', userAddress, to, amount, note, tokenSymbol: 'USDC' },
    sessionToken,
  )
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

export interface NanChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface NanChatResult {
  reply: string
  action?: Record<string, unknown> | null
  navigatePage?: string | null
}

/**
 * Send a message to Nan's AI chat backend.
 * Passes live wallet context so the AI can answer with real data.
 */
export async function nanChat(opts: {
  messages: NanChatMessage[]
  usdcBal?: string
  userAddress?: string
  sessionToken?: string
}): Promise<NanChatResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.sessionToken) headers['Authorization'] = `Bearer ${opts.sessionToken}`
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: opts.messages,
      usdcBal: opts.usdcBal ?? '0',
      userAddress: opts.userAddress ?? '',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Chat failed (${res.status})`)
  return data as NanChatResult
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** True when the app is configured to talk to a real Nan backend */
export function nanBackendConfigured(): boolean {
  return !!(import.meta.env.VITE_NAN_API_URL as string | undefined)
}
