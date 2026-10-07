/**
 * useFxRates
 * Fetches live FX rates from Frankfurter (https://www.frankfurter.app) — no API key needed.
 * Base currency: USD. Returns rates for EUR, GBP, JPY, NGN, etc.
 * Refreshes every 5 minutes.
 */

import { useState, useEffect, useCallback } from 'react'

export interface FxRates {
  /** Rates relative to 1 USD, e.g. { EUR: 0.92, GBP: 0.79, NGN: 1600 } */
  rates: Record<string, number>
  /** How many of the foreign currency equal 1 USD */
  eurPerUsd: number
  /** How many USD does 1 EUR buy */
  usdPerEur: number
  updatedAt: Date | null
  loading: boolean
  error: string | null
  refetch: () => void
}

const REFRESH_MS = 5 * 60 * 1000 // 5 min
const CURRENCIES = ['EUR', 'GBP', 'NGN', 'JPY', 'GHS', 'KES', 'ZAR']

export function useFxRates(): FxRates {
  const [rates, setRates]       = useState<Record<string, number>>({})
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Frankfurter: GET /latest?from=USD&to=EUR,GBP,...
      const symbols = CURRENCIES.join(',')
      const res  = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbols}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { rates: Record<string, number>; date: string }
      setRates(json.rates)
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'FX fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetch_])

  const eurPerUsd = rates['EUR'] ?? 0.92      // how many EUR per 1 USD
  const usdPerEur = eurPerUsd > 0 ? 1 / eurPerUsd : 1.087  // how many USD per 1 EUR

  return { rates, eurPerUsd, usdPerEur, updatedAt, loading, error, refetch: fetch_ }
}
