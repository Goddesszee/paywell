import { safeJson } from './safe-json'

/**
 * Ask /api/wallet to confirm a Circle transaction. The server answers within ~45s;
 * if the transaction is still pending it replies { pending: true } and we ask again
 * (up to `maxRounds`), so slow cross-chain steps don't hit a serverless time limit.
 */
export async function confirmWithRetry<T extends { error?: string; pending?: boolean }>(
  body: Record<string, unknown>,
  maxRounds = 8,
): Promise<T> {
  let last = {} as T
  for (let i = 0; i < maxRounds; i++) {
    const resp = await fetch('/api/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    last = await safeJson<T>(resp)
    if (!resp.ok && resp.status !== 202) return (last.error ? last : { ...last, error: 'Confirmation failed' }) as T
    if (!last.pending) return last
  }
  return { ...last, error: 'Still pending after several minutes. Check your activity or the explorer shortly.' } as T
}
