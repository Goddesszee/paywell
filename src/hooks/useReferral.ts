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
  const { auth } = useAppStore()
  // Use wagmi address if available, then Circle wallet address, then email as key
  const address = wagmiAddress
    ?? (auth?.circleWalletAddress as `0x${string}` | undefined)
  // key used to identify the user in referral store
  const key = address ?? (auth?.email ? encodeURIComponent(auth.email) : null)

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
