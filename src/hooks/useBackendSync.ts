/**
 * useBackendSync
 *
 * Syncs PaymentRequests and RecurringTasks between the Zustand store (local,
 * device-specific) and the backend API (server-side, device-independent).
 *
 * Strategy:
 *   - On mount (once per wallet address): pull from backend and MERGE into store.
 *     Items already in the store (by id) are kept; unknown items from the server
 *     are added; no deletions on merge (local deletes are re-synced on next push).
 *   - Every write (add/update/delete): mirror to backend fire-and-forget.
 *   - Backend is keyed by x-wallet-address header (lowercase).
 *
 * Falls back silently when backend is unreachable or returns storage_not_configured.
 */
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useAppStore, type PaymentRequest, type RecurringTask } from '../store/appStore'

function walletHeader(address: string) {
  return { 'x-wallet-address': address.toLowerCase(), 'content-type': 'application/json' }
}

// ── Payment Request sync ─────────────────────────────────────────────────────

export async function syncPrCreate(address: string, pr: PaymentRequest) {
  if (!address) return
  try {
    await fetch('/api/payment-requests', {
      method: 'POST',
      headers: walletHeader(address),
      body: JSON.stringify(pr),
    })
  } catch { /* fire-and-forget */ }
}

export async function syncPrUpdate(address: string, id: string, patch: Partial<PaymentRequest>) {
  if (!address) return
  try {
    await fetch(`/api/payment-requests/${id}`, {
      method: 'PATCH',
      headers: walletHeader(address),
      body: JSON.stringify(patch),
    })
  } catch { /* fire-and-forget */ }
}

export async function syncPrDelete(address: string, id: string) {
  if (!address) return
  try {
    await fetch(`/api/payment-requests/${id}`, {
      method: 'DELETE',
      headers: walletHeader(address),
    })
  } catch { /* fire-and-forget */ }
}

// ── Recurring Task sync ──────────────────────────────────────────────────────

export async function syncRtCreate(address: string, task: RecurringTask) {
  if (!address) return
  try {
    await fetch('/api/recurring-tasks', {
      method: 'POST',
      headers: walletHeader(address),
      body: JSON.stringify(task),
    })
  } catch { /* fire-and-forget */ }
}

export async function syncRtUpdate(address: string, id: string, patch: Partial<RecurringTask>) {
  if (!address) return
  try {
    await fetch(`/api/recurring-tasks/${id}`, {
      method: 'PATCH',
      headers: walletHeader(address),
      body: JSON.stringify(patch),
    })
  } catch { /* fire-and-forget */ }
}

export async function syncRtDelete(address: string, id: string) {
  if (!address) return
  try {
    await fetch(`/api/recurring-tasks/${id}`, {
      method: 'DELETE',
      headers: walletHeader(address),
    })
  } catch { /* fire-and-forget */ }
}

// ── Pull-on-mount hook ────────────────────────────────────────────────────────
// Mounted once in AppShell. Pulls both collections from the backend and merges
// into the store without replacing locally-created items.

export function useBackendSync() {
  const { address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const address = wagmiAddress ?? (auth?.circleWalletAddress) ?? ''

  const didPull = useRef<string>('')

  useEffect(() => {
    if (!address || didPull.current === address) return
    didPull.current = address

    const headers = walletHeader(address)

    // Pull payment requests
    fetch('/api/payment-requests', { headers })
      .then(r => r.ok ? r.json() : null)
      .then((data: { success: boolean; requests?: PaymentRequest[] } | null) => {
        if (!data?.success || !data.requests?.length) return
        const store = useAppStore.getState()
        const existingIds = new Set(store.paymentRequests.map(r => r.id))
        // Add server items not already in the local store
        data.requests.forEach(pr => {
          if (!existingIds.has(pr.id)) {
            // Use internal addPaymentRequest — but we already have id/refNumber,
            // so directly patch the store state
            useAppStore.setState(s => ({
              paymentRequests: [pr, ...s.paymentRequests],
            }))
          }
        })
      })
      .catch(() => {})

    // Pull recurring tasks
    fetch('/api/recurring-tasks', { headers })
      .then(r => r.ok ? r.json() : null)
      .then((data: { success: boolean; tasks?: RecurringTask[] } | null) => {
        if (!data?.success || !data.tasks?.length) return
        const store = useAppStore.getState()
        const existingIds = new Set(store.recurringTasks.map(t => t.id))
        data.tasks.forEach(task => {
          if (!existingIds.has(task.id)) {
            useAppStore.setState(s => ({
              recurringTasks: [...s.recurringTasks, task],
            }))
          }
        })
      })
      .catch(() => {})

  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync the pull cursor when the wallet changes
  useEffect(() => {
    if (!address) didPull.current = ''
  }, [address])

  return null
}
