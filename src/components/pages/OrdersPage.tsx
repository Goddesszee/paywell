/**
 * NAN Orders — Protected Purchase history and detail view
 * Tabs: All / Active / Completed / Disputed
 * Order detail: delivery timeline, confirm delivery, dispute, refund
 */
import React, { useState } from 'react'
import { ArrowLeft, Package, ExternalLink, ChevronRight, Clock, AlertCircle } from 'lucide-react'
import { useAccount, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import {
  useAppStore,
  ProtectedOrder,
  DeliveryStage,
  DisputeReason,
  OrderStatus,
} from '../../store/appStore'
import { formatUSDC, formatDate } from '../../utils/format'
import { buildTxExplorerUrl } from '../../onchain-facts'
import { Button } from '../ui/Button'

// ── constants ──────────────────────────────────────────────────────────────────

const FONT = "'Inter', -apple-system, sans-serif"
const BLACK = '#0D0D0D'
const SURFACE = '#F7F7F8'
const BORDER = 'rgba(0,0,0,0.07)'
const TEXT_2 = '#5C5C6B'
const TEXT_3 = '#9898A6'

const ESCROW_ADDRESS = '0x1d33876fa77b0d0026f8cee30448941c0cf075cb' as const
const ESCROW_ABI = [
  { type: 'function', name: 'confirmOrder', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'disputeOrder', inputs: [{ name: 'orderId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const

// ── delivery timeline config ───────────────────────────────────────────────────

interface TimelineStep {
  stage: DeliveryStage
  label: string
}

const TIMELINE_STEPS: TimelineStep[] = [
  { stage: 'payment_secured',   label: 'Payment secured' },
  { stage: 'preparing',         label: 'Seller preparing' },
  { stage: 'shipped',           label: 'Shipped' },
  { stage: 'in_transit',        label: 'In transit' },
  { stage: 'out_for_delivery',  label: 'Out for delivery' },
  { stage: 'delivered',         label: 'Delivered' },
  { stage: 'buyer_confirmation',label: 'Buyer confirmation' },
  { stage: 'payment_released',  label: 'Payment released' },
]

const STAGE_ORDER = TIMELINE_STEPS.map((s) => s.stage)

function stageIndex(stage: DeliveryStage) {
  return STAGE_ORDER.indexOf(stage)
}

// ── status badge ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: OrderStatus | string }) {
  const map: Record<string, string> = {
    active:    'border border-[rgba(0,0,0,0.1)] text-[#0D0D0D] bg-[#F7F7F8]',
    completed: 'border border-[rgba(0,0,0,0.12)] text-[#0D0D0D] bg-[#F7F7F8]',
    disputed:  'border border-[rgba(0,0,0,0.15)] text-[#0D0D0D] bg-[#F0F0F0]',
    refunded:  'border border-[rgba(0,0,0,0.1)] text-[#5C5C6B] bg-[#F7F7F8]',
    cancelled: 'border border-[rgba(0,0,0,0.1)] text-[#9898A6] bg-[#F7F7F8]',
  }
  const label: Record<string, string> = {
    active:    '● Active',
    completed: '✓ Completed',
    disputed:  '! Disputed',
    refunded:  '✓ Refunded',
    cancelled: '○ Cancelled',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? map.active}`}>
      {label[status] ?? status}
    </span>
  )
}

// ── delivery timeline component ────────────────────────────────────────────────

function DeliveryTimeline({ order }: { order: ProtectedOrder }) {
  const currentIdx = stageIndex(order.deliveryStage)
  const isCompleted = order.status === 'completed'
  const isDisputed  = order.status === 'disputed'

  // Condensed view: show only key stages if not completed
  const visibleSteps = isCompleted
    ? TIMELINE_STEPS
    : [
        TIMELINE_STEPS[0],
        { stage: 'preparing' as DeliveryStage, label: 'Seller preparing' },
        { stage: 'out_for_delivery' as DeliveryStage, label: 'Delivery' },
        { stage: 'buyer_confirmation' as DeliveryStage, label: 'Buyer confirmation' },
        { stage: 'payment_released' as DeliveryStage, label: 'Payment release' },
      ]

  return (
    <div style={{ padding: '16px 0' }}>
      {visibleSteps.map(({ stage, label }, i) => {
        const stepIdx = stageIndex(stage)
        const done    = stepIdx < currentIdx || (isCompleted && stepIdx <= currentIdx)
        const active  = stepIdx === currentIdx && !isCompleted
        const future  = stepIdx > currentIdx

        let symbol = '○'
        if (done)   symbol = '✓'
        if (active) symbol = '●'
        if (isDisputed && active) symbol = '!'

        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < visibleSteps.length - 1 ? 0 : 0 }}>
            {/* connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? BLACK : active ? BLACK : SURFACE,
                border: done || active ? `2px solid ${BLACK}` : `2px solid rgba(0,0,0,0.15)`,
                fontSize: 11, fontWeight: 700,
                color: done || active ? '#FFF' : TEXT_3,
                flexShrink: 0,
              }}>
                {symbol}
              </div>
              {i < visibleSteps.length - 1 && (
                <div style={{
                  width: 2, flex: 1, minHeight: 24,
                  background: done ? BLACK : 'rgba(0,0,0,0.1)',
                  margin: '2px 0',
                }} />
              )}
            </div>
            {/* label */}
            <div style={{ paddingBottom: i < visibleSteps.length - 1 ? 16 : 0, paddingTop: 2 }}>
              <div style={{
                fontSize: 13, fontWeight: active ? 700 : done ? 600 : 400,
                color: future ? TEXT_3 : done ? TEXT_2 : BLACK,
                fontFamily: FONT,
              }}>
                {label}
              </div>
              {active && isDisputed && (
                <div style={{ fontSize: 11, color: TEXT_3, marginTop: 2, fontFamily: FONT }}>
                  ! Under dispute review
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Completed footer */}
      {isCompleted && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 2 }}>✓ Payment released</div>
          <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT }}>✓ Transaction completed</div>
        </div>
      )}
    </div>
  )
}

// ── dispute reasons ────────────────────────────────────────────────────────────

const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'item_not_received', label: 'Item not received' },
  { value: 'item_differs',      label: 'Item differs from listing' },
  { value: 'damaged',           label: 'Damaged item' },
  { value: 'wrong_item',        label: 'Wrong item received' },
  { value: 'other',             label: 'Other' },
]

// ── order detail page ──────────────────────────────────────────────────────────

function OrderDetail({
  order,
  onBack,
}: {
  order: ProtectedOrder
  onBack: () => void
}) {
  const { chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { confirmOrderDelivery, openDispute, requestRefund } = useAppStore()

  const [confirming, setConfirming]   = useState(false)
  const [showDispute, setShowDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('item_not_received')
  const [disputeNote, setDisputeNote] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [showRefund, setShowRefund]   = useState(false)

  const isActive     = order.status === 'active'
  const isDisputed   = order.status === 'disputed'
  const isCompleted  = order.status === 'completed'
  const canConfirm   = isActive && order.deliveryStage === 'delivered'
  const canDispute   = isActive && !isDisputed
  const canRefund    = (isActive || isDisputed) && !order.refundStatus

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      if (order.onchainOrderId !== undefined) {
        const hash = await writeContractAsync({
          address: ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'confirmOrder',
          args: [BigInt(order.onchainOrderId)],
        })
        confirmOrderDelivery(order.id, hash)
        toast.success('Delivery confirmed — payment released to seller')
      } else {
        // No onchain order id yet (simulated / pending) — confirm locally
        confirmOrderDelivery(order.id)
        toast.success('Delivery confirmed')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      toast.error(msg.includes('User rejected') ? 'Transaction cancelled' : 'Confirm failed')
    }
    setConfirming(false)
  }

  const handleDispute = async () => {
    setSubmittingDispute(true)
    try {
      if (order.onchainOrderId !== undefined) {
        await writeContractAsync({
          address: ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'disputeOrder',
          args: [BigInt(order.onchainOrderId)],
        })
      }
      openDispute(order.id, disputeReason, disputeNote)
      toast.success('Dispute opened — your payment remains protected')
      setShowDispute(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      toast.error(msg.includes('User rejected') ? 'Transaction cancelled' : 'Dispute failed')
    }
    setSubmittingDispute(false)
  }

  const handleRefund = () => {
    requestRefund(order.id)
    toast.success('Refund requested')
    setShowRefund(false)
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 0 100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ width: 36, height: 36, borderRadius: 9, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ArrowLeft size={16} color={BLACK} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: TEXT_3, fontWeight: 600, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Order {order.id}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: BLACK, fontFamily: FONT, letterSpacing: '-0.02em' }}>${formatUSDC(order.amount)} USDC</div>
        </div>
        <StatusPill status={order.status} />
      </div>

      {/* Product card */}
      <div style={{ background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          {order.productImageUrl ? (
            <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: SURFACE, flexShrink: 0 }}>
              <img src={order.productImageUrl} alt={order.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 10, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={20} color={TEXT_3} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 2 }}>{order.productName}</div>
            <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT }}>Sold by {order.seller}</div>
            {order.quantity > 1 && (
              <div style={{ fontSize: 12, color: TEXT_3, fontFamily: FONT }}>Qty: {order.quantity}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120, background: SURFACE, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: TEXT_3, fontWeight: 600, fontFamily: FONT, marginBottom: 2 }}>Amount</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>${formatUSDC(order.amount)} USDC</div>
          </div>
          <div style={{ flex: 1, minWidth: 120, background: SURFACE, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: TEXT_3, fontWeight: 600, fontFamily: FONT, marginBottom: 2 }}>Date</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: BLACK, fontFamily: FONT }}>{formatDate(new Date(order.createdAt))}</div>
          </div>
        </div>
      </div>

      {/* Protected Purchase banner */}
      <div style={{ background: BLACK, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#FFF', fontFamily: FONT, marginBottom: 3 }}>NAN Protected Purchase</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: FONT, lineHeight: 1.5 }}>
          Your payment is secured until the agreed transaction conditions are completed.
        </div>
      </div>

      {/* Delivery timeline */}
      <div style={{ background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_3, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 12 }}>Delivery status</div>
        <DeliveryTimeline order={order} />
      </div>

      {/* Dispute notice */}
      {isDisputed && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertCircle size={16} color={BLACK} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 2 }}>Dispute {order.disputeStatus === 'under_review' ? 'Under Review' : order.disputeStatus === 'resolved' ? 'Resolved' : 'Opened'}</div>
              <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT, lineHeight: 1.5 }}>Payment remains protected while the dispute is being reviewed.</div>
              {order.disputeNote && (
                <div style={{ fontSize: 12, color: TEXT_3, fontFamily: FONT, marginTop: 4, fontStyle: 'italic' }}>"{order.disputeNote}"</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Refund status */}
      {order.refundStatus && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 2 }}>Refund {order.refundStatus === 'completed' ? '✓ Completed' : order.refundStatus === 'processing' ? '● Processing' : order.refundStatus === 'approved' ? '✓ Approved' : '○ Requested'}</div>
          <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT }}>
            {order.refundStatus === 'completed' ? 'USDC has been returned to your wallet.' : 'Your refund request is being processed.'}
          </div>
        </div>
      )}

      {/* Onchain links */}
      {order.txHash && chainId && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_3, fontFamily: FONT }}>Escrow transaction</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: TEXT_2 }}>{order.txHash.slice(0, 14)}…{order.txHash.slice(-6)}</div>
          </div>
          <a href={buildTxExplorerUrl(chainId, order.txHash)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: BLACK, textDecoration: 'none', fontFamily: FONT }}>
            View on Arc <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Actions */}
      {(canConfirm || canDispute || canRefund) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {canConfirm && (
            <Button fullWidth onClick={() => { void handleConfirm() }} disabled={confirming} size="lg">
              {confirming ? 'Confirming…' : '✓ Confirm delivery & release payment'}
            </Button>
          )}
          {canDispute && !showDispute && (
            <button
              onClick={() => setShowDispute(true)}
              style={{ width: '100%', height: 44, borderRadius: 12, background: 'transparent', border: `1px solid ${BORDER}`, color: BLACK, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}
            >
              Open dispute
            </button>
          )}
          {canRefund && !showRefund && !order.refundStatus && (
            <button
              onClick={() => setShowRefund(true)}
              style={{ width: '100%', height: 40, borderRadius: 12, background: 'transparent', border: 'none', color: TEXT_2, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}
            >
              Request refund
            </button>
          )}
        </div>
      )}

      {/* Dispute form */}
      {showDispute && (
        <div style={{ background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 4 }}>Open a dispute</div>
          <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT, marginBottom: 14, lineHeight: 1.5 }}>
            Your payment remains protected while the dispute is being reviewed.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_2, marginBottom: 6, fontFamily: FONT }}>Reason</div>
            {DISPUTE_REASONS.map((r) => (
              <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: `1px solid ${BORDER}` }}>
                <input type="radio" name="dispute-reason" value={r.value} checked={disputeReason === r.value} onChange={() => setDisputeReason(r.value)} style={{ accentColor: BLACK }} />
                <span style={{ fontSize: 13, color: BLACK, fontFamily: FONT }}>{r.label}</span>
              </label>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_2, marginBottom: 6, fontFamily: FONT }}>Additional details (optional)</div>
            <textarea
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              placeholder="Describe the issue…"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', border: `1px solid rgba(0,0,0,0.12)`, borderRadius: 10, fontSize: 13, fontFamily: FONT, resize: 'none', background: SURFACE, color: BLACK, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowDispute(false)} style={{ flex: 1, height: 44, borderRadius: 12, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_2, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => { void handleDispute() }} disabled={submittingDispute} style={{ flex: 2, height: 44, borderRadius: 12, background: BLACK, border: 'none', color: '#FFF', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: submittingDispute ? 'not-allowed' : 'pointer', opacity: submittingDispute ? 0.6 : 1 }}>
              {submittingDispute ? 'Submitting…' : 'Submit dispute'}
            </button>
          </div>
        </div>
      )}

      {/* Refund confirmation */}
      {showRefund && (
        <div style={{ background: '#FFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 4 }}>Request a refund</div>
          <div style={{ fontSize: 12, color: TEXT_2, fontFamily: FONT, marginBottom: 16, lineHeight: 1.5 }}>
            A refund request will be sent to the seller. Your USDC remains protected during review.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowRefund(false)} style={{ flex: 1, height: 44, borderRadius: 12, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_2, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleRefund} style={{ flex: 2, height: 44, borderRadius: 12, background: BLACK, border: 'none', color: '#FFF', fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: 'pointer' }}>
              Request refund
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── orders list ────────────────────────────────────────────────────────────────

type OrderTab = 'all' | 'active' | 'completed' | 'disputed'

const TABS: { id: OrderTab; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed',  label: 'Disputed' },
]

function stageSummary(stage: DeliveryStage): string {
  const map: Record<DeliveryStage, string> = {
    payment_secured:   'Payment secured',
    preparing:         'Seller preparing',
    shipped:           'Shipped',
    in_transit:        'In transit',
    out_for_delivery:  'Out for delivery',
    delivered:         'Delivered',
    buyer_confirmation:'Awaiting your confirmation',
    payment_released:  'Payment released',
  }
  return map[stage] ?? stage
}

function OrderRow({ order, onClick }: { order: ProtectedOrder; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 0', borderBottom: `1px solid ${BORDER}`,
        background: 'transparent', border: 'none', cursor: 'pointer',
        textAlign: 'left', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: SURFACE, flexShrink: 0 }}>
        {order.productImageUrl
          ? <img src={order.productImageUrl} alt={order.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={18} color={TEXT_3} /></div>
        }
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.productName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: TEXT_3, fontFamily: FONT }}>{order.id}</span>
          <span style={{ fontSize: 11, color: TEXT_3 }}>·</span>
          <span style={{ fontSize: 11, color: TEXT_2, fontFamily: FONT }}>{stageSummary(order.deliveryStage)}</span>
        </div>
      </div>
      {/* Right side */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BLACK, fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>${formatUSDC(order.amount)}</div>
        <div style={{ fontSize: 11, color: TEXT_3, fontFamily: FONT, marginTop: 2 }}>USDC</div>
      </div>
      <ChevronRight size={14} color={TEXT_3} style={{ flexShrink: 0 }} />
    </button>
  )
}

// ── main OrdersPage export ─────────────────────────────────────────────────────

export function OrdersPage() {
  const { orders } = useAppStore()
  const [activeTab, setActiveTab] = useState<OrderTab>('all')
  const [selectedOrder, setSelectedOrder] = useState<ProtectedOrder | null>(null)

  if (selectedOrder) {
    // Refetch from store so UI stays reactive after mutations
    const live = orders.find((o) => o.id === selectedOrder.id) ?? selectedOrder
    return <OrderDetail order={live} onBack={() => setSelectedOrder(null)} />
  }

  const filtered = orders.filter((o) => {
    if (activeTab === 'all')       return true
    if (activeTab === 'active')    return o.status === 'active'
    if (activeTab === 'completed') return o.status === 'completed' || o.status === 'refunded'
    if (activeTab === 'disputed')  return o.status === 'disputed'
    return true
  })

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 0 100px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: BLACK, fontFamily: FONT, letterSpacing: '-0.02em', margin: 0, marginBottom: 4 }}>Orders</h1>
        <p style={{ fontSize: 13, color: TEXT_2, fontFamily: FONT, margin: 0 }}>Your NAN Protected Purchases</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map((tab) => {
          const count = orders.filter((o) => {
            if (tab.id === 'all')       return true
            if (tab.id === 'active')    return o.status === 'active'
            if (tab.id === 'completed') return o.status === 'completed' || o.status === 'refunded'
            if (tab.id === 'disputed')  return o.status === 'disputed'
            return true
          }).length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flexShrink: 0, height: 32, padding: '0 14px', borderRadius: 20,
                background: activeTab === tab.id ? BLACK : SURFACE,
                border: `1px solid ${activeTab === tab.id ? BLACK : BORDER}`,
                color: activeTab === tab.id ? '#FFF' : BLACK,
                fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}{count > 0 ? ` · ${count}` : ''}
            </button>
          )
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Clock size={22} color={TEXT_3} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: BLACK, fontFamily: FONT, marginBottom: 6 }}>
            {activeTab === 'all' ? 'No orders yet' : `No ${activeTab} orders`}
          </div>
          <div style={{ fontSize: 13, color: TEXT_2, fontFamily: FONT, lineHeight: 1.5 }}>
            {activeTab === 'all' ? 'Complete a checkout in the Shop to see your Protected Purchase here.' : `Orders will appear here once they match the "${activeTab}" status.`}
          </div>
        </div>
      ) : (
        <div>
          {filtered.map((order) => (
            <OrderRow key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
          ))}
        </div>
      )}
    </div>
  )
}
