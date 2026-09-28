import React from 'react'
import { ArrowLeft, ShieldCheck, Star, Plus } from 'lucide-react'
import { useShopStore } from '../../store/shopStore'
import { useAccount } from 'wagmi'
import { Button } from '../ui/Button'
import { formatUSDC } from '../../utils/format'

const FONT = "'Inter', -apple-system, sans-serif"

interface SellerDashboardProps {
  onBack: () => void
  onListItem: () => void
}

export function SellerDashboard({ onBack, onListItem }: SellerDashboardProps) {
  const { orders, shopProducts } = useShopStore()
  const { address } = useAccount()

  const myProducts = shopProducts.filter((p) =>
    address ? p.merchantWallet.toLowerCase() === address.toLowerCase() : false
  )
  const myOrders = orders.filter((o) =>
    address ? o.sellerAddress.toLowerCase() === address.toLowerCase() : false
  )
  const completedOrders = myOrders.filter((o) => o.status === 'completed')
  const pendingOrders = myOrders.filter((o) => ['payment_protected', 'confirmed', 'shipped', 'delivered'].includes(o.status))
  const pendingBalance = pendingOrders.reduce((acc, o) => acc + o.totalPrice, 0)
  const totalRevenue = completedOrders.reduce((acc, o) => acc + o.totalPrice, 0)

  const stats = [
    { label: 'Active listings', value: myProducts.length },
    { label: 'Pending orders', value: pendingOrders.length },
    { label: 'Completed sales', value: completedOrders.length },
    { label: 'Total revenue', value: `${formatUSDC(totalRevenue)} USDC` },
    { label: 'Pending balance', value: `${formatUSDC(pendingBalance)} USDC` },
  ]

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 9, background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={16} color="#0D0D0D" />
        </button>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em' }}>Seller Dashboard</h1>
          <p style={{ fontSize: 12, color: '#9898A6', marginTop: 1 }}>Manage your listings and orders</p>
        </div>
      </div>

      {/* Seller profile */}
      <div style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#FFF', fontFamily: FONT }}>
              {address ? address.slice(2, 4).toUpperCase() : '?'}
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
              </span>
              {completedOrders.length > 0 && <ShieldCheck size={14} color="#0D0D0D" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Star size={11} color="#0D0D0D" fill="#0D0D0D" />
              <span style={{ fontSize: 12, color: '#0D0D0D', fontWeight: 600 }}>
                {completedOrders.length > 0 ? '5.0' : 'No reviews yet'}
              </span>
              <span style={{ fontSize: 11, color: '#9898A6' }}>· {completedOrders.length} sales</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: '#FFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#9898A6', fontFamily: FONT, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
              {s.value}
            </div>
          </div>
        ))}
        <div style={{ background: '#0D0D0D', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onClick={onListItem}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, marginBottom: 4 }}>List new item</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={18} color="#FFF" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#FFF', fontFamily: FONT }}>Sell item</span>
          </div>
        </div>
      </div>

      {/* Active listings */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: FONT, marginBottom: 10 }}>
          Active listings
        </div>
        {myProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 20px', background: '#F7F7F8', borderRadius: 12, border: '1px dashed rgba(0,0,0,0.12)' }}>
            <p style={{ fontSize: 13, color: '#9898A6', marginBottom: 12 }}>Be the first to list a product.</p>
            <Button onClick={onListItem} icon={<Plus size={14} />}>Sell an Item</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myProducts.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 12, background: '#FFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#F7F7F8' }}>
                  {p.images[0] && <img src={p.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>{p.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0D', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                    {formatUSDC(p.price)} USDC
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.inStock ? '#16A34A' : '#9898A6', alignSelf: 'flex-start', marginTop: 2 }}>
                  {p.inStock ? 'Active' : 'Unlisted'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent orders */}
      {myOrders.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: FONT, marginBottom: 10 }}>
            Recent orders
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myOrders.slice(0, 5).map((o) => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>{o.productName}</div>
                  <div style={{ fontSize: 12, color: '#9898A6' }}>{o.status.replace(/_/g, ' ')}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0D0D0D', fontVariantNumeric: 'tabular-nums' }}>
                  {formatUSDC(o.totalPrice)} USDC
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
