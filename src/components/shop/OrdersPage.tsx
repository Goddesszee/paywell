import React, { useState } from 'react'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { useShopStore, ShopOrder } from '../../store/shopStore'
import { useAccount } from 'wagmi'
import { Button } from '../ui/Button'
import { OrderCard } from './OrderTimeline'

const FONT = "'Inter', -apple-system, sans-serif"

type Tab = 'buying' | 'selling' | 'disputes'

interface OrdersPageProps {
  onBack: () => void
  onContinueShopping: () => void
}

export function OrdersPage({ onBack, onContinueShopping }: OrdersPageProps) {
  const { orders } = useShopStore()
  const { address } = useAccount()
  const [tab, setTab] = useState<Tab>('buying')
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null)

  const buyingOrders = orders.filter((o) => !address || o.buyerAddress.toLowerCase() === address.toLowerCase())
  const sellingOrders = orders.filter((o) => !address || o.sellerAddress.toLowerCase() === address.toLowerCase())
  const disputedOrders = orders.filter((o) => o.status === 'disputed')

  const currentList = tab === 'buying' ? buyingOrders : tab === 'selling' ? sellingOrders : disputedOrders

  if (selectedOrder) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 80 }}>
        <OrderCard
          order={selectedOrder}
          onBack={() => setSelectedOrder(null)}
          expanded
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 9, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={16} color="#ffffff" />
        </button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#ffffff', fontFamily: FONT, letterSpacing: '-0.02em' }}>My Orders</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#1a1a1a', borderRadius: 11, padding: 4 }}>
        {([
          { id: 'buying' as Tab, label: `Buying (${buyingOrders.length})` },
          { id: 'selling' as Tab, label: `Selling (${sellingOrders.length})` },
          { id: 'disputes' as Tab, label: `Disputes (${disputedOrders.length})` },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, height: 34, borderRadius: 8,
              background: tab === id ? '#ffffff' : 'transparent',
              border: tab === id ? '1px solid rgba(0,0,0,0.09)' : 'none',
              fontSize: 12, fontWeight: 700, color: tab === id ? '#ffffff' : '#5C5C6B',
              cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {currentList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <ShoppingBag size={22} color="#9898A6" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', fontFamily: FONT, marginBottom: 6 }}>
            {tab === 'buying' ? "You haven't made any purchases yet." : tab === 'selling' ? 'No sales yet.' : 'No disputes.'}
          </h3>
          <p style={{ fontSize: 13, color: '#9898A6', marginBottom: 20 }}>
            {tab === 'buying' ? 'Find something you love in the marketplace.' : ''}
          </p>
          {tab === 'buying' && (
            <Button onClick={onContinueShopping}>Explore Shop</Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {currentList.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <OrderCard order={order} expanded={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
