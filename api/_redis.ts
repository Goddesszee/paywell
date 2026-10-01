import { Redis } from '@upstash/redis'

// Vercel's Redis marketplace integration (Upstash) sets these under a few
// different name pairs depending on how it was connected/renamed. Try them
// in order so this works regardless of which one shows up in the project.
const url =
  process.env.KV_REST_API_URL ??
  process.env.UPSTASH_REDIS_REST_URL ??
  process.env.REDIS_KV_REST_API_URL

const token =
  process.env.KV_REST_API_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.REDIS_KV_REST_API_TOKEN

export function getRedis(): Redis | null {
  if (!url || !token) return null
  return new Redis({ url, token })
}

export const REDIS_NOT_CONFIGURED = {
  error: 'storage_not_configured',
  message:
    'No Redis/KV store connected. In Vercel, go to Storage → create a Redis database → connect it to this project, then redeploy.',
}
