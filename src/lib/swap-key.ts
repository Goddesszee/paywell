/**
 * Circle App Kit swap needs a key in its config on mainnet (docs.arc.io/app-kit/swap).
 * Browser paths (connected wallet / passkey) read it from VITE_KIT_KEY — a Circle Console
 * Kit/API key created for this domain. Server paths use KIT_KEY or the LIVE Circle API key.
 */
export function swapKeyConfig(): { apiKey?: string } {
  const raw = (import.meta.env.VITE_KIT_KEY as string | undefined) ?? ''
  const key = raw.trim().replace(/^["']|["']$/g, '').trim()
  return key ? { apiKey: key } : {}
}
