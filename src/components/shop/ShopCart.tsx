import React from 'react'
import { ArrowLeft, X, ShoppingBag, ShieldCheck, Loader2, ExternalLink } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useEffect } from 'react'
import { Button } from '../ui/Button'
import { CartItem } from '../../store/appStore'
import { formatUSDC } from '../../utils/format'
import { useShopCheckout } from '../../hooks/useShopCheckout'
import { buildTxExplorerUrl } from '../../onchain-facts'
import { marketplaceFee, MARKETPLACE_FEE_BPS, bpsToPercent } from '../../lib/fees'

const FONT = "'Inter', -apple-system, sans-serif"

interface CartPageProps {
  cart: CartItem[]
  total: number
  onBack: () => void
  onRemove: (id: string) => void
  onCheckout: () => void
  onContinueShopping: () => void
}

export function CartPage({
  cart, total, onBack, onRemove, onCheckout, onContinueShopping,
}: CartPageProps) {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ width: 36, height: 36, borderRadius: 9, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <ArrowLeft size={16} color="#ffffff" />
        </button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#ffffff', fontFamily: FONT, letterSpacing: '-0.02em' }}>
          Cart {cart.length > 0 && <span style={{ color: '#9898A6', fontWeight: 600 }}>({cart.length})</span>}
        </h1>
      </div>

      {cart.length === 0 ? (
        /* Empty state */
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <ShoppingBag size={24} color="#9898A6" />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', fontFamily: FONT, marginBottom: 6 }}>Your cart is empty</h3>
          <p style={{ fontSize: 13, color: '#5C5C6B', marginBottom: 20 }}>Add products to get started.</p>
          <Button onClick={onContinueShopping}>Continue Shopping</Button>
        </div>
      ) : (
        <>
          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {cart.map((item) => (
              <CartItemRow key={item.product.id} item={item} onRemove={onRemove} />
            ))}
          </div>

          {/* Summary */}
          {(() => {
            const fee = marketplaceFee(total)
            const gross = total + fee
            return (
              <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
                <SummaryRow label="Subtotal" value={`${formatUSDC(total)} USDC`} />
                <SummaryRow label="Network fee" value="Free" />
                <SummaryRow label={`Platform fee (${bpsToPercent(MARKETPLACE_FEE_BPS)})`} value={`${formatUSDC(fee)} USDC`} />
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', fontFamily: FONT }}>Total</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>
                    {formatUSDC(gross)} USDC
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Protected purchase note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#1a1a1a', borderRadius: 10, border: '1px solid rgba(0,0,0,0.07)', marginBottom: 14 }}>
            <ShieldCheck size={14} color="#ffffff" />
            <span style={{ fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
              Payment held in escrow · Released when you confirm delivery
            </span>
          </div>

          <Button fullWidth size="lg" onClick={onCheckout} icon={<ShoppingBag size={17} />}>
            Continue to Checkout
          </Button>
        </>
      )}
    </div>
  )
}

function CartItemRow({ item, onRemove }: { item: CartItem; onRemove: (id: string) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 12, padding: '12px 12px',
    }}>
      <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', flexShrink: 0 }}>
        <img src={item.product.imageUrl} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', fontFamily: FONT, marginBottom: 2 }}>
          {item.product.name}
        </div>
        <div style={{ fontSize: 12, color: '#9898A6' }}>{item.product.merchant}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
          {formatUSDC(item.product.price * item.quantity)} USDC
        </div>
      </div>
      <button
        onClick={() => onRemove(item.product.id)}
        style={{ width: 28, height: 28, borderRadius: 7, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
      >
        <X size={13} color="#5C5C6B" />
      </button>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: '#5C5C6B', fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', fontFamily: FONT }}>{value}</span>
    </div>
  )
}

// ── Checkout page ────────────────────────────────────────────────────────────

interface CheckoutPageProps {
  cart: CartItem[]
  total: number
  onBack: () => void
  onComplete: (escrowTxHash?: string) => void
}

export function CheckoutPage({ cart, total, onBack, onComplete }: CheckoutPageProps) {
  const { isConnected, chainId } = useAccount()
  const { checkout, status, txHash, error } = useShopCheckout()

  useEffect(() => {
    if (status === 'confirmed') {
      const t = setTimeout(() => onComplete(txHash), 1200)
      return () => clearTimeout(t)
    }
  }, [status, txHash, onComplete])

  const isPending = status === 'approving' || status === 'creating-order' || status === 'pending'

  const handlePay = async () => {
    if (!isConnected) return
    await checkout(cart)
  }

  const statusLabel = {
    approving: 'Approving USDC...',
    'creating-order': 'Creating escrow order...',
    pending: 'Confirming transaction...',
    confirmed: 'Payment protected',
    error: 'Payment failed',
    idle: `Pay ${formatUSDC(total)} USDC`,
  }[status] ?? `Pay ${formatUSDC(total)} USDC`

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 9, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={16} color="#ffffff" />
        </button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#ffffff', fontFamily: FONT, letterSpacing: '-0.02em' }}>Checkout</h1>
      </div>

      {!isConnected && (
        <div style={{ padding: '10px 14px', background: '#1a1a1a', borderRadius: 10, border: '1px solid rgba(0,0,0,0.10)', marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: '#5C5C6B', fontFamily: FONT }}>Connect your wallet to complete this purchase.</span>
        </div>
      )}

      {/* Order summary */}
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Order summary</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
          {cart.map((item) => (
            <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#5C5C6B', fontFamily: FONT }}>{item.product.name} ×{item.quantity}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
                {formatUSDC(item.product.price * item.quantity)} USDC
              </span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', fontFamily: FONT }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(total)} USDC</span>
        </div>
      </div>

      {/* Payment method */}
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Payment</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={16} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>USDC · Protected Purchase</div>
            <div style={{ fontSize: 12, color: '#9898A6' }}>Held in PaywellEscrow · Arc Testnet</div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 14px', background: '#FFF5F5', border: '1px solid rgba(220,38,38,0.20)', borderRadius: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', marginBottom: 2 }}>Payment could not be completed.</div>
          <div style={{ fontSize: 12, color: '#5C5C6B' }}>{error}</div>
        </div>
      )}

      {/* Tx hash */}
      {txHash && chainId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#1a1a1a', borderRadius: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#5C5C6B', fontFamily: 'JetBrains Mono, monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {txHash.slice(0, 24)}…
          </span>
          <a href={buildTxExplorerUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} color="#ffffff" />
          </a>
        </div>
      )}

      <Button
        fullWidth size="lg"
        onClick={() => { void handlePay() }}
        disabled={!isConnected || isPending}
        icon={isPending ? <Loader2 size={16} style={{ animation: 'pw-spin 0.7s linear infinite' }} /> : undefined}
      >
        {statusLabel}
      </Button>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#9898A6', marginTop: 8, fontFamily: FONT }}>
        Real USDC on Arc Testnet · Irreversible once signed
      </p>
    </div>
  )
}

// ── Order success / protected purchase confirmation ───────────────────────────

export function ProtectedPurchaseSuccess({
  onViewOrders,
  onContinueShopping,
}: {
  txHash?: string
  onViewOrders: () => void
  onContinueShopping: () => void
}) {
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <ShieldCheck size={28} color="#ffffff" />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', fontFamily: FONT, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Payment protected
      </h2>
      <p style={{ fontSize: 14, color: '#5C5C6B', lineHeight: 1.7, marginBottom: 20 }}>
        Your USDC has been placed in the PaywellEscrow smart contract.
        It will be released to the seller once you confirm delivery,
        or automatically after 3 days if no dispute is raised.
      </p>

      {/* What happens next */}
      <div style={{ background: '#1a1a1a', borderRadius: 14, padding: '14px 16px', marginBottom: 20, textAlign: 'left' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>What happens next</div>
        {[
          { step: '1', text: 'Seller ships your order' },
          { step: '2', text: 'You confirm delivery' },
          { step: '3', text: 'USDC released to seller' },
        ].map(({ step, text }) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#ffffff' }}>{step}</span>
            </div>
            <span style={{ fontSize: 13, color: '#ffffff' }}>{text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button fullWidth onClick={onViewOrders} icon={<ShoppingBag size={15} />}>View my orders</Button>
        <Button fullWidth variant="ghost" onClick={onContinueShopping}>Continue shopping</Button>
      </div>
    </div>
  )
}
