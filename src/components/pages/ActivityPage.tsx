import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import { ArrowUpRight, ArrowDownLeft, Bot, ShoppingBag, Activity, ExternalLink, RefreshCw } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { useAppStore, ActivityItem, ActivityType } from '../../store/appStore'
import { formatUSDC, formatRelativeTime } from '../../utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useOnchainActivity } from '../../hooks/useOnchainActivity'

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'sent', label: 'Sent' },
  { id: 'purchase', label: 'Purchases' },
  { id: 'agent_purchase', label: 'Agent' },
] as const

export function ActivityPage() {
  const { address } = useAccount()
  const { activity } = useAppStore()
  const [filter, setFilter] = useState<'all' | ActivityType>('all')
  const { items: onchainItems, loading, refetch } = useOnchainActivity(address)

  // Onchain data takes priority; Zustand local activity fills gaps
  const mergedActivity = onchainItems.length > 0 ? onchainItems : activity

  const filtered = filter === 'all' ? mergedActivity : mergedActivity.filter((a) => a.type === filter)

  // Group by day
  const grouped: Record<string, ActivityItem[]> = {}
  filtered.forEach((item) => {
    const d = new Date(item.timestamp)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const isYesterday = d.toDateString() === new Date(now.getTime() - 86400000).toDateString()
    const key = isToday ? 'Today' : isYesterday ? 'Yesterday' : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(d)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(item)
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 lg:pb-8">
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-xl font-bold text-[#122d45]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Activity
        </h1>
        <Badge variant="default" size="sm">{mergedActivity.length} transactions</Badge>
        <button
          onClick={() => void refetch()}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f5f5f8] text-[#6b6580] transition-colors"
          title="Refresh from chain"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 h-8 px-3 rounded-full text-xs font-semibold transition-all ${
              filter === f.id
                ? 'bg-[#122d45] text-white'
                : 'bg-[#f5f5f8] text-[#334155] hover:bg-[#eeeef4]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Activity size={36} className="text-[#8a849c] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#122d45] mb-1">No activity yet</h3>
          <p className="text-sm text-[#6b6580]">Your onchain USDC transfers will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <div className="text-xs font-bold text-[#6b6580] uppercase tracking-wider mb-2">{day}</div>
              <Card padding="none">
                <div className="divide-y divide-[rgba(18,45,69,0.05)]">
                  {items.map((item) => (
                    <ActivityDetailRow key={item.id} item={item} />
                  ))}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityDetailRow({ item }: { item: ActivityItem }) {
  const typeConfig: Record<string, { bg: string; color: string; Icon: React.FC<{ size: number }> }> = {
    received: { bg: 'bg-[#dcfce7]', color: 'text-[#1a8047]', Icon: ({ size }) => <ArrowDownLeft size={size} /> },
    sent: { bg: 'bg-[#fee2e2]', color: 'text-[#ba2b4c]', Icon: ({ size }) => <ArrowUpRight size={size} /> },
    purchase: { bg: 'bg-[#dbeafe]', color: 'text-[#1a6fd4]', Icon: ({ size }) => <ShoppingBag size={size} /> },
    agent_purchase: { bg: 'bg-[#ede9fe]', color: 'text-[#6d28d9]', Icon: ({ size }) => <Bot size={size} /> },
    request: { bg: 'bg-[#fef9c3]', color: 'text-[#854d0e]', Icon: ({ size }) => <ArrowUpRight size={size} /> },
  }
  const config = typeConfig[item.type] || typeConfig.purchase
  const { Icon } = config
  const amountColor = item.sign === '+' ? 'text-[#1a8047]' : 'text-[#122d45]'
  const sign = item.sign === '+' ? '+' : '−'

  return (
    <div className="px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bg}`}>
        <span className={config.color}><Icon size={16} /></span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#122d45] truncate">{item.description}</span>
          {item.agentInitiated && <Badge variant="blue" size="sm">Agent</Badge>}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#6b6580] mt-0.5">
          {item.counterparty && <span className="truncate max-w-[100px]">{item.counterparty}</span>}
          {item.counterparty && <span>·</span>}
          <span>{formatRelativeTime(item.timestamp)}</span>
          {item.txHash && (
            <>
              <span>·</span>
              <a
                href={buildTxExplorerUrl(5042002, item.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[#1a6fd4] hover:text-[#122d45] font-semibold transition-colors"
              >
                <ExternalLink size={11} />
                Tx
              </a>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className={`text-sm font-bold tabular-nums ${amountColor}`}>
          {sign}{formatUSDC(item.amount)} <span className="text-xs font-semibold text-[#8a849c]">USDC</span>
        </div>
        <Badge
          variant={item.status === 'confirmed' ? 'success' : item.status === 'pending' ? 'warning' : 'danger'}
          size="sm"
        >
          {item.status}
        </Badge>
      </div>
    </div>
  )
}
