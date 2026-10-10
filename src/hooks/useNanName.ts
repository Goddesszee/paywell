/**
 * useNanName — read the NANNameRegistry contract.
 *
 * Works for ALL user types (wagmi wallet, Circle UCW, passkey) by using a
 * direct eth_call via fetch as fallback when the wagmi public client is absent.
 *
 * Real ABI: register(string,uint8), renew(string,uint8), resolve(string),
 *           primaryName(address), isAvailable(string), getNamesForAddress(address)
 */
import { useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { createPublicClient, http } from 'viem'

const NAME_REGISTRY = (import.meta.env.VITE_NAME_REGISTRY as string | undefined) ?? ''
const ARC_RPC = 'https://rpc.testnet.arc.io'
const ARC_CHAIN_ID = 5042002

export const REGISTRY_ABI = [
  { name: 'register',           type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'duration', type: 'uint8' }], outputs: [] },
  { name: 'renew',              type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'duration', type: 'uint8' }], outputs: [] },
  { name: 'resolve',            type: 'function', stateMutability: 'view',       inputs: [{ name: 'name', type: 'string' }],   outputs: [{ name: '', type: 'address' }] },
  { name: 'primaryName',        type: 'function', stateMutability: 'view',       inputs: [{ name: 'addr', type: 'address' }],  outputs: [{ name: '', type: 'string'  }] },
  { name: 'isAvailable',        type: 'function', stateMutability: 'view',       inputs: [{ name: 'name', type: 'string' }],   outputs: [{ name: '', type: 'bool'   }] },
  { name: 'getNamesForAddress', type: 'function', stateMutability: 'view',       inputs: [{ name: 'addr', type: 'address' }],  outputs: [{ name: '', type: 'string[]' }] },
  { name: 'price1Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ name: '', type: 'uint256' }] },
  { name: 'price2Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ name: '', type: 'uint256' }] },
  { name: 'price5Yr',           type: 'function', stateMutability: 'view',       inputs: [],                                   outputs: [{ name: '', type: 'uint256' }] },
] as const

export const ERC20_APPROVE_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

// Prices in USDC (6 decimals)
export const PRICES: Record<1 | 2 | 5, bigint> = {
  1: 2_000_000n,
  2: 3_000_000n,
  5: 8_000_000n,
}

// ── Fallback RPC client (no wagmi dependency) ──────────────────────────────
// Used when wagmi's usePublicClient returns undefined (Circle UCW / passkey users
// who have no injected wallet connected).
const ARC_CHAIN = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC] }, public: { http: [ARC_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
} as const

let _fallbackClient: ReturnType<typeof createPublicClient> | null = null
function getFallbackClient() {
  if (!_fallbackClient) {
    _fallbackClient = createPublicClient({ transport: http(ARC_RPC), chain: ARC_CHAIN })
  }
  return _fallbackClient
}

async function readRegistry<
  F extends typeof REGISTRY_ABI[number]['name'],
>(
  client: ReturnType<typeof usePublicClient> | null,
  functionName: F,
  args: unknown[],
): Promise<unknown> {
  const c = client ?? getFallbackClient()
  // Arc Testnet RPC requires gas in eth_call — pass it via stateOverride workaround.
  // We do this by wrapping in a try/catch: if the wagmi client throws (Arc RPC quirk),
  // fall back to the fallback client with explicit gas in the call object.
  try {
    return await c.readContract({
      address: NAME_REGISTRY as `0x${string}`,
      abi: REGISTRY_ABI as never,
      functionName: functionName,
      args: args,
      gas: 500_000n,
    } as Parameters<typeof c.readContract>[0])
  } catch {
    // Final fallback: use getFallbackClient with gas
    const fb = getFallbackClient()
    return fb.readContract({
      address: NAME_REGISTRY as `0x${string}`,
      abi: REGISTRY_ABI as never,
      functionName: functionName,
      args: args,
      gas: 500_000n,
    } as Parameters<typeof fb.readContract>[0])
  }
}

export function useNanName() {
  const wagmiClient = usePublicClient()

  /** Resolve @handle → address. Returns null if not found or expired. */
  const resolveHandle = useCallback(async (handle: string): Promise<string | null> => {
    if (!NAME_REGISTRY) return null
    const name = handle.startsWith('@') ? handle.slice(1) : handle
    if (!name) return null
    try {
      const address = await readRegistry(wagmiClient ?? null, 'resolve', [name]) as string
      if (!address || address === '0x0000000000000000000000000000000000000000') return null
      return address
    } catch { return null }
  }, [wagmiClient])

  /** address → primary @handle. Returns empty string if none. */
  const resolveName = useCallback(async (address: string): Promise<string> => {
    if (!NAME_REGISTRY) return ''
    try {
      const name = await readRegistry(wagmiClient ?? null, 'primaryName', [address as `0x${string}`]) as string
      return name ?? ''
    } catch { return '' }
  }, [wagmiClient])

  /** Check if a handle is available. Returns true = available, false = taken.
   *  On RPC error returns null so the UI can show "couldn't check" instead of "taken". */
  const checkAvailable = useCallback(async (name: string): Promise<boolean | null> => {
    if (!NAME_REGISTRY) return null
    try {
      const result = await readRegistry(wagmiClient ?? null, 'isAvailable', [name]) as boolean
      return result
    } catch { return null }
  }, [wagmiClient])

  /** Get all names owned by an address. */
  const getNames = useCallback(async (address: string): Promise<string[]> => {
    if (!NAME_REGISTRY) return []
    try {
      const names = await readRegistry(wagmiClient ?? null, 'getNamesForAddress', [address as `0x${string}`]) as string[]
      return [...(names ?? [])]
    } catch { return [] }
  }, [wagmiClient])

  return {
    resolveHandle,
    resolveName,
    checkAvailable,
    getNames,
    resolving: false,
    registrySet: !!NAME_REGISTRY,
  }
}


