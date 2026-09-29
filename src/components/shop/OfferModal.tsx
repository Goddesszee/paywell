import React, { useState } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { ShopProduct, useShopStore } from '../../store/shopStore'
import { useAccount } from 'wagmi'
import { Button } from '../ui/Button'
import { formatUSDC } from '../../utils/format'
import { toast } from 'sonner'

const FONT = "'Inter', -apple-system, sans-serif"

interface OfferModalProps {
  product: ShopProduct
  onClose: () => void
}

export function OfferModal({ product, onClose }: OfferModalProps) {
  const { address } = useAccount()
  const { addOffer } = useShopStore()
  const [offerPrice, setOfferPrice] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isValid = !!offerPrice && parseFloat(offerPrice) > 0 && parseFloat(offerPrice) < product.price

  const handleSubmit = () => {
    if (!isValid || !address) return
    addOffer({
      productId: product.id,
      productName: product.name,
      productPrice: product.price,
      offerPrice: parseFloat(offerPrice),
      buyerAddress: address,
      sellerAddress: product.merchantWallet,
      message: message || undefined,
      status: 'pending',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    setSubmitted(true)
    toast.success('Offer sent to seller')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', width: '100%',
        background: '#ffffff', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 40px', zIndex: 1,
        animation: 'pw-up 0.22s ease both',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#1a1a1a', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={16} color="#ffffff" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: FONT }}>Make an Offer</h2>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} color="#5C5C6B" />
          </button>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <MessageSquare size={20} color="#ffffff" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: FONT, marginBottom: 6 }}>Offer sent</h3>
            <p style={{ fontSize: 13, color: '#5C5C6B' }}>
              Your offer of <strong>{formatUSDC(parseFloat(offerPrice))} USDC</strong> has been sent to the seller.
              Offers expire in 48 hours.
            </p>
            <Button fullWidth onClick={onClose} style={{ marginTop: 16 }}>Done</Button>
          </div>
        ) : (
          <>
            {/* Product summary */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '10px 12px', background: '#1a1a1a', borderRadius: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#E8E8E8' }}>
                {product.images[0] && <img src={product.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontFamily: FONT }}>{product.name}</div>
                <div style={{ fontSize: 13, color: '#9898A6' }}>Listed at <strong style={{ color: '#ffffff' }}>{formatUSDC(product.price)} USDC</strong></div>
              </div>
            </div>

            {/* Offer amount */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B', fontFamily: FONT, marginBottom: 6 }}>
                Your offer (USDC)
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0.01"
                  max={product.price - 0.01}
                  step="0.01"
                  placeholder={`Max ${formatUSDC(product.price - 0.01)}`}
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  style={{
                    width: '100%', height: 46, padding: '0 50px 0 14px',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 11, background: '#1a1a1a',
                    fontSize: 18, fontWeight: 700, color: '#ffffff',
                    fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 12, fontWeight: 700, color: '#9898A6',
                }}>
                  USDC
                </span>
              </div>
              {offerPrice && parseFloat(offerPrice) >= product.price && (
                <p style={{ fontSize: 12, color: '#DC2626', marginTop: 4, fontFamily: FONT }}>
                  Offer must be less than the listed price
                </p>
              )}
            </div>

            {/* Message */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B', fontFamily: FONT, marginBottom: 6 }}>
                Message to seller (optional)
              </div>
              <textarea
                rows={2}
                placeholder="e.g. I'm a serious buyer, can we close today?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px',
                  border: '1px solid rgba(0,0,0,0.10)',
                  borderRadius: 11, background: '#1a1a1a',
                  fontSize: 14, color: '#ffffff', fontFamily: FONT,
                  outline: 'none', resize: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {!address && (
              <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 10, fontFamily: FONT }}>
                Connect your wallet to make an offer.
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" fullWidth onClick={onClose}>Cancel</Button>
              <Button fullWidth onClick={handleSubmit} disabled={!isValid || !address}>
                Send offer
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
