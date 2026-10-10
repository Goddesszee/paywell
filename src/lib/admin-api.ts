/** Admin API client — attaches the signed admin token and reports expiry. */
const TOKEN_KEY = 'nan_admin_token'

export const getAdminToken = (): string => { try { return sessionStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' } }
export const setAdminToken = (t: string) => { try { if (t) { sessionStorage.setItem(TOKEN_KEY, t) } else { sessionStorage.removeItem(TOKEN_KEY) } } catch { /* ignore */ } }

export async function adminLogin(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    const d = await r.json().catch(() => ({})) as { success?: boolean; token?: string; error?: string }
    if (r.ok && d.token) { setAdminToken(d.token); return { ok: true } }
    return { ok: false, error: d.error ?? `Login failed (${r.status})` }
  } catch { return { ok: false, error: 'Could not reach the server.' } }
}

export function adminLogout() { setAdminToken(''); window.dispatchEvent(new Event('nan-admin-expired')) }

export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-admin-token', getAdminToken())
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) adminLogout()
  return res
}

export async function adminJson<T>(url: string, init?: RequestInit): Promise<T & { success?: boolean; error?: string }> {
  const r = await adminFetch(url, init)
  return r.json() as Promise<T & { success?: boolean; error?: string }>
}
