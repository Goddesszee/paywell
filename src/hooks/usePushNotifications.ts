/**
 * usePushNotifications
 *
 * Re-subscribes on every app load and on tab focus so Railway restarts
 * (which wipe the in-memory subscription map) are healed automatically.
 * Also re-subscribes when the VAPID key changes — detected by comparing
 * the server's current key against the one stored locally.
 */

import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useAccount } from 'wagmi'

const STORAGE_KEY_ADDR  = 'nan-push-address-v2'
const STORAGE_KEY_VAPID = 'nan-push-vapid-v2'
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function registerPush(address: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  // 1. Fetch VAPID public key from server
  let publicKey: string
  try {
    const res  = await fetch(`${API_BASE}/api/push/vapid-public-key`)
    const data = await res.json() as { publicKey: string | null }
    if (!data.publicKey) return   // VAPID not configured on server yet
    publicKey = data.publicKey
  } catch {
    return  // server unreachable — skip silently
  }

  // 2. Ask permission (no-op if already granted/denied)
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  // 3. Re-subscribe if address changed OR VAPID key changed
  const storedAddr  = localStorage.getItem(STORAGE_KEY_ADDR)
  const storedVapid = localStorage.getItem(STORAGE_KEY_VAPID)
  const addrMatch   = storedAddr  === address.toLowerCase()
  const vapidMatch  = storedVapid === publicKey

  const reg = await navigator.serviceWorker.ready

  if (!addrMatch || !vapidMatch) {
    // Unsubscribe the old PushSubscription so the browser will create a new one
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()
  }

  // 4. Get (or create) the PushSubscription
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    })
  }

  // 5. POST the subscription to the server (idempotent — server stores by address)
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ address, subscription: sub.toJSON() }),
  })

  localStorage.setItem(STORAGE_KEY_ADDR,  address.toLowerCase())
  localStorage.setItem(STORAGE_KEY_VAPID, publicKey)
}

export function usePushNotifications() {
  const { address: wagmiAddress } = useAccount()
  const { auth, setActiveView }   = useAppStore()
  const address = wagmiAddress ?? auth?.circleWalletAddress

  // Listen for nav messages from the service worker (notification tap)
  useEffect(() => {
    function onMessage(e: MessageEvent<{ type?: string; view?: string }>) {
      if (e.data?.type === 'PUSH_NAV' && e.data?.view) {
        setActiveView(e.data.view)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [setActiveView])

  // Register on mount AND on tab focus (heals Railway restarts)
  useEffect(() => {
    if (!address) return

    void registerPush(address)

    function onFocus() { void registerPush(address!) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [address])
}
