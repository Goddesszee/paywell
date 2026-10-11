/**
 * Picks the Circle API key for the current environment.
 *
 * NAN runs on Arc mainnet, which needs a LIVE key (LIVE_API_KEY:…). If several of the key variables
 * are set (e.g. an old TEST key left in one of them), the LIVE one wins instead of whichever happens
 * to come first. A TEST key on mainnet is reported with a clear message instead of a vague Circle error.
 */
const CANDIDATES = ['CIRCLE_USER_CONTROLLED_API_KEY', 'CIRCLE_API_KEY', 'CIRCLE_DEVELOPER_CONTROLLED_API_KEY'] as const

const clean = (v: string | undefined) => (v ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim()

export type CircleKeyInfo = { key: string; env: string; kind: 'live' | 'test' | 'unknown' } | null

export function circleKeyInfo(): CircleKeyInfo {
  const found = CANDIDATES.map(env => ({ env, key: clean(process.env[env]) })).filter(c => c.key)
  if (!found.length) return null
  const kindOf = (k: string): 'live' | 'test' | 'unknown' => k.startsWith('LIVE_') ? 'live' : k.startsWith('TEST_') ? 'test' : 'unknown'
  const pick = found.find(c => kindOf(c.key) === 'live') ?? found.find(c => kindOf(c.key) === 'unknown') ?? found[0]
  return { ...pick, kind: kindOf(pick.key) }
}

/** Returns the key, or throws an actionable error. */
export function requireCircleKey(): string {
  const info = circleKeyInfo()
  if (!info) throw new Error('Circle API key is not configured. Add CIRCLE_API_KEY (a LIVE_API_KEY:… key) in Vercel and redeploy.')
  if (info.kind === 'test') {
    throw new Error(`${info.env} is a TEST key, but NAN is on Arc mainnet. Create a mainnet (LIVE_API_KEY:…) key in Circle Console, set it as CIRCLE_API_KEY in Vercel, remove the old test key, and redeploy.`)
  }
  return info.key
}
