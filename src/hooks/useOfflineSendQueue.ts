/**
 * useOfflineSendQueue — queues send operations when offline and retries when
 * the connection is restored. Persisted to localStorage so it survives page
 * refreshes. Does NOT fire transactions automatically — it calls back to the
 * provided executor so the caller controls the actual wagmi writeContract call.
 */
import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'

export interface QueuedSend {
  id: string
  to: string
  amount: string
  token: string
  note: string
  queuedAt: number
}

const STORAGE_KEY = 'nan-send-queue-v1'

function loadQueue(): QueuedSend[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueuedSend[] }
  catch { return [] }
}

function saveQueue(q: QueuedSend[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)) } catch { /* storage full */ }
}

export function useOfflineSendQueue(
  executor: (item: QueuedSend) => Promise<void>
) {
  const executorRef = useRef(executor)
  useEffect(() => { executorRef.current = executor }, [executor])

  const enqueue = useCallback((item: Omit<QueuedSend, 'id' | 'queuedAt'>) => {
    const q = loadQueue()
    const entry: QueuedSend = { ...item, id: `q-${Date.now()}`, queuedAt: Date.now() }
    q.push(entry)
    saveQueue(q)
    toast.info('Payment queued', { description: 'Will send automatically when you reconnect.' })
  }, [])

  const drainQueue = useCallback(async () => {
    const q = loadQueue()
    if (q.length === 0) return
    toast.info(`Sending ${q.length} queued payment${q.length === 1 ? '' : 's'}…`)
    const remaining: QueuedSend[] = []
    for (const item of q) {
      try {
        await executorRef.current(item)
      } catch {
        remaining.push(item)
      }
    }
    saveQueue(remaining)
  }, [])

  // Listen for reconnect
  useEffect(() => {
    const handleOnline = () => { void drainQueue() }
    window.addEventListener('online', handleOnline)
    // Try draining on mount too (in case we came back online)
    if (navigator.onLine) void drainQueue()
    return () => window.removeEventListener('online', handleOnline)
  }, [drainQueue])

  const pendingCount = loadQueue().length

  return { enqueue, drainQueue, pendingCount }
}
