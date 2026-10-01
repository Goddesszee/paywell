import React, { useState } from 'react'
import {
  ArrowLeft, ShieldCheck, Package, Check, AlertTriangle,
  ExternalLink, Star, Loader2,
} from 'lucide-react'
import { ShopOrder, OrderStatus, DisputeReason, useShopStore } from '../../store/shopStore'
import { Button } from '../ui/Button'
import { formatUSDC } from '../../utils/format'
import { formatDate } from '../../utils/format'
import { buildTxExplorerUrl } from '../../onchain-facts'
import { useShopCheckout } from '../../hooks/useShopCheckout'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'

const FONT = "'Inter', -apple-system, sans-serif"

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending_payment:    { label: 'Pending payment',    color: '#9898A6' },
  payment_protected:  { label: 'Payment protected',  color: '#ffffff' },
  confirmed:          { label: 'Confirmed',          color: '#ffffff' },
  shipped:            { label: 'Shipped',            color: '#ffffff' },
  delivered:          { label: 'Delivered',          color: '#ffffff' },
  completed:          { label: 'Completed',          color: '#16A34A' },
  disputed:           { label: 'Disputed',           color: '#DC2626' },
  refunded:           { label: 'Refunded',           color: '#5C5C6B' },
  cancelled:          { label: 'Cancelled',          color: '#5C5C6B' },
}

const DISPUTE_REASONS: { id: DisputeReason; label: string }[] = [
  { id: 'not_received', label: 'Item not received' },
  { id: 'not_as_described', label: 'Not as described' },
  { id: 'damaged', label: 'Arrived damaged' },
  { id: 'seller_unresponsive', label: 'Seller unresponsive' },
  { id: 'other', label: 'Other reason' },
]

interface OrderCardProps {
  order: ShopOrder
  onBack?: () => void
  expanded?: boolean
}

export function OrderCard({ order, onBack, expanded = false }: OrderCardProps) {
  const [showDispute, setShowDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('not_received')
  const [disputeDesc, setDisputeDesc] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)

  const { updateOrder, addDispute, addReview } = useShopStore()
  const { confirmDelivery } = useShopCheckout()
  const { chainId, address } = useAccount()

  const handleConfirmDelivery = async () => {
    if (!order.onchainOrderId) {
      // No onchain order — just mark as completed locally
      updateOrder(order.id, { status: 'completed' })
      toast.success('Delivery confirmed')
      return
    }
    setConfirmingDelivery(true)
    const hash = await confirmDelivery(order.onchainOrderId)
    if (hash) {
      updateOrder(order.id, { status: 'completed', confirmTxHash: hash })
      toast.success('Delivery confirmed · USDC released to seller')
    }
    setConfirmingDelivery(false)
  }

  const handleDispute = () => {
    if (!disputeDesc.trim()) return
    addDispute({
      orderId: order.id,
      reason: disputeReason,
      description: disputeDesc,
      status: 'open',
    })
    setShowDispute(false)
    toast.success('Dispute submitted · Our team will review within 24h')
  }

  const handleReview = () => {
    if (!reviewBody.trim() || !address) return
    addReview({
      orderId: order.id,
      productId: order.productId,
      reviewerAddress: address,
      reviewerName: 'Verified buyer',
      rating: reviewRating,
      body: reviewBody,
    })
    setShowReview(false)
    toast.success('Review submitted')
  }

  const cfg = STATUS_CONFIG[order.status]
  const canConfirm = order.status === 'shipped' || order.status === 'delivered' || order.status === 'payment_protected'
  const canDispute = ['payment_protected', 'confirmed', 'shipped', 'delivered'].includes(order.status) && !order.dispute
  const canReview = order.status === 'completed' && !order.review

  return (
    <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, overflow: 'hidden', fontFamily: FONT }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#5C5C6B', marginBottom: 10, padding: 0, fontFamily: FONT }}>
            <ArrowLeft size={14} /> Back to orders
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', flexShrink: 0 }}>
              <img src={order.productImage} alt={order.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginBottom: 2 }}>{order.productName}</div>
              <div style={{ fontSize: 12, color: '#9898A6' }}>Seller: {order.sellerName}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                {formatUSDC(order.totalPrice)} USDC
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 20,
              background: '#1a1a1a', fontSize: 11, fontWeight: 700,
              color: cfg.color, border: '1px solid rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap',
            }}>
              {cfg.label}
            </span>
            <div style={{ fontSize: 11, color: '#9898A6', marginTop: 4 }}>
              {formatDate(new Date(order.createdAt))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {expanded && (
        <div style={{ padding: '14px 16px' }}>
          <OrderTimeline status={order.status} />

          {/* Tx links */}
          {order.escrowTxHash && chainId && (
            <TxLink hash={order.escrowTxHash} chainId={chainId} label="Escrow transaction" />
          )}
          {order.confirmTxHash && chainId && (
            <TxLink hash={order.confirmTxHash} chainId={chainId} label="Delivery confirmation" />
          )}

          {/* Tracking */}
          {order.deliveryTracking && (
            <div style={{ padding: '8px 12px', background: '#1a1a1a', borderRadius: 9, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#5C5C6B' }}>Tracking: </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>{order.deliveryTracking}</span>
            </div>
          )}

          {/* Dispute card */}
          {order.dispute && (
            <div style={{ padding: '10px 12px', background: '#FFF5F5', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 10, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={13} color="#DC2626" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>Dispute open</span>
              </div>
              <p style={{ fontSize: 12, color: '#5C5C6B', margin: 0 }}>{order.dispute.description}</p>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {canConfirm && (
              <Button
                fullWidth
                onClick={() => { void handleConfirmDelivery() }}
                disabled={confirmingDelivery}
                icon={confirmingDelivery
                  ? <Loader2 size={15} style={{ animation: 'pw-spin 0.7s linear infinite' }} />
                  : <Check size={15} />}
              >
                {confirmingDelivery ? 'Confirming...' : 'Confirm delivery · Release payment'}
              </Button>
            )}
            {canDispute && !showDispute && (
              <Button variant="ghost" fullWidth onClick={() => setShowDispute(true)} icon={<AlertTriangle size={14} />}>
                Raise a dispute
              </Button>
            )}
            {canReview && !showReview && (
              <Button variant="ghost" fullWidth onClick={() => setShowReview(true)} icon={<Star size={14} />}>
                Leave a review
              </Button>
            )}
          </div>

          {/* Dispute form */}
          {showDispute && (
            <div style={{ marginTop: 14, padding: '14px', background: '#1a1a1a', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 10 }}>Raise a dispute</div>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value as DisputeReason)}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.10)', background: '#ffffff', fontSize: 13, fontFamily: FONT, marginBottom: 8, color: '#ffffff' }}
              >
                {DISPUTE_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
              <textarea
                rows={3}
                placeholder="Describe the issue..."
                value={disputeDesc}
                onChange={(e) => setDisputeDesc(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, fontSize: 13, fontFamily: FONT, resize: 'none', background: '#ffffff', color: '#ffffff', boxSizing: 'border-box', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" fullWidth onClick={() => setShowDispute(false)}>Cancel</Button>
                <Button fullWidth onClick={handleDispute} disabled={!disputeDesc.trim()}>Submit dispute</Button>
              </div>
            </div>
          )}

          {/* Review form */}
          {showReview && (
            <div style={{ marginTop: 14, padding: '14px', background: '#1a1a1a', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', marginBottom: 10 }}>Leave a review</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {[1,2,3,4,5].map((s) => (
                  <button key={s} onClick={() => setReviewRating(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <Star size={22} color="#ffffff" fill={s <= reviewRating ? '#ffffff' : 'none'} />
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Share your experience..."
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, fontSize: 13, fontFamily: FONT, resize: 'none', background: '#ffffff', color: '#ffffff', boxSizing: 'border-box', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" fullWidth onClick={() => setShowReview(false)}>Cancel</Button>
                <Button fullWidth onClick={handleReview} disabled={!reviewBody.trim()}>Submit</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TxLink({ hash, chainId, label }: { hash: string; chainId: number; label: string }) {
  return (
    <a
      href={buildTxExplorerUrl(chainId, hash)}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5C5C6B', textDecoration: 'none', padding: '6px 0' }}
    >
      <ExternalLink size={12} />
      {label}: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{hash.slice(0, 14)}…</span>
    </a>
  )
}

const TIMELINE_STEPS: { status: OrderStatus; label: string; Icon: React.ElementType }[] = [
  { status: 'payment_protected', label: 'Payment protected', Icon: ShieldCheck },
  { status: 'confirmed',         label: 'Seller confirmed',   Icon: Check },
  { status: 'shipped',           label: 'Shipped',            Icon: Package },
  { status: 'delivered',         label: 'Delivered',          Icon: Package },
  { status: 'completed',         label: 'Completed',          Icon: Check },
]

const STATUS_ORDER: OrderStatus[] = [
  'pending_payment', 'payment_protected', 'confirmed', 'shipped', 'delivered', 'completed',
]

function OrderTimeline({ status }: { status: OrderStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(status)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 12 }}>
      {TIMELINE_STEPS.map((step, i) => {
        const stepIdx = STATUS_ORDER.indexOf(step.status)
        const done = currentIdx >= stepIdx
        const active = currentIdx === stepIdx
        const Icon = step.Icon
        return (
          <div key={step.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, position: 'relative', paddingBottom: i < TIMELINE_STEPS.length - 1 ? 14 : 0 }}>
            {/* Line */}
            {i < TIMELINE_STEPS.length - 1 && (
              <div style={{
                position: 'absolute', left: 12, top: 24, width: 1, bottom: 0,
                background: done ? '#ffffff' : 'rgba(0,0,0,0.10)',
              }} />
            )}
            {/* Dot */}
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              background: done ? '#ffffff' : '#1a1a1a',
              border: `1.5px solid ${done ? '#ffffff' : 'rgba(0,0,0,0.12)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={11} color={done ? '#ffffff' : '#9898A6'} />
            </div>
            <div style={{ paddingTop: 2 }}>
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: done ? '#ffffff' : '#9898A6', fontFamily: FONT }}>
                {step.label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
