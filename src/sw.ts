/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope

const CACHE = 'nan-v1'
const PRECACHE = [
  '/',
  '/manifest.json',
]

// Install — precache shell
sw.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => sw.skipWaiting())
  )
})

// Activate — clean old caches
sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => sw.clients.claim())
  )
})

// Fetch — network-first for API, cache-first for assets
sw.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Never intercept non-GET or cross-origin requests
  if (e.request.method !== 'GET') return
  if (url.origin !== sw.location.origin) return

  // API calls — network only (no caching)
  if (url.pathname.startsWith('/api/')) return

  // Navigation requests — network-first, fallback to cached shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/').then(r => r ?? fetch(e.request))
      )
    )
    return
  }

  // Static assets — stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request)
      const networkPromise = fetch(e.request).then(res => {
        if (res.ok) void cache.put(e.request, res.clone())
        return res
      })
      return cached ?? networkPromise
    })
  )
})
