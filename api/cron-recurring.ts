/**
 * api/cron-recurring.ts — Vercel Cron: execute due recurring payments
 *
 * Runs every hour via Vercel Cron (see vercel.json crons section).
 * Reads the global recurring-task index from Redis (`rt_index` — a Set of
 * wallet addresses that have at least one active recurring task), then
 * iterates each wallet's tasks and fires any that are due.
 *
 * Payment execution: for each due task we POST to /api/wallet with
 * action=create-transfer using the stored userToken. If the userToken is
 * missing or expired (UCW sessions are short-lived) we mark the task
 * `needs_auth` and skip it — we never store PINs or encryption keys.
 *
 * Security: Vercel Cron requests include the Authorization: Bearer <CRON_SECRET>
 * header. We verify it against CRON_SECRET env var (set in Vercel Dashboard).
 * If CRON_SECRET is not set we allow the request (backwards-compat for first deploy).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getRedis } from './_redis.js'

interface StoredTask {
  id: string
  name: string
  recipient: string
  amount: string
  active: boolean
  frequency: string
  nextRunAt?: string
  lastRun?: string
  lastTxHash?: string
  runCount: number
  createdAt: string
  userToken?: string
  status?: string
}

function nextRunDate(frequency: string, from: Date): Date {
  const d = new Date(from)
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break
    case 'weekly':  d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    default: return new Date(8640000000000000) // manual: never auto-run
  }
  return d
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify Vercel Cron secret when configured
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization ?? ''
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(200).json({ ok: true, skipped: 'Redis not configured' })
  }

  const now = new Date()
  let processed = 0
  let skipped = 0
  let errors = 0

  try {
    // Global index: Set of wallet addresses with active recurring tasks.
    // Written by payments-data.ts whenever a task is created/updated.
    const wallets = await kv.smembers('rt_index') as string[]

    for (const wallet of wallets) {
      const storeKey = `rt:${wallet}`
      const tasks = (await kv.get<StoredTask[]>(storeKey)) ?? []
      let changed = false

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        if (!task.active) continue
        if (task.frequency === 'manual') continue

        // Check if this task is due
        const dueAt = task.nextRunAt ? new Date(task.nextRunAt) : null
        if (!dueAt || dueAt > now) continue

        // We need a live userToken to submit the transfer challenge.
        // UCW tokens expire — if missing, mark task as needing re-auth and skip.
        if (!task.userToken) {
          tasks[i] = { ...task, status: 'needs_auth' }
          changed = true
          skipped++
          continue
        }

        try {
          // Create the USDC transfer challenge via the wallet API
          const origin = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://nanarc.xyz'

          const transferRes = await fetch(`${origin}/api/wallet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create-transfer',
              userToken: task.userToken,
              destinationAddress: task.recipient,
              amount: task.amount,
              tokenSymbol: 'USDC',
            }),
          })

          const data = await transferRes.json() as { challengeId?: string; error?: string }

          if (data.error) {
            // Token expired — mark needs_auth
            if (data.error.toLowerCase().includes('token') || data.error.toLowerCase().includes('auth') || data.error.toLowerCase().includes('401')) {
              tasks[i] = { ...task, status: 'needs_auth', userToken: undefined }
            } else {
              tasks[i] = { ...task, status: `error: ${data.error.slice(0, 80)}` }
            }
            changed = true
            errors++
            continue
          }

          // Transfer challenge created — the PIN popup is not available in a cron,
          // so for UCW tasks we can only create the challenge and note it's pending.
          // A future improvement: developer-controlled wallets don't need PIN approval.
          const newNextRun = nextRunDate(task.frequency, now)
          tasks[i] = {
            ...task,
            lastRun: now.toISOString(),
            lastTxHash: data.challengeId ?? undefined,
            runCount: (task.runCount ?? 0) + 1,
            nextRunAt: newNextRun.toISOString(),
            status: 'challenge_created',
          }
          changed = true
          processed++
        } catch (e) {
          tasks[i] = { ...task, status: `error: ${e instanceof Error ? e.message : 'unknown'}`.slice(0, 80) }
          changed = true
          errors++
        }
      }

      if (changed) {
        await kv.set(storeKey, tasks, { ex: 60 * 60 * 24 * 90 })
        // Clean up the index if all tasks are now inactive
        const anyActive = tasks.some(t => t.active && t.frequency !== 'manual')
        if (!anyActive) {
          await kv.srem('rt_index', wallet)
        }
      }
    }

    return res.status(200).json({
      ok: true,
      wallets: wallets.length,
      processed,
      skipped,
      errors,
      timestamp: now.toISOString(),
    })
  } catch (e) {
    console.error('[cron-recurring]', e)
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
