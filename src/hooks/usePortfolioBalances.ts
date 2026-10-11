/**
 * usePortfolioBalances
 *
 * Aggregates USDC, EURC, and USDT balances across every NAN-supported mainnet
 * chain, converts them to USD using live FX rates, and returns a clean portfolio
 * summary with Gateway deduplication.
 *
 * Gateway deduplication rule:
 *   - Gateway balance represents USDC that has already been deposited FROM one
 *     of the supported chains. It is NOT an additional asset — it is the same
 *     underlying USDC re-counted via Circle's unified pool.
 *   - We expose it separately as "available via Gateway" without adding it to
 *     the portfolio total.
 */

import { useMemo, useEffect, useState, useCallback } from 'react'
import { useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { ONCHAIN_CHAINS } from '../onchain-facts'
import { useFxRates } from './useFxRates'

// ── Direct RPC reads — works for ALL user types, no wallet required ───────────
// keccak256("balanceOf(address)")[0..4] = 0x70a08231
function balanceOfCalldata(address: string): string {
  return '0x70a08231' + '000000000000000000000000' + address.slice(2).toLowerCase()
}

async function ethCallDirect(rpc: string, to: string, data: string): Promise<bigint> {
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    })
    if (!res.ok) return 0n
    const json = await res.json() as { result?: string }
    const hex = json.result
    if (!hex || hex === '0x' || hex === '0x0') return 0n
    return BigInt(hex)
  } catch {
    return 0n
  }
}

/** One entry per (chainId, symbol) pair we want to read directly */
interface DirectCall {
  chainId: number
  chainName: string
  symbol: 'USDC' | 'EURC' | 'USDT'
  rpc: string
  contractAddress: string
}

/** Result keyed as `${chainId}:${symbol}` */
type DirectResults = Record<string, bigint>

async function fetchAllBalancesDirect(
  address: string,
  calls: DirectCall[],
): Promise<DirectResults> {
  const results = await Promise.allSettled(
    calls.map(c => ethCallDirect(c.rpc, c.contractAddress, balanceOfCalldata(address)))
  )
  const out: DirectResults = {}
  calls.forEach((c, i) => {
    const val = results[i].status === 'fulfilled' ? results[i].value : 0n
    out[`${c.chainId}:${c.symbol}`] = val
  })
  return out
}

// ── Supported chains for NAN (must have USDC) ────────────────────────────────
export const PORTFOLIO_CHAINS = ONCHAIN_CHAINS.filter(
  (c) => !c.isTestnet && !!c.usdc,
)

// ── Well-known testnet token addresses ───────────────────────────────────────
// EURC only exists on Arc and Ethereum Sepolia for now
const EURC_BY_CHAIN: Record<number, `0x${string}`> = {
  5042:  '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', // Arc
  11155111: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C2Bfa4', // Ethereum Sepolia (Circle testnet EURC)
}

// USDT — no official Circle testnet USDT, so we track what's available
// (kept empty for now so we never show a 0.00 placeholder for a non-existent contract)
const USDT_BY_CHAIN: Record<number, `0x${string}`> = {}

export interface TokenPosition {
  symbol: 'USDC' | 'EURC' | 'USDT'
  chainId: number
  chainName: string
  /** Human-readable quantity, e.g. "12.50" */
  quantity: string
  /** USD value, e.g. "13.62" */
  usdValue: string
  /** Raw bigint from the contract */
  raw: bigint
  /** Whether the RPC call succeeded */
  status: 'confirmed' | 'pending' | 'unavailable'
}

export interface NetworkSummary {
  chainId: number
  chainName: string
  /** Explorer base URL */
  explorerBase: string
  /** Total USD value of all tokens on this chain */
  totalUsd: string
  positions: TokenPosition[]
  hasBalance: boolean
}

export interface PortfolioSummary {
  /**
   * Total portfolio USD value.
   * = Arc USDC (ERC-20) + Arc EURC (converted to USD) + all non-Arc chain balances.
   * Arc is counted via byToken (which is Arc-only for USDC/EURC since those cards
   * show Arc balances), plus nonArcTotalUsd for every other supported chain.
   * Gateway is excluded — it is the same underlying USDC, not an additional asset.
   */
  totalUsd: string
  /** Total USDC quantity across all chains */
  totalUsdc: string
  /** Total EURC quantity across all chains */
  totalEurc: string
  /** Total USDT quantity across all chains */
  totalUsdt: string
  /** Per-chain summaries, sorted: chains with balances first */
  networks: NetworkSummary[]
  /**
   * Per-token roll-up scoped to Arc only.
   * Used by the USDC and EURC home-screen cards.
   */
  byToken: Record<'USDC' | 'EURC' | 'USDT', { quantity: string; usdValue: string }>
  /**
   * Total USD value held on non-Arc chains (all tokens).
   * Used by the Cross-chain card so it doesn't double-count what's already
   * shown in the USDC and EURC cards (which display Arc balances).
   */
  nonArcTotalUsd: string
  /** Number of non-Arc chains that have at least one non-zero balance */
  nonArcNetworksWithBalance: number
  /** Gateway unified USDC balance (NOT added to totalUsd — same underlying funds) */
  gatewayAvailable: string
  gatewayPending: string
  /** ISO timestamp of last successful balance refresh */
  lastUpdated: Date | null
  isLoading: boolean
  /** EUR/USD rate used for EURC conversion */
  eurUsdRate: number
  /** When the FX rate was last fetched */
  fxUpdatedAt: Date | null
  /** Manually re-fetch everything */
  refetch: () => void
}

const GATEWAY_API = 'https://gateway-api.circle.com/v1'

async function fetchGatewayBalance(address: string): Promise<{ available: string; pending: string }> {
  try {
    const res = await fetch(`${GATEWAY_API}/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address }] }),
    })
    if (!res.ok) return { available: '0', pending: '0' }
    const json = await res.json() as { balances?: { balance?: string; pendingBatch?: string }[] }
    let available = 0; let pending = 0
    for (const b of json.balances ?? []) {
      available += parseFloat(b.balance ?? '0')
      pending   += parseFloat(b.pendingBatch ?? '0')
    }
    return { available: available.toFixed(6), pending: pending.toFixed(6) }
  } catch {
    return { available: '0', pending: '0' }
  }
}

export function usePortfolioBalances(address: string | undefined): PortfolioSummary {
  const { usdPerEur, loading: fxLoading, updatedAt: fxUpdatedAt, refetch: refetchFx } = useFxRates()

  // ── Build contract call list: USDC + EURC on every supported chain ─────────
  const contracts = useMemo(() => {
    if (!address) return []
    const calls: {
      address: `0x${string}`; abi: typeof erc20Abi
      functionName: 'balanceOf'; args: [`0x${string}`]
      chainId: number
      _meta: { symbol: 'USDC' | 'EURC' | 'USDT'; chainId: number; chainName: string }
    }[] = []

    for (const chain of PORTFOLIO_CHAINS) {
      // USDC
      calls.push({
        address: chain.usdc!.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
        chainId: chain.chainId,
        _meta: { symbol: 'USDC', chainId: chain.chainId, chainName: chain.name },
      })
      // EURC (only chains where it's deployed)
      if (EURC_BY_CHAIN[chain.chainId]) {
        calls.push({
          address: EURC_BY_CHAIN[chain.chainId],
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
          chainId: chain.chainId,
          _meta: { symbol: 'EURC', chainId: chain.chainId, chainName: chain.name },
        })
      }
      // USDT (only chains where it's deployed)
      if (USDT_BY_CHAIN[chain.chainId]) {
        calls.push({
          address: USDT_BY_CHAIN[chain.chainId],
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
          chainId: chain.chainId,
          _meta: { symbol: 'USDT', chainId: chain.chainId, chainName: chain.name },
        })
      }
    }
    return calls
  }, [address])

  const { data, isLoading: contractsLoading, refetch: refetchContracts } = useReadContracts({
    contracts,
    query: {
      enabled: !!address && contracts.length > 0,
      refetchInterval: 30_000,
    },
  })

  // ── Direct RPC reads for ALL chains — works for every user type ──────────
  // Build the call list from PORTFOLIO_CHAINS + EURC_BY_CHAIN so we cover
  // every chain without a wagmi connection requirement.
  const directCalls = useMemo<DirectCall[]>(() => {
    return PORTFOLIO_CHAINS.flatMap(chain => {
      const rpc = chain.rpcUrls[0]
      if (!rpc) return []
      const calls: DirectCall[] = []
      if (chain.usdc) {
        calls.push({ chainId: chain.chainId, chainName: chain.name, symbol: 'USDC', rpc, contractAddress: chain.usdc.address })
      }
      if (EURC_BY_CHAIN[chain.chainId]) {
        calls.push({ chainId: chain.chainId, chainName: chain.name, symbol: 'EURC', rpc, contractAddress: EURC_BY_CHAIN[chain.chainId] })
      }
      return calls
    })
  }, [])

  const [directResults, setDirectResults] = useState<DirectResults>({})
  const [directLoading, setDirectLoading] = useState(true)

  const fetchDirect = useCallback(async () => {
    if (!address || directCalls.length === 0) return
    setDirectLoading(true)
    const results = await fetchAllBalancesDirect(address, directCalls)
    setDirectResults(results)
    setDirectLoading(false)
  }, [address, directCalls])

  /* oxlint-disable react(set-state-in-effect) */
  useEffect(() => {
    void fetchDirect()
    const id = setInterval(() => { void fetchDirect() }, 30_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDirect])
  /* oxlint-enable react(set-state-in-effect) */

  // ── Gateway balance ───────────────────────────────────────────────────────
  const [gatewayAvailable, setGatewayAvailable] = useState('0')
  const [gatewayPending,   setGatewayPending]   = useState('0')
  const [lastUpdated, setLastUpdated]            = useState<Date | null>(null)

  const fetchGateway = useCallback(async () => {
    if (!address) return
    const gw = await fetchGatewayBalance(address)
    setGatewayAvailable(gw.available)
    setGatewayPending(gw.pending)
  }, [address])

  /* oxlint-disable react(set-state-in-effect) */
  useEffect(() => {
    void fetchGateway()
    const id = setInterval(() => { void fetchGateway() }, 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGateway])
  /* oxlint-enable react(set-state-in-effect) */

  // ── Mark last update when contracts data arrives ───────────────────────────
  /* oxlint-disable react(set-state-in-effect) */
  useEffect(() => {
    if (!contractsLoading && data) setLastUpdated(new Date())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractsLoading, data])
  /* oxlint-enable react(set-state-in-effect) */

  // ── EUR→USD rate (EURC 1:1 EUR by design) ────────────────────────────────
  // usdPerEur = how many USD does 1 EUR buy (from useFxRates)
  // Use 0 while FX is loading so EURC contributes $0 until we have a real rate.
  // This prevents the total from silently inflating by ~8.7% if the fallback
  // 1.09 rate was baked in before the live rate arrived.
  const eurRate = fxLoading ? 0 : usdPerEur

  // ── Build positions ───────────────────────────────────────────────────────
  const positions: TokenPosition[] = useMemo(() => {
    return contracts.map((c, i) => {
      const result = data?.[i]
      const ok  = result?.status === 'success'
      let raw = ok ? (result.result) : 0n

      // If wagmi returned 0 or failed, fill in from the direct RPC result
      const directKey = `${c._meta.chainId}:${c._meta.symbol}`
      if (raw === 0n && directResults[directKey] && directResults[directKey] > 0n) {
        raw = directResults[directKey]
      }

      const qty = Number(raw) / 1e6
      const usd = c._meta.symbol === 'EURC'
        ? qty * eurRate
        : qty * 1 // USDC and USDT are 1:1 USD

      return {
        symbol: c._meta.symbol,
        chainId: c._meta.chainId,
        chainName: c._meta.chainName,
        quantity: qty.toFixed(2),
        usdValue: usd.toFixed(2),
        raw,
        status: (ok || raw > 0n ? 'confirmed' : result?.status === 'failure' ? 'unavailable' : 'pending'),
      }
    })
  }, [data, contracts, eurRate, directResults])

  // ── Full cross-chain positions from direct RPC ────────────────────────────
  // Used when wagmi has no data yet — covers all chains, all user types.
  const directOnlyPositions: TokenPosition[] = useMemo(() => {
    if (Object.keys(directResults).length === 0 || !address) return []
    return directCalls.map(c => {
      const raw = directResults[`${c.chainId}:${c.symbol}`] ?? 0n
      const qty = Number(raw) / 1e6
      const usd = c.symbol === 'EURC' ? qty * eurRate : qty
      return {
        symbol: c.symbol,
        chainId: c.chainId,
        chainName: c.chainName,
        quantity: qty.toFixed(2),
        usdValue: usd.toFixed(2),
        raw,
        status: 'confirmed' as const,
      }
    })
  }, [directResults, directCalls, address, eurRate])

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const ARC_CHAIN_ID = 5042

  // Use wagmi positions when available (they already have direct fallback merged in);
  // fall back to pure direct results when wagmi hasn't returned data yet at all.
  const effectivePositions = useMemo(() => {
    if (!data && directOnlyPositions.length > 0) return directOnlyPositions
    return positions
  }, [data, positions, directOnlyPositions])

  const {
    networks, byToken, totalUsd, totalUsdc, totalEurc, totalUsdt,
    nonArcTotalUsd, nonArcNetworksWithBalance,
  } = useMemo(() => {
    const netMap: Record<number, NetworkSummary> = {}
    // All-chain totals (for totalUsdc/Eurc/Usdt quantities)
    let sumUsdc = 0; let sumEurc = 0; let sumUsdt = 0
    // Arc-only totals (for byToken cards — those cards show Arc balances)
    let arcUsdc = 0; let arcEurc = 0; let arcUsdt = 0
    // Non-Arc totals (for Cross-chain card)
    let nonArcUsd = 0; let nonArcNets = 0

    for (const chain of PORTFOLIO_CHAINS) {
      netMap[chain.chainId] = {
        chainId: chain.chainId,
        chainName: chain.name,
        explorerBase: chain.explorerBase,
        totalUsd: '0.00',
        positions: [],
        hasBalance: false,
      }
    }

    for (const pos of effectivePositions) {
      const net = netMap[pos.chainId]
      if (!net) continue
      net.positions.push(pos)
      const usdNum = parseFloat(pos.usdValue)
      const qtyNum = parseFloat(pos.quantity)
      net.hasBalance = net.hasBalance || qtyNum > 0
      netMap[pos.chainId] = { ...net, totalUsd: (parseFloat(net.totalUsd) + usdNum).toFixed(2) }

      if (pos.symbol === 'USDC') sumUsdc += qtyNum
      if (pos.symbol === 'EURC') sumEurc += qtyNum
      if (pos.symbol === 'USDT') sumUsdt += qtyNum

      if (pos.chainId === ARC_CHAIN_ID) {
        if (pos.symbol === 'USDC') arcUsdc += qtyNum
        if (pos.symbol === 'EURC') arcEurc += qtyNum
        if (pos.symbol === 'USDT') arcUsdt += qtyNum
      } else {
        nonArcUsd += usdNum
      }
    }

    // Count non-Arc chains with any balance
    for (const net of Object.values(netMap)) {
      if (net.chainId !== ARC_CHAIN_ID && net.hasBalance) nonArcNets++
    }

    // sort: chains with balances first, then alphabetical
    const networks = Object.values(netMap).sort((a, b) => {
      if (a.hasBalance && !b.hasBalance) return -1
      if (!a.hasBalance && b.hasBalance) return 1
      return a.chainName.localeCompare(b.chainName)
    })

    // byToken is Arc-only — these are the values shown in the USDC and EURC cards
    const byToken = {
      USDC: { quantity: arcUsdc.toFixed(2), usdValue: arcUsdc.toFixed(2) },
      EURC: { quantity: arcEurc.toFixed(2), usdValue: (arcEurc * eurRate).toFixed(2) },
      USDT: { quantity: arcUsdt.toFixed(2), usdValue: arcUsdt.toFixed(2) },
    }

    // Total portfolio = Arc USDC + Arc EURC (in USD) + non-Arc total
    // This way: USDC card + EURC card + Cross-chain card = Total (no double-count)
    const arcUsd = arcUsdc + arcEurc * eurRate + arcUsdt
    const total = arcUsd + nonArcUsd

    return {
      networks, byToken,
      totalUsd:  total.toFixed(2),
      totalUsdc: sumUsdc.toFixed(2),
      totalEurc: sumEurc.toFixed(2),
      totalUsdt: sumUsdt.toFixed(2),
      nonArcTotalUsd: nonArcUsd.toFixed(2),
      nonArcNetworksWithBalance: nonArcNets,
    }
  }, [effectivePositions, eurRate])

  const refetch = useCallback(() => {
    void refetchContracts()
    void refetchFx()
    void fetchGateway()
    void fetchDirect()
  }, [refetchContracts, refetchFx, fetchGateway, fetchDirect])

  return {
    totalUsd, totalUsdc, totalEurc, totalUsdt,
    networks, byToken,
    nonArcTotalUsd, nonArcNetworksWithBalance,
    gatewayAvailable, gatewayPending,
    lastUpdated,
    isLoading: contractsLoading && directLoading,
    eurUsdRate: eurRate,
    fxUpdatedAt,
    refetch,
  }
}
