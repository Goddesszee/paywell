/**
 * useMultiChainBalances
 *
 * Reads the USDC ERC-20 balance for a given address across every
 * CCTP-supported testnet chain defined in onchain-facts. Results are
 * returned as a stable map keyed by chain name.
 *
 * Uses wagmi's useReadContracts so all reads are batched via multicall
 * where the chain supports it, and fall back to individual eth_call otherwise.
 */

import { useMemo, useEffect } from 'react'
import { useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { ONCHAIN_CHAINS } from '../onchain-facts'

/** Chains we actively poll. Testnet-only to match the app's default testnet mode. */
const POLL_CHAINS = ONCHAIN_CHAINS.filter(
  (c) => c.isTestnet && !!c.usdc,
)

export interface ChainBalance {
  chainId: number
  chainName: string
  balance: string   // formatted to 2 dp, e.g. "12.50"
  raw: bigint
}

export function useMultiChainBalances(address: string | undefined): {
  balances: ChainBalance[]
  total: string
  byName: Record<string, string>
  isLoading: boolean
} {
  const contracts = useMemo(() => {
    if (!address) return []
    return POLL_CHAINS.map((chain) => ({
      address: chain.usdc!.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address as `0x${string}`] as const,
      chainId: chain.chainId,
    }))
  }, [address])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !!address && contracts.length > 0 },
  })

  const balances: ChainBalance[] = useMemo(() => {
    if (!data) return POLL_CHAINS.map((c) => ({ chainId: c.chainId, chainName: c.name, balance: '0.00', raw: 0n }))
    return POLL_CHAINS.map((chain, i) => {
      const result = data[i]
      const raw = result?.status === 'success' ? (result.result) : 0n
      const decimals = chain.usdc?.decimals ?? 6
      const num = Number(raw) / Math.pow(10, decimals)
      return {
        chainId: chain.chainId,
        chainName: chain.name,
        balance: num.toFixed(2),
        raw,
      }
    })
  }, [data])

  const total = useMemo(() => {
    const sum = balances.reduce((acc, b) => acc + parseFloat(b.balance), 0)
    return sum.toFixed(2)
  }, [balances])

  const byName = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of balances) map[b.chainName] = b.balance
    return map
  }, [balances])

  return { balances, total, byName, isLoading }
}

/** Subscribe hook: runs the fetch and calls the setter whenever results change */
export function useSyncMultiChainBalances(
  address: string | undefined,
  setter: (balances: Record<string, string>) => void,
) {
  const { byName, isLoading } = useMultiChainBalances(address)

  useEffect(() => {
    if (!isLoading && address) {
      setter(byName)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byName, isLoading, address])
}
