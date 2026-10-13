/**
 * api/spending-guard.ts — Server-side authoritative spending-limit enforcement
 *
 * Enforces all five Agent Wallet spending limits before every transaction:
 *   1. perTxLimit   — per-transaction maximum
 *   2. dailyLimit   — rolling 24-hour window
 *   3. weeklyLimit  — rolling 7-day window
 *   4. monthlyLimit — rolling 30-day window
 *   5. overallLimit — lifetime cap (0 = disabled)
 *
 * Uses an atomic Redis SETNX lock to prevent race conditions when concurrent
 * requests arrive (e.g. two rapid-fire "send" commands).
 *
 * Routes (POST /api/spending-guard):
 *   action=check   — Read limits + totals, return remaining allowances (no mutation)
 *   action=reserve — Atomic check + record a pending spend (use before tx submission)
 *   action=confirm — Mark a reserved spend as confirmed with a real txHash
 *   action=cancel  — Release a reservation that was never submitted
 *   action=record  — Direct record of a completed spend (used by server.ts recurring runner)
 *
 * All actions also available as exports for direct use by api/community.ts and
 * api/agent-wallet.ts in the same process (Vercel serverless colocation).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis, REDIS_NOT_CONFIGURED } from './_redis.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpendingPolicy {
  perTxLimit:    number   // 0 = disabled
  dailyLimit:    number   // 0 = disabled
  weeklyLimit:   number   // 0 = disabled
  monthlyLimit:  number   // 0 = disabled
  overallLimit:  number   // 0 = disabled
}

export interface SpendRecord {
  id:        string
  walletId:  string
  amount:    number
  note:      string
  status:    'pending' | 'confirmed' | 'cancelled'
  txHash?:   string
  createdAt: number   // unix ms
  confirmedAt?: number
}

export interface GuardResult {
  allowed:     boolean
  reason?:     string
  limitType?:  'perTx' | 'daily' | 'weekly' | 'monthly' | 'overall'
  spent:       { day: number; week: number; month: number; overall: number }
  remaining:   { day: number; week: number; month: number; overall: number | null }
  reservationId?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOCK_TTL = 10   // seconds — long enough for a Circle API call
const SPEND_KEY = (walletId: string) => `spend:${walletId.toLowerCase()}`
const LOCK_KEY  = (walletId: string) => `spend:lock:${walletId.toLowerCase()}`

function now() { return Date.now() }
const DAY   = 86_400_000
const WEEK  = 7 * DAY
const MONTH = 30 * DAY

/**
 * Sum all confirmed + pending records within a time window.
 * Pending records count against limits to prevent concurrent overspend.
 */
function sumWindow(records: SpendRecord[], windowMs: number): number {
  const cutoff = now() - windowMs
  return records
    .filter(r => r.status !== 'cancelled' && r.createdAt >= cutoff)
    .reduce((t, r) => t + r.amount, 0)
}

function sumOverall(records: SpendRecord[]): number {
  return records
    .filter(r => r.status !== 'cancelled')
    .reduce((t, r) => t + r.amount, 0)
}

async function loadRecords(kv: ReturnType<typeof getRedis>, walletId: string): Promise<SpendRecord[]> {
  if (!kv) return []
  const raw = await kv.lrange<SpendRecord | string>(SPEND_KEY(walletId), 0, 999)
  return (raw ?? []).map(r => (typeof r === 'string' ? JSON.parse(r) as SpendRecord : r))
}

async function saveRecord(kv: ReturnType<typeof getRedis>, walletId: string, record: SpendRecord): Promise<void> {
  if (!kv) return
  await kv.lpush(SPEND_KEY(walletId), record)
  await kv.ltrim(SPEND_KEY(walletId), 0, 999)
  await kv.expire(SPEND_KEY(walletId), 60 * 60 * 24 * 365)   // 1-year TTL
}

async function updateRecord(kv: ReturnType<typeof getRedis>, walletId: string, id: string, patch: Partial<SpendRecord>): Promise<void> {
  if (!kv) return
  const records = await loadRecords(kv, walletId)
  const idx = records.findIndex(r => r.id === id)
  if (idx === -1) return
  records[idx] = { ...records[idx], ...patch }
  // Rewrite the list (small lists, acceptable for a financial ledger)
  await kv.del(SPEND_KEY(walletId))
  if (records.length > 0) {
    for (const r of [...records].reverse()) {
      await kv.lpush(SPEND_KEY(walletId), r)
    }
    await kv.expire(SPEND_KEY(walletId), 60 * 60 * 24 * 365)
  }
}

// ── Core check (exported for direct use) ─────────────────────────────────────

export async function checkSpending(
  walletId: string,
  amount: number,
  policy: SpendingPolicy,
): Promise<GuardResult> {
  const kv = getRedis()
  const records = await loadRecords(kv, walletId)

  const day     = sumWindow(records, DAY)
  const week    = sumWindow(records, WEEK)
  const month   = sumWindow(records, MONTH)
  const overall = sumOverall(records)

  const spent = { day, week, month, overall }

  // ── 1. Per-transaction limit ───────────────────────────────────────────────
  if (policy.perTxLimit > 0 && amount > policy.perTxLimit) {
    return {
      allowed: false,
      reason: `This transaction (${amount.toFixed(2)} USDC) exceeds the per-transaction limit of ${policy.perTxLimit.toFixed(2)} USDC.`,
      limitType: 'perTx',
      spent,
      remaining: {
        day:     Math.max(0, policy.dailyLimit - day),
        week:    Math.max(0, policy.weeklyLimit - week),
        month:   Math.max(0, policy.monthlyLimit - month),
        overall: policy.overallLimit > 0 ? Math.max(0, policy.overallLimit - overall) : null,
      },
    }
  }

  // ── 2. Daily limit ─────────────────────────────────────────────────────────
  if (policy.dailyLimit > 0 && day + amount > policy.dailyLimit) {
    const remaining = Math.max(0, policy.dailyLimit - day)
    return {
      allowed: false,
      reason: `Daily limit reached. You've spent ${day.toFixed(2)} USDC today (limit ${policy.dailyLimit.toFixed(2)} USDC). Remaining today: ${remaining.toFixed(2)} USDC.`,
      limitType: 'daily',
      spent,
      remaining: { day: remaining, week: Math.max(0, policy.weeklyLimit - week), month: Math.max(0, policy.monthlyLimit - month), overall: policy.overallLimit > 0 ? Math.max(0, policy.overallLimit - overall) : null },
    }
  }

  // ── 3. Weekly limit ────────────────────────────────────────────────────────
  if (policy.weeklyLimit > 0 && week + amount > policy.weeklyLimit) {
    const remaining = Math.max(0, policy.weeklyLimit - week)
    return {
      allowed: false,
      reason: `Weekly limit reached. You've spent ${week.toFixed(2)} USDC this week (limit ${policy.weeklyLimit.toFixed(2)} USDC). Remaining this week: ${remaining.toFixed(2)} USDC.`,
      limitType: 'weekly',
      spent,
      remaining: { day: Math.max(0, policy.dailyLimit - day), week: remaining, month: Math.max(0, policy.monthlyLimit - month), overall: policy.overallLimit > 0 ? Math.max(0, policy.overallLimit - overall) : null },
    }
  }

  // ── 4. Monthly limit ───────────────────────────────────────────────────────
  if (policy.monthlyLimit > 0 && month + amount > policy.monthlyLimit) {
    const remaining = Math.max(0, policy.monthlyLimit - month)
    return {
      allowed: false,
      reason: `Monthly limit reached. You've spent ${month.toFixed(2)} USDC this month (limit ${policy.monthlyLimit.toFixed(2)} USDC). Remaining this month: ${remaining.toFixed(2)} USDC.`,
      limitType: 'monthly',
      spent,
      remaining: { day: Math.max(0, policy.dailyLimit - day), week: Math.max(0, policy.weeklyLimit - week), month: remaining, overall: policy.overallLimit > 0 ? Math.max(0, policy.overallLimit - overall) : null },
    }
  }

  // ── 5. Overall lifetime limit ──────────────────────────────────────────────
  if (policy.overallLimit > 0 && overall + amount > policy.overallLimit) {
    const remaining = Math.max(0, policy.overallLimit - overall)
    return {
      allowed: false,
      reason: `Overall spending limit reached. You've spent ${overall.toFixed(2)} USDC total (limit ${policy.overallLimit.toFixed(2)} USDC). Remaining: ${remaining.toFixed(2)} USDC.`,
      limitType: 'overall',
      spent,
      remaining: { day: Math.max(0, policy.dailyLimit - day), week: Math.max(0, policy.weeklyLimit - week), month: Math.max(0, policy.monthlyLimit - month), overall: remaining },
    }
  }

  return {
    allowed: true,
    spent,
    remaining: {
      day:     policy.dailyLimit   > 0 ? Math.max(0, policy.dailyLimit   - day)   : Infinity,
      week:    policy.weeklyLimit  > 0 ? Math.max(0, policy.weeklyLimit  - week)  : Infinity,
      month:   policy.monthlyLimit > 0 ? Math.max(0, policy.monthlyLimit - month) : Infinity,
      overall: policy.overallLimit > 0 ? Math.max(0, policy.overallLimit - overall) : null,
    },
  }
}

/**
 * Atomically check + reserve a spend amount.
 * Uses Redis SETNX to ensure only one concurrent request per wallet can reserve at a time.
 * Returns a reservationId that must be confirmed or cancelled.
 */
export async function reserveSpend(
  walletId: string,
  amount: number,
  policy: SpendingPolicy,
  note: string,
): Promise<GuardResult> {
  const kv = getRedis()
  if (!kv) {
    // No Redis: fall through to client-side limits only (degraded mode)
    return { allowed: true, spent: { day:0, week:0, month:0, overall:0 }, remaining: { day: Infinity, week: Infinity, month: Infinity, overall: null } }
  }

  // Acquire lock
  const lockKey = LOCK_KEY(walletId)
  const lockId  = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const locked  = await kv.set(lockKey, lockId, { nx: true, ex: LOCK_TTL })
  if (!locked) {
    return {
      allowed: false,
      reason: 'Another transaction is already being processed for this wallet. Please wait a moment and try again.',
      spent: { day:0, week:0, month:0, overall:0 },
      remaining: { day:0, week:0, month:0, overall: null },
    }
  }

  try {
    const check = await checkSpending(walletId, amount, policy)
    if (!check.allowed) return check

    // Reserve the spend (status=pending counts against limits immediately)
    const reservationId = `res_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const record: SpendRecord = {
      id:        reservationId,
      walletId:  walletId.toLowerCase(),
      amount,
      note:      note.slice(0, 200),
      status:    'pending',
      createdAt: Date.now(),
    }
    await saveRecord(kv, walletId, record)
    return { ...check, allowed: true, reservationId }
  } finally {
    // Release lock only if we still own it
    const current = await kv.get<string>(lockKey)
    if (current === lockId) await kv.del(lockKey)
  }
}

export async function confirmSpend(walletId: string, reservationId: string, txHash: string): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  await updateRecord(kv, walletId, reservationId, { status: 'confirmed', txHash, confirmedAt: Date.now() })
}

export async function cancelSpend(walletId: string, reservationId: string): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  await updateRecord(kv, walletId, reservationId, { status: 'cancelled' })
}

export async function recordDirectSpend(walletId: string, amount: number, note: string, txHash?: string): Promise<void> {
  const kv = getRedis()
  if (!kv) return
  const record: SpendRecord = {
    id:        `direct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    walletId:  walletId.toLowerCase(),
    amount,
    note:      note.slice(0, 200),
    status:    txHash ? 'confirmed' : 'pending',
    txHash,
    createdAt: Date.now(),
    confirmedAt: txHash ? Date.now() : undefined,
  }
  await saveRecord(kv, walletId, record)
}

// ── Vercel route handler ──────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const body   = (req.body ?? {}) as Record<string, unknown>
  const action = (body.action ?? req.query.action) as string | undefined
  const kv = getRedis()
  if (!kv) return res.status(503).json({ success: false, ...REDIS_NOT_CONFIGURED })

  const walletId = String(body.walletId ?? '').trim().toLowerCase()
  if (!walletId) return res.status(400).json({ success: false, error: 'walletId required' })

  const policy: SpendingPolicy = {
    perTxLimit:   Number(body.perTxLimit   ?? 0) || 0,
    dailyLimit:   Number(body.dailyLimit   ?? 0) || 0,
    weeklyLimit:  Number(body.weeklyLimit  ?? 0) || 0,
    monthlyLimit: Number(body.monthlyLimit ?? 0) || 0,
    overallLimit: Number(body.overallLimit ?? 0) || 0,
  }

  try {
    if (action === 'check') {
      const amount = Number(body.amount ?? 0) || 0
      const result = await checkSpending(walletId, amount, policy)
      return res.status(200).json({ success: true, ...result })
    }

    if (action === 'reserve') {
      const amount = Number(body.amount)
      const note   = String(body.note ?? '').slice(0, 200)
      if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'amount required' })
      const result = await reserveSpend(walletId, amount, policy, note)
      return res.status(200).json({ success: true, ...result })
    }

    if (action === 'confirm') {
      const reservationId = String(body.reservationId ?? '').trim()
      const txHash        = String(body.txHash ?? '').trim()
      if (!reservationId || !txHash) return res.status(400).json({ success: false, error: 'reservationId and txHash required' })
      await confirmSpend(walletId, reservationId, txHash)
      return res.status(200).json({ success: true })
    }

    if (action === 'cancel') {
      const reservationId = String(body.reservationId ?? '').trim()
      if (!reservationId) return res.status(400).json({ success: false, error: 'reservationId required' })
      await cancelSpend(walletId, reservationId)
      return res.status(200).json({ success: true })
    }

    if (action === 'record') {
      const amount = Number(body.amount)
      const note   = String(body.note ?? '').slice(0, 200)
      const txHash = String(body.txHash ?? '').trim() || undefined
      if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'amount required' })
      await recordDirectSpend(walletId, amount, note, txHash)
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${String(action ?? '(none)')}` })
  } catch (e) {
    console.error('[spending-guard]', e)
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Internal error' })
  }
}
