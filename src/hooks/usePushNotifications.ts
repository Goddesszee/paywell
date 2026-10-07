/**
 * usePushNotifications
 *
 * Handles the full Web Push subscription lifecycle:
 * 1. Requests notification permission from the user.
 * 2. Registers a PushSubscription with the SW and sends it to /api/push/subscribe.
 * 3. Listens for PUSH_NAV messages posted by the service worker (notificationclick)
 *    and navigates the app to the Activity view.
 *
 * Call this hook once inside AppShell — it is a no-op when:
 *   - Push is not supported in this browser
 *   - The user has already subscribed (localStorage flag)
 *   - No wallet address is connected
 */

import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useAccount } from 'wagmi'

const STORAGE_KEY = 'nan-push-subscribed-v1'
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { address: wagmiAddress }  = useAccount()
  const { auth, setActiveView }    = useAppStore()
  const address = wagmiAddress ?? auth?.circleWalletAddress

  useEffect(() => {
    // Listen for nav messages from the service worker (notification tap)
    function onMessage(e: MessageEvent<{ type?: string; view?: string }>) {
      if (e.data?.type === 'PUSH_NAV' && e.data?.view) {
        setActiveView(e.data.view)
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [setActiveView])

  useEffect(() => {
    if (!address) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    // Already subscribed this device
    if (localStorage.getItem(STORAGE_KEY) === address.toLowerCase()) return

    async function subscribe() {
      try {
        // Fetch VAPID public key from server (avoids hardcoding in client)
        const keyRes  = await fetch(`${API_BASE}/api/push/vapid-public-key`)
        const keyData = await keyRes.json() as { publicKey: string | null }
        if (!keyData.publicKey) return   // VAPID not configured on server

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey).buffer as ArrayBuffer,
        })

        await fetch(`${API_BASE}/api/push/subscribe`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ address, subscription: sub.toJSON() }),
        })

        localStorage.setItem(STORAGE_KEY, (address as string).toLowerCase())
        console.log('[push] subscribed for', address)
      } catch (e) {
        // Non-fatal — client-side polling still works as fallback
        console.warn('[push] subscription failed:', e instanceof Error ? e.message : e)
      }
    }

    void subscribe()
  }, [address])
}
