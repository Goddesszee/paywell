/**
 * useOfflineQueue — buffers send attempts made while offline and replays them
 * when the connection is restored. Works with the existing addActivity +
 * wagmi writeContract flow; does NOT fire transactions itself — it prompts
 * the user to retry each queued item so they retain control.
 */
import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '../store/appStore'

export interface QueuedSend {
  id: string
  to: string
  amount: string
  token: string
  note: string
  queuedAt: number
}

const QUEUE_KEY = 'nan-offline-queue-v1'

function loadQueue(): QueuedSend[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedSend[]
  } catch {
    return []
  }
}

function saveQueue(q: QueuedSend[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

export function useOfflineQueue() {
  const { setActiveView } = useAppStore()
  const queueRef = useRef<QueuedSend[]>(loadQueue())
  const onlineRef = useRef(navigator.onLine)

  const enqueue = useCallback((item: Omit<QueuedSend, 'id' | 'queuedAt'>) => {
    const entry: QueuedSend = {
      ...item,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      queuedAt: Date.now(),
    }
    queueRef.current = [...queueRef.current, entry]
    saveQueue(queueRef.current)
    toast.warning(`You're offline. Send queued — it will remind you when you're back.`)
    return entry.id
  }, [])

  const dequeue = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter(i => i.id !== id)
    saveQueue(queueRef.current)
  }, [])

  const getQueue = useCallback(() => [...queueRef.current], [])

  // When coming back online, notify the user of any queued sends
  useEffect(() => {
    const handleOnline = () => {
      if (!onlineRef.current) {
        onlineRef.current = true
        const q = loadQueue()
        if (q.length > 0) {
          toast.info(
            `Back online! You have ${q.length} queued send${q.length > 1 ? 's' : ''}. Tap to review.`,
            {
              duration: 8000,
              action: {
                label: 'Review',
                onClick: () => setActiveView('send'),
              },
            }
          )
        }
      }
    }

    const handleOffline = () => {
      onlineRef.current = false
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setActiveView])

  return { enqueue, dequeue, getQueue, isOnline: () => navigator.onLine }
}
