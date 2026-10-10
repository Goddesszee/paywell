/**
 * useReferral — fetch or create a referral code for the connected wallet.
 * Works for wagmi wallets AND Circle email/passkey users (auth.circleWalletAddress).
 */
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useAppStore } from '../store/appStore'

interface ReferralData {
  code: string
  uses: number
  createdAt: number
}

export function useReferral() {
  const { address: wagmiAddress } = useAccount()
  const { auth, nanHandle } = useAppStore()
  // Resolve a stable identity key from any login path:
  // 1. NAN handle (most stable, always unique)
  // 2. wagmi connected address
  // 3. Circle wallet address (email/passkey login)
  // 4. auth.walletAddress (older store field)
  // 5. email
  // 6. sessionToken prefix (passkey users with no other identity yet)
  const key: string | null = (() => {
    if (nanHandle) return `nan:${nanHandle}`
    if (wagmiAddress) return wagmiAddress
    const circleAddr = (auth?.circleWalletAddress ?? auth?.walletAddress ?? '')
    if (circleAddr) return circleAddr
    if (auth?.email) return encodeURIComponent(auth.email)
    if (auth?.sessionToken) return `tok:${auth.sessionToken.slice(0, 16)}`
    return null
  })()

  const [data, setData] = useState<ReferralData | null>(null)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (!key) return
    fetch(`/api/referral?wallet=${key}`)
      .then(r => r.json())
      .then((d: { success: boolean } & ReferralData) => { if (d.success) setData(d) })
      .catch(() => {/* offline — silently skip */})
      .finally(() => setFetched(true))
  }, [key])

  const loading = !!key && !fetched

  const trackReferral = async (code: string) => {
    try {
      await fetch('/api/referral/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
    } catch { /* ignore */ }
  }

  return { data, loading, trackReferral }
}
