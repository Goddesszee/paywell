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

/**
 * Like getCircleCreds(), but if the session key is missing and we hold a login refreshToken,
 * silently refresh the session first (Circle returns a fresh key). Falls back to "needs login".
 */
export async function ensureCircleCreds(): Promise<{ userToken?: string; encryptionKey?: string }> {
  let creds = getCircleCreds()
  if (creds.userToken && !creds.encryptionKey && useAppStore.getState().auth?.refreshToken) {
    try { await useAppStore.getState().refreshCircleToken() } catch { /* fall through */ }
    creds = getCircleCreds()
  }
  return creds
}

// ── Modular Wallets (passkey) client key ─────────────────────────────────────
/** The Circle Modular Wallets client key, trimmed and de-quoted (env values often carry stray
 *  whitespace/newlines/quotes, which Circle rejects as "Invalid credentials"). */
export function getClientKey(): string | undefined {
  const raw = (import.meta.env.VITE_CLIENT_KEY ?? import.meta.env.VITE_CIRCLE_CLIENT_KEY) as string | undefined
  const k = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim()
  return k || undefined
}

/** Non-secret fingerprint of the key baked into this build: its type prefix, length and shape. */
export function describeClientKey(key = getClientKey()): string {
  if (!key) return 'no key in this build'
  const parts = key.split(':')
  const prefix = /^[A-Z_]{6,30}$/.test(parts[0]) ? parts[0] : 'unrecognised prefix'
  return `${prefix}, ${key.length} chars, ${parts.length} part${parts.length === 1 ? '' : 's'}`
}

/** Returns a human message if the key is obviously unusable for mainnet, else undefined. */
export function clientKeyProblem(key: string | undefined): string | undefined {
  if (!key) return 'Passkey login is not configured: VITE_CLIENT_KEY is missing from this build (add it in Vercel, then redeploy).'
  if (/_API_KEY/i.test(key)) return 'VITE_CLIENT_KEY holds an API key, not a client key. Create a Client Key in Circle Console → Keys → Create a key → Client Key and use that.'
  if (/^TEST_/i.test(key)) return 'VITE_CLIENT_KEY is a TEST key. Arc mainnet needs a LIVE client key (starts with LIVE_CLIENT_KEY:) from Circle Console → Keys → Client Key.'
  return undefined
}

/** Turns Circle's terse RPC failures into something the developer/user can act on. */
export function explainPasskeyError(msg: string): string {
  if (/invalid credentials|unauthori[sz]ed|\b401\b/i.test(msg)) {
    return 'Circle rejected the passkey client key ("Invalid credentials"). Check that (1) VITE_CLIENT_KEY is a LIVE client key copied in full, (2) nanarc.xyz is the Passkey Domain in Circle Console → Wallets → Modular Wallets → Passkey, and (3) you redeployed after changing the key (Vite bakes it in at build time). Key in this build: ' + describeClientKey() + '.'
  }
  if (/domain|origin|relying party|rpid/i.test(msg)) {
    return 'Passkey domain mismatch: set the Passkey Domain in Circle Console → Wallets → Modular Wallets → Passkey to exactly this site (nanarc.xyz).'
  }
  return msg
}

// ── Circle wallet lookup that survives "wallet still being created" ───────────
/**
 * Right after a first-time email/Google login Circle creates the wallet asynchronously; the wallet
 * list can be empty for a few seconds. Poll until a wallet appears instead of finishing login with a
 * blank address (which made the app ask the user to "connect a wallet").
 */
export async function fetchPrimaryWallet(
  userToken: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<{ id: string; address: string } | undefined> {
  const { attempts = 12, delayMs = 1500 } = opts
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs))
    try {
      const res = await fetch('/api/wallet', { headers: { 'x-user-token': userToken } })
      const data = await res.json().catch(() => ({})) as { wallets?: { id: string; address: string }[]; error?: string }
      const w = data.wallets?.find(x => x.address) ?? undefined
      if (w) return w
    } catch { /* retry */ }
  }
  return undefined
}
