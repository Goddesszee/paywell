import React, { useState } from 'react'
import {
  ArrowLeft, Star, ShieldCheck, MapPin, Package, ChevronRight,
  Heart, MessageSquare, ShoppingCart, Zap, Check,
} from 'lucide-react'
import { ShopProduct, useShopStore, ConditionLabel } from '../../store/shopStore'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { formatUSDC } from '../../utils/format'
import { toast } from 'sonner'

const FONT = "'Inter', -apple-system, sans-serif"
const CONDITION_LABEL: Record<ConditionLabel, string> = {
  new: 'New', like_new: 'Like New', excellent: 'Excellent',
  good: 'Good', fair: 'Fair', for_parts: 'For Parts',
}
const DELIVERY_LABEL: Record<string, string> = {
  standard: 'Standard delivery', express: 'Express delivery',
  digital: 'Instant download', pickup: 'Local pickup', agent_drop: 'Agent drop-off',
}

interface ProductDetailProps {
  product: ShopProduct
  onBack: () => void
  onBuyNow: () => void
  onAddToCart: () => void
  onMakeOffer: () => void
  inCart: boolean
}

export function ProductDetail({
  product, onBack, onBuyNow, onAddToCart, onMakeOffer, inCart,
}: ProductDetailProps) {
  const [imgIdx, setImgIdx] = useState(0)
  const { toggleFavorite, isFavorite, reviews } = useShopStore()
  const fav = isFavorite(product.id)
  const productReviews = reviews.filter((r) => r.productId === product.id)

  const images = product.images.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=600&fit=crop']

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 100 }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 14, fontWeight: 600, color: '#5C5C6B',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: FONT, marginBottom: 14, padding: 0,
        }}
      >
        <ArrowLeft size={16} />
        Back to Shop
      </button>

      {/* Image gallery */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          borderRadius: 16, overflow: 'hidden', background: '#F7F7F8',
          aspectRatio: '16/10', position: 'relative',
        }}>
          <img
            src={images[imgIdx]}
            alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Fav overlay */}
          <button
            onClick={() => { toggleFavorite(product.id); toast.success(fav ? 'Removed from saved' : 'Saved') }}
            style={{
              position: 'absolute', top: 12, right: 12,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.90)',
              border: '1px solid rgba(0,0,0,0.09)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Heart size={15} color={fav ? '#0D0D0D' : '#9898A6'} fill={fav ? '#0D0D0D' : 'none'} />
          </button>
        </div>
        {/* Thumbnails */}
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setImgIdx(i)}
                style={{
                  width: 60, height: 60, flexShrink: 0, borderRadius: 8, overflow: 'hidden',
                  border: `2px solid ${i === imgIdx ? '#0D0D0D' : 'rgba(0,0,0,0.08)'}`,
                  cursor: 'pointer', background: 'none', padding: 0,
                }}
              >
                <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product info */}
      <div style={{
        background: '#FFF', border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16, padding: '18px 18px', marginBottom: 12,
      }}>
        {/* Category + condition row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Badge variant="default" size="sm">{product.category}</Badge>
          <Badge variant="default" size="sm">{CONDITION_LABEL[product.condition]}</Badge>
          {product.inStock
            ? <Badge variant="default" size="sm">In stock</Badge>
            : <Badge variant="default" size="sm">Out of stock</Badge>
          }
        </div>

        <h1 style={{
          fontSize: 22, fontWeight: 800, color: '#0D0D0D',
          letterSpacing: '-0.03em', lineHeight: 1.2,
          fontFamily: FONT, marginBottom: 4,
        }}>
          {product.name}
        </h1>

        {/* Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
          {[1,2,3,4,5].map((s) => (
            <Star key={s} size={13}
              color="#0D0D0D"
              fill={s <= Math.round(product.rating) ? '#0D0D0D' : 'none'} />
          ))}
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D', marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
            {product.rating.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: '#9898A6' }}>({product.reviewCount} reviews)</span>
        </div>

        {/* Price */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 32, fontWeight: 800, color: '#0D0D0D',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', fontFamily: FONT,
            }}>
              {formatUSDC(product.price)}
            </span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#5C5C6B' }}>USDC</span>
          </div>
          {product.priceLocal && product.localCurrency && (
            <div style={{ fontSize: 13, color: '#9898A6', marginTop: 2 }}>
              ≈ {product.localCurrency} {product.priceLocal.toLocaleString()}
            </div>
          )}
        </div>

        <p style={{ fontSize: 14, color: '#0D0D0D', lineHeight: 1.7, marginBottom: 14, fontFamily: FONT }}>
          {product.description}
        </p>

        {/* Tags */}
        {product.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {product.tags.map((t) => (
              <span key={t} style={{
                padding: '3px 10px', borderRadius: 20,
                background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.07)',
                fontSize: 11, color: '#5C5C6B', fontWeight: 500,
              }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Delivery options */}
        {product.deliveryOptions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Delivery
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {product.deliveryOptions.map((d) => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={13} color="#5C5C6B" />
                  <span style={{ fontSize: 13, color: '#0D0D0D' }}>{DELIVERY_LABEL[d] ?? d}</span>
                  {product.deliveryDays && d === 'standard' && (
                    <span style={{ fontSize: 12, color: '#9898A6', marginLeft: 2 }}>· {product.deliveryDays} days est.</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        {product.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <MapPin size={13} color="#9898A6" />
            <span style={{ fontSize: 13, color: '#5C5C6B' }}>{product.location}</span>
          </div>
        )}
      </div>

      {/* Seller card */}
      <div style={{
        background: '#FFF', border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16, padding: '14px 16px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9898A6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Seller
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Avatar */}
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#0D0D0D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: FONT }}>
              {product.merchant[0]?.toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>{product.merchant}</span>
              {product.merchantVerified && <ShieldCheck size={14} color="#0D0D0D" />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Star size={11} color="#0D0D0D" fill="#0D0D0D" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0D0D0D' }}>{product.merchantRating.toFixed(1)}</span>
              </div>
              <span style={{ fontSize: 11, color: '#9898A6' }}>{product.merchantCompletedTx} sales</span>
              {product.merchantLocation && (
                <span style={{ fontSize: 11, color: '#9898A6' }}>{product.merchantLocation}</span>
              )}
            </div>
          </div>
          <ChevronRight size={14} color="#9898A6" />
        </div>
        {product.merchantResponseRate !== undefined && (
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: '#F7F7F8', borderRadius: 8,
            display: 'flex', gap: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D' }}>{product.merchantResponseRate}%</div>
              <div style={{ fontSize: 11, color: '#9898A6' }}>Response rate</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D' }}>{product.merchantCompletedTx}</div>
              <div style={{ fontSize: 11, color: '#9898A6' }}>Completed</div>
            </div>
            {product.merchantJoined && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D' }}>{product.merchantJoined}</div>
                <div style={{ fontSize: 11, color: '#9898A6' }}>Joined</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Protection note */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', marginBottom: 16,
        background: '#F7F7F8', borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.07)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: '#0D0D0D',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <ShieldCheck size={14} color="#FFF" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>Protected Purchase</div>
          <div style={{ fontSize: 12, color: '#5C5C6B', marginTop: 1 }}>
            USDC is held in the PaywellEscrow smart contract until you confirm delivery.
            Dispute resolution is available within 3 days.
          </div>
        </div>
      </div>

      {/* CTA buttons */}
      {product.inStock && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button fullWidth size="lg" onClick={onBuyNow} icon={<Zap size={16} />}>
            Buy Now · {formatUSDC(product.price)} USDC
          </Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              fullWidth variant="ghost"
              onClick={() => { onAddToCart(); toast.success(`${product.name} added to cart`) }}
              icon={inCart ? <Check size={15} /> : <ShoppingCart size={15} />}
            >
              {inCart ? 'In cart' : 'Add to cart'}
            </Button>
            <Button
              fullWidth variant="ghost"
              onClick={onMakeOffer}
              icon={<MessageSquare size={15} />}
            >
              Make offer
            </Button>
          </div>
        </div>
      )}

      {/* Reviews */}
      {productReviews.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#9898A6',
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Reviews
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {productReviews.slice(0, 5).map((r) => (
              <div key={r.id} style={{
                background: '#FFF', border: '1px solid rgba(0,0,0,0.07)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} size={11} color="#0D0D0D" fill={s <= r.rating ? '#0D0D0D' : 'none'} />
                  ))}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0D0D0D' }}>{r.reviewerName ?? 'Verified buyer'}</span>
                </div>
                <p style={{ fontSize: 13, color: '#0D0D0D', margin: 0, lineHeight: 1.6 }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
