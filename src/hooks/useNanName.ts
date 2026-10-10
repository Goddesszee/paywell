/**
 * useNanName — resolve a NAN handle (@name) to a wallet address using the
 * existing name registry contract, or return null if not found.
 * Also provides resolveAddress to reverse-lookup a name from an address.
 */
import { useState, useCallback } from 'react'
import { usePublicClient } from 'wagmi'

// NAN Name Registry address on Arc Testnet (set in .env as VITE_NAME_REGISTRY)
const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''

// ABI subset we need: resolve(string) → address, nameOf(address) → string
const REGISTRY_ABI = [
  { name: 'resolve',  type: 'function', stateMutability: 'view', inputs: [{ name: 'name', type: 'string' }],   outputs: [{ type: 'address' }] },
  { name: 'nameOf',   type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'string'  }] },
] as const

export function useNanName() {
  const client = usePublicClient()
  const [resolving, setResolving] = useState(false)

  /** Resolve @handle → address. Returns null if not found or registry not set. */
  const resolveHandle = useCallback(async (handle: string): Promise<string | null> => {
    if (!NAME_REGISTRY || !client) return null
    const name = handle.startsWith('@') ? handle.slice(1) : handle
    if (!name) return null
    setResolving(true)
    try {
      const address = await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'resolve',
        args: [name],
      })
      // Zero address means not registered
      if (address === '0x0000000000000000000000000000000000000000') return null
      return address
    } catch {
      return null
    } finally {
      setResolving(false)
    }
  }, [client])

  /** Reverse: address → @handle. Returns empty string if not registered. */
  const resolveName = useCallback(async (address: string): Promise<string> => {
    if (!NAME_REGISTRY || !client) return ''
    try {
      const name = await client.readContract({
        address: NAME_REGISTRY as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'nameOf',
        args: [address as `0x${string}`],
      })
      return name ?? ''
    } catch {
      return ''
    }
  }, [client])

  return { resolveHandle, resolveName, resolving, registrySet: !!NAME_REGISTRY }
}
