import { useState, useEffect, useCallback } from 'react'
import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'
import { ActivityItem } from '../store/appStore'

const ARC_TESTNET_ID = 5042002
const PAGE_SIZE = 50n

export function useOnchainActivity(address?: string) {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!address) return
    setLoading(true)
    setError(null)
    try {
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

      // Fetch latest block to know range
      const latest = await client.getBlockNumber()
      const fromBlock = latest > 10000n ? latest - 10000n : 0n

      const transferEvent = parseAbiItem(
        'event Transfer(address indexed from, address indexed to, uint256 value)'
      )

      // Sent + received in parallel
      const [sent, received] = await Promise.all([
        client.getLogs({
          address: usdcAddr,
          event: transferEvent,
          args: { from: addr },
          fromBlock,
          toBlock: latest,
        }),
        client.getLogs({
          address: usdcAddr,
          event: transferEvent,
          args: { to: addr },
          fromBlock,
          toBlock: latest,
        }),
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
          timestamp: new Date(), // block timestamp not easily available; use now as placeholder
          status: 'confirmed',
          counterparty: counterparty
            ? counterparty.slice(0, 6) + '...' + counterparty.slice(-4)
            : undefined,
          txHash: log.transactionHash ?? undefined,
        }
      }

      const all = [
        ...sent.map(l => toItem(l, false)),
        ...received.map(l => toItem(l, true)),
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      setItems(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void fetch()
  }, [fetch])

  return { items, loading, error, refetch: fetch }
}
