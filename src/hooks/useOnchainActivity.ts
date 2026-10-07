import { useState, useEffect, useCallback, useRef } from 'react'
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'
import { ActivityItem } from '../store/appStore'

const ARC_TESTNET_ID = 5042002
/** How often to re-poll the RPC for new transfers (ms). */
const POLL_INTERVAL = 30_000

type FetchResult = { items: ActivityItem[]; newReceived: ActivityItem[] }

async function fetchOnchainActivity(
  address: string,
  seenSet: Set<string>,
  isFirst: boolean,
): Promise<FetchResult> {
  const chain = requireChain(ARC_TESTNET_ID)
  const usdc = getUsdc(ARC_TESTNET_ID)
  if (!usdc) throw new Error('USDC not found for chain')

  const client = createPublicClient({
    chain: {
      id: ARC_TESTNET_ID,
      name: chain.name,
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: chain.nativeCurrency.decimals },
      rpcUrls: { default: { http: [chain.rpcUrls[0]] } },
    },
    transport: http(chain.rpcUrls[0]),
  })

  const addr = address as `0x${string}`
  const usdcAddr = usdc.address as `0x${string}`
  const decimals = usdc.decimals

  const latest = await client.getBlockNumber()
  const fromBlock = latest > 10000n ? latest - 10000n : 0n

  const transferEvent = parseAbiItem(
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  )

  const [sent, received] = await Promise.all([
    client.getLogs({ address: usdcAddr, event: transferEvent, args: { from: addr }, fromBlock, toBlock: latest }),
    client.getLogs({ address: usdcAddr, event: transferEvent, args: { to: addr },   fromBlock, toBlock: latest }),
  ])

  const toItem = (log: typeof sent[0], isIn: boolean): ActivityItem => {
    const val = log.args.value ?? 0n
    const amount = parseFloat(formatUnits(val, decimals))
    const counterparty = isIn
      ? (log.args.from as string | undefined)
      : (log.args.to as string | undefined)
    return {
      id: log.transactionHash ?? `${log.blockNumber}-${log.logIndex}`,
      type: isIn ? 'received' : 'sent',
      description: isIn ? 'Received USDC' : 'Sent USDC',
      amount,
      sign: isIn ? '+' : '-',
      timestamp: new Date(),
      status: 'confirmed',
      counterparty: counterparty
        ? counterparty.slice(0, 6) + '...' + counterparty.slice(-4)
        : undefined,
      txHash: log.transactionHash ?? undefined,
    }
  }

  const receivedItems = received.map(l => toItem(l, true))
  const newReceived: ActivityItem[] = []

  for (const item of receivedItems) {
    const key = item.txHash ?? item.id
    if (!isFirst && !seenSet.has(key)) {
      newReceived.push(item)
    }
    seenSet.add(key)
  }

  const items = [
    ...sent.map(l => toItem(l, false)),
    ...receivedItems,
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return { items, newReceived }
}

export function useOnchainActivity(
  address?: string,
  /** Called with each brand-new received item detected on a poll. */
  onNewReceived?: (item: ActivityItem) => void,
) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const isFirstRef = useRef(true)
  const onNewReceivedRef = useRef(onNewReceived)
  onNewReceivedRef.current = onNewReceived

  const refetch = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchOnchainActivity(address, seenRef.current, isFirstRef.current)
      isFirstRef.current = false
      setItems(result.items)
      setError(null)
      if (onNewReceivedRef.current) {
        for (const item of result.newReceived) {
          onNewReceivedRef.current(item)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (!address) return
    void refetch()
    const id = setInterval(() => { void refetch() }, POLL_INTERVAL)
    return () => clearInterval(id)
  // address is the only dep — refetch is stable (useCallback with [address])
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  return { items, loading, error, refetch }
}
