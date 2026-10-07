/**
 * usePaymentWatcher
 *
 * Mounted ONCE at the AppShell level — runs on every screen.
 * Polls Arc Testnet for new incoming USDC transfers every 30 s.
 * On detection: merges into the activity store + fires a local notification.
 * Also exposes a refresh() function stored in a module-level ref so the
 * ActivityPage can trigger an immediate re-poll without prop-drilling.
 */
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useAppStore, ActivityItem } from '../store/appStore'
import { fetchOnchainActivity, ACTIVITY_POLL_INTERVAL } from './useOnchainActivity'

// Module-level: lets ActivityPage call forceRefresh() without prop-drilling
let _forceRefresh: (() => void) | null = null
export function forceActivityRefresh() {
  _forceRefresh?.()
}

export function usePaymentWatcher() {
  const { address: wagmiAddress } = useAccount()
  const auth = useAppStore(s => s.auth)
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)

  useEffect(() => {
    if (!address) {
      _forceRefresh = null
      return
    }

    const seen: Set<string> = new Set()
    let isFirst = true
    let cancelled = false

    async function poll() {
      if (cancelled) return
      try {
        const wasFirst = isFirst
        const { items, newReceived } = await fetchOnchainActivity(address!, seen, isFirst)
        isFirst = false
        if (cancelled) return

        const { addActivity, addLocalNotification, activity } = useAppStore.getState()

        // On the first poll (isFirst was true before the call above set it to false):
        // merge the full history into the store without firing notifications.
        // We detect "this was the first run" by checking newReceived is empty
        // AND isFirst is now false (just flipped above) — use a separate flag.
        if (wasFirst && items.length > 0) {
          const existingKeys = new Set(activity.map((a: ActivityItem) => a.txHash ?? a.id))
          items.forEach(item => {
            if (!existingKeys.has(item.txHash ?? item.id)) {
              addActivity({
                type: item.type,
                description: item.description,
                amount: item.amount,
                sign: item.sign,
                status: item.status,
                counterparty: item.counterparty,
                txHash: item.txHash,
                chain: item.chain,
              })
            }
          })
          return
        }

        // On subsequent polls: notify + add only genuinely new received items
        for (const item of newReceived) {
          if (cancelled) break
          const { activity: latest } = useAppStore.getState()
          const key = item.txHash ?? item.id
          const already = latest.some((a: ActivityItem) => (a.txHash ?? a.id) === key)
          if (!already) {
            addActivity({
              type: 'received',
              description: `Received ${item.amount.toFixed(2)} USDC`,
              amount: item.amount,
              sign: '+',
              status: 'confirmed',
              counterparty: item.counterparty,
              txHash: item.txHash,
              chain: item.chain,
            })
          }
          addLocalNotification({
            type: 'payment',
            title: 'USDC received',
            body: `You received ${item.amount.toFixed(2)} USDC${item.counterparty ? ` from ${item.counterparty}` : ''}`,
          })
        }
      } catch {
        // Silently ignore RPC errors — retry on next interval
      }
    }

    _forceRefresh = () => { void poll() }

    void poll()
    const timer = setInterval(() => { void poll() }, ACTIVITY_POLL_INTERVAL)

    return () => {
      cancelled = true
      _forceRefresh = null
      clearInterval(timer)
    }
  }, [address])
}
