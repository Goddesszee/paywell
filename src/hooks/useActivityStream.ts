/**
 * useActivityStream — SSE real-time activity feed.
 * Connects to /api/activity-stream?wallet=0x… and merges incoming
 * transactions into the Zustand store in real time.
 */
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../store/appStore'

export function useActivityStream() {
  const { address } = useAccount()
  const addActivity = useAppStore(s => s.addActivity)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!address) return

    // Clean up any existing connection
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    const url = `/api/activity-stream?wallet=${address.toLowerCase()}`
    const es = new EventSource(url)
    esRef.current = es

    es.onmessage = (e) => {
      const raw = typeof e.data === 'string' ? e.data : ''
      if (!raw || raw.startsWith(':')) return
      try {
        const record = JSON.parse(raw) as {
          id: string; type: string; description: string;
          amount: number; sign: '+' | '-'; status: string;
          counterparty?: string; txHash?: string; fraudFlag?: boolean
        }
        // Only add if not already in store
        const existing = useAppStore.getState().activity.find(a => a.id === record.id)
        if (!existing) {
          addActivity({
            type: record.type as 'sent' | 'received' | 'bridge' | 'purchase' | 'agent_purchase',
            description: record.description,
            amount: record.amount,
            sign: record.sign,
            status: record.status as 'confirmed' | 'pending' | 'failed',
            counterparty: record.counterparty,
            txHash: record.txHash,
          })
          // Show toast for incoming payments
          if (record.sign === '+' && record.type === 'received') {
            // Dynamic import to avoid circular dep
            void import('sonner').then(({ toast }) => {
              toast.success(`+${record.amount} USDC received`, { description: record.counterparty ? `From ${record.counterparty}` : undefined })
            })
          }
          // Fraud warning
          if (record.fraudFlag) {
            void import('sonner').then(({ toast }) => {
              toast.warning('Unusual payment pattern detected', { description: 'Multiple payments to the same address in a short time.' })
            })
          }
        }
      } catch { /* malformed message — ignore */ }
    }

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do here
    }

    return () => { es.close(); esRef.current = null }
  }, [address]) // eslint-disable-line react-hooks/exhaustive-deps
}
