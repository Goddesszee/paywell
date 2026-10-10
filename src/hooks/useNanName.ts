/**
 * useNanName — read the NANNameRegistry contract.
 * Real ABI: register(string,uint8), renew(string,uint8), resolve(string),
 *           primaryName(address), isAvailable(string), getNamesForAddress(address)
 */
import { useCallback } from 'react'
import { usePublicClient } from 'wagmi'

const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''

export const REGISTRY_ABI = [
  { name: 'register',           type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'duration', type: 'uint8' }], outputs: [] },
  { name: 'renew',              type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'duration', type: 'uint8' }], outputs: [] },
  { name: 'resolve',            type: 'function', stateMutability: 'view',       inputs: [{ name: 'name', type: 'string' }],   outputs: [{ type: 'address' }] },
  { name: 'primaryName',        type: 'function', stateMutability: 'view',       inputs: [{ name: 'addr', type: 'address' }],  outputs: [{ type: 'string'  }] },
  { name: 'isAvailable',        type: 'function', stateMutability: 'view',       inputs: [{ name: 'name', type: 'string' }],   outputs: [{ type: 'bool'   }] },
  { name: 'getNamesForAddress', type: 'function', stateMutability: 'view',       inputs: [{ name: 'addr', type: 'address' }],  outputs: [{ type: 'string[]' }] },
  { name: 'price1Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ type: 'uint256' }] },
  { name: 'price2Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ type: 'uint256' }] },
  { name: 'price5Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ type: 'uint256' }] },
] as const

export const ERC20_APPROVE_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

// Prices in USDC (6 decimals)
export const PRICES: Record<1 | 2 | 5, bigint> = {
  1: 2_000_000n,
  2: 3_000_000n,
  5: 8_000_000n,
}

export function useNanName() {
  const client = usePublicClient()

  /** Resolve @handle → address. Returns null if not found or expired. */
  const resolveHandle = useCallback(async (handle: string): Promise<string | null> => {
    if (!NAME_REGISTRY || !client) return null
    const name = handle.startsWith('@') ? handle.slice(1) : handle
    if (!name) return null
    try {
      const address = await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'resolve',
        args: [name],
      })
      if (address === '0x0000000000000000000000000000000000000000') return null
      return address
    } catch { return null }
  }, [client])

  /** address → primary @handle. Returns empty string if none. */
  const resolveName = useCallback(async (address: string): Promise<string> => {
    if (!NAME_REGISTRY || !client) return ''
    try {
      const name = await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'primaryName',
        args: [address as `0x${string}`],
      })
      return name ?? ''
    } catch { return '' }
  }, [client])

  /** Check if a handle is available (not taken or expired). */
  const checkAvailable = useCallback(async (name: string): Promise<boolean> => {
    if (!NAME_REGISTRY || !client) return false
    try {
      return await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'isAvailable',
        args: [name],
      })
    } catch { return false }
  }, [client])

  /** Get all names owned by an address. */
  const getNames = useCallback(async (address: string): Promise<string[]> => {
    if (!NAME_REGISTRY || !client) return []
    try {
      const names = await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'getNamesForAddress',
        args: [address as `0x${string}`],
      })
      return [...names]
    } catch { return [] }
  }, [client])

  return {
    resolveHandle,
    resolveName,
    checkAvailable,
    getNames,
    resolving: false,
    registrySet: !!NAME_REGISTRY,
  }
}
