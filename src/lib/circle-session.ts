/**
 * circle-session.ts — shared helpers for Circle user-controlled-wallet (email / Google) signing.
 *
 * 1. getCircleCreds(): the W3S SDK needs the session `encryptionKey`. It lives in memory /
 *    sessionStorage only, so it is gone after a reload. Opening Circle's popup with an empty key
 *    produces the confusing "encryptedUserSecret, storageKey, and pinCodeUserShare must be provided"
 *    error, so callers must check first and show SESSION_EXPIRED_MSG instead.
 * 2. getChallengeTransactionId(): Circle challenges have no `transactionId` field — the id is in
 *    `correlationIds[0]` (the /api/wallet get-challenge action also normalises it), and it can lag
 *    the approval briefly, so we poll.
 */
import { useAppStore } from '../store/appStore'

export const SESSION_EXPIRED_MSG =
  'Your secure Circle session has expired (this happens after closing or reloading the tab). Please sign out and sign back in, then try again.'

export function getCircleCreds(): { userToken?: string; encryptionKey?: string } {
  const a = useAppStore.getState().auth
  let ek = a?.encryptionKey
  if (!ek) { try { ek = sessionStorage.getItem('circle_ek') ?? undefined } catch { /* ignore */ } }
  return { userToken: a?.userToken, encryptionKey: ek }
}

export async function getChallengeTransactionId(
  userToken: string,
  challengeId: string,
  attempts = 10,
): Promise<{ transactionId?: string; status?: string; errorMessage?: string }> {
  type Resp = {
    transactionId?: string
    challenge?: { status?: string; errorMessage?: string; transactionId?: string; correlationIds?: string[] }
  }
  let last: Resp['challenge']
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1500))
    const resp = await fetch('/api/wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-challenge', userToken, challengeId }),
    })
    const data = await resp.json().catch(() => ({})) as Resp
    last = data.challenge
    const id = data.transactionId ?? last?.transactionId ?? last?.correlationIds?.[0]
    if (id) return { transactionId: id, status: last?.status }
    if (last?.status === 'FAILED') break
  }
  return { status: last?.status, errorMessage: last?.errorMessage }
}
