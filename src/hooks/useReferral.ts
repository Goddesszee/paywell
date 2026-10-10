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
  // Use wagmi address if available, fall back to Circle wallet address
  const address = wagmiAddress ?? (auth?.circleWalletAddress as `0x${string}` | undefined)

  const [data, setData] = useState<ReferralData | null>(null)
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (!address) return
    fetch(`/api/referral?wallet=${address}`)
      .then(r => r.json())
      .then((d: { success: boolean } & ReferralData) => { if (d.success) setData(d) })
      .catch(() => {/* offline — silently skip */})
      .finally(() => setFetched(true))
  }, [address])

  const loading = !!address && !fetched

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
