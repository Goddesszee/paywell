import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
import { getUsdc, requireChain } from '@/onchain-facts'
import { ActivityItem } from '../store/appStore'

const ARC_TESTNET_ID = 5042002
export const ACTIVITY_POLL_INTERVAL = 30_000

// ── Public client (module-level singleton, recreated only when needed) ────────
let _client: ReturnType<typeof createPublicClient> | null = null
function getClient() {
  if (_client) return _client
  const chain = requireChain(ARC_TESTNET_ID)
  _client = createPublicClient({
    chain: {
      id: ARC_TESTNET_ID,
      name: chain.name,
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: chain.nativeCurrency.decimals },
      rpcUrls: { default: { http: [chain.rpcUrls[0]] } },
    },
    transport: http(chain.rpcUrls[0]),
  })
  return _client
}

// ── Fetch onchain USDC transfers for an address ───────────────────────────────
export async function fetchOnchainActivity(
  address: string,
  /** Set of txHashes already seen — mutated in place to add new ones. */
  seenSet: Set<string>,
  /** True on the very first call — seeds seenSet without firing onNewReceived. */
  isFirst: boolean,
): Promise<{ items: ActivityItem[]; newReceived: ActivityItem[] }> {
  const usdc = getUsdc(ARC_TESTNET_ID)
  if (!usdc) throw new Error('USDC not found for Arc Testnet')

  const client = getClient()
  const addr = address.toLowerCase() as `0x${string}`
  const usdcAddr = usdc.address as `0x${string}`
  const decimals = usdc.decimals

  const latest = await client.getBlockNumber()
  const fromBlock = latest > 10_000n ? latest - 10_000n : 0n

  const transferEvent = parseAbiItem(
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  )

  const [sentLogs, receivedLogs] = await Promise.all([
    client.getLogs({ address: usdcAddr, event: transferEvent, args: { from: addr }, fromBlock, toBlock: latest }),
    client.getLogs({ address: usdcAddr, event: transferEvent, args: { to: addr },   fromBlock, toBlock: latest }),
  ])

  // Fetch block timestamps for all unique block numbers so we show real times
  const blockNums = [...new Set([...sentLogs, ...receivedLogs].map(l => l.blockNumber).filter(Boolean))] as bigint[]
  const blockTimestamps = new Map<bigint, Date>()
  await Promise.all(
    blockNums.map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn })
        blockTimestamps.set(bn, new Date(Number(block.timestamp) * 1000))
      } catch {
        blockTimestamps.set(bn, new Date())
      }
    }),
  )

  const chain = requireChain(ARC_TESTNET_ID)

  const toItem = (log: typeof sentLogs[0], isIn: boolean): ActivityItem => {
    const val = log.args.value ?? 0n
    const amount = parseFloat(formatUnits(val, decimals))
    const counterparty = isIn
      ? (log.args.from as string | undefined)
      : (log.args.to  as string | undefined)
    const ts = log.blockNumber ? (blockTimestamps.get(log.blockNumber) ?? new Date()) : new Date()
    return {
      id: log.transactionHash ?? `${log.blockNumber}-${log.logIndex}`,
      type: isIn ? 'received' : 'sent',
      description: isIn ? 'Received USDC' : 'Sent USDC',
      amount,
      sign: isIn ? '+' : '-',
      timestamp: ts,
      status: 'confirmed',
      counterparty: counterparty
        ? `${counterparty.slice(0, 6)}…${counterparty.slice(-4)}`
        : undefined,
      txHash: log.transactionHash ?? undefined,
      chain: chain.name,
    }
  }

  const receivedItems = receivedLogs.map(l => toItem(l, true))
  const newReceived: ActivityItem[] = []

  for (const item of receivedItems) {
    const key = item.txHash ?? item.id
    if (!isFirst && !seenSet.has(key)) {
      newReceived.push(item)
    }
    seenSet.add(key)
  }

  // Seed sent hashes on first run too (so old sent txs don't fire notifications)
  if (isFirst) {
    for (const log of sentLogs) {
      const key = log.transactionHash ?? `${log.blockNumber}-${log.logIndex}`
      seenSet.add(key)
    }
  }

  const items = [
    ...sentLogs.map(l => toItem(l, false)),
    ...receivedItems,
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return { items, newReceived }
}
