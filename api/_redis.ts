import { Redis } from '@upstash/redis'

// Vercel KV / Upstash Redis integration sets different env var names depending
// on how the store was connected and whether it was renamed. We try all known
// variants so the code works regardless.
const url =
  process.env.KV_REST_API_URL ??
  process.env.KV_REDIS_URL ??
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.REDIS_KV_REST_API_URL

// Prefer the read-write token. KV_REST_ONLY_TOKEN is read-only (write ops will
// fail with 403) — it is included as a last resort so getRedis() stays non-null
// and read paths still work, but write paths will throw with a clear Redis error.
const token =
  process.env.KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.REDIS_KV_REST_API_TOKEN ??
  process.env.KV_REST_ONLY_TOKEN ??
  process.env.KV_REST_API_READ_ONLY_TOKEN

export function getRedis(): Redis | null {
  if (!url || !token) return null
  return new Redis({ url, token })
}

// Log which env vars resolved (values redacted) so Vercel function logs show
// the config state without exposing secrets.
if (process.env.NODE_ENV !== 'test') {
  console.log('[redis] url source:', url ? 'resolved' : 'MISSING', '| token source:', token ? 'resolved' : 'MISSING')
}

export const REDIS_NOT_CONFIGURED = {
  error: 'storage_not_configured',
  message:
    'No Redis/KV store connected. In Vercel, go to Storage → create a Redis database → connect it to this project, then redeploy.',
}
