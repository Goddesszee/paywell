/**
 * Parse a fetch Response as JSON without throwing "Unexpected token … is not valid JSON".
 * When the server (or Vercel itself) returns plain text/HTML — e.g. "An error occurred with
 * your deployment" on a crash or timeout — return `{ error }` with the status and a snippet.
 */
export async function safeJson<T extends { error?: string }>(resp: Response): Promise<T> {
  const text = await resp.text()
  try {
    return JSON.parse(text) as T
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 140)
    const hint = resp.status === 504 || /timeout/i.test(snippet)
      ? 'The server took too long to respond. Please try again.'
      : `Server error (${resp.status}). ${snippet}`
    return { error: hint } as T
  }
}
