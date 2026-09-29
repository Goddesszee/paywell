import React from 'react'
import { Heart, Star, MapPin, ShieldCheck } from 'lucide-react'
import { ShopProduct, ConditionLabel } from '../../store/shopStore'
import { useShopStore } from '../../store/shopStore'
import { formatUSDC } from '../../utils/format'

const CONDITION_LABEL: Record<ConditionLabel, string> = {
  new:       'New',
  like_new:  'Like New',
  excellent: 'Excellent',
  good:      'Good',
  fair:      'Fair',
  for_parts: 'For Parts',
}

interface ShopProductCardProps {
  product: ShopProduct
  onClick: () => void
  onAddToCart?: (e: React.MouseEvent) => void
  inCart?: boolean
  size?: 'sm' | 'md'
}

export function ShopProductCard({ product, onClick, size = 'md' }: ShopProductCardProps) {
  const { toggleFavorite, isFavorite } = useShopStore()
  const fav = isFavorite(product.id)
  const primaryImage = product.images[0] ?? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop&auto=format'

  return (
    <div
      onClick={onClick}
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: size === 'sm' ? 12 : 14,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.18s, transform 0.18s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Image */}
      <div style={{
        aspectRatio: '4/3',
        overflow: 'hidden',
        background: '#1a1a1a',
        position: 'relative',
      }}>
        <img
          src={primaryImage}
          alt={product.name}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {!product.inStock && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255,255,255,0.80)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#5C5C6B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Out of stock
            </span>
          </div>
        )}
        {/* Favorite button */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id) }}
          aria-label={fav ? 'Remove from saved' : 'Save product'}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.90)',
            border: '1px solid rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <Heart size={13} color={fav ? '#ffffff' : '#9898A6'} fill={fav ? '#ffffff' : 'none'} />
        </button>
        {/* Condition pill */}
        <div style={{
          position: 'absolute', bottom: 7, left: 7,
          background: 'rgba(13,13,13,0.78)',
          borderRadius: 20, padding: '2px 8px',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#ffffff', letterSpacing: '0.03em' }}>
            {CONDITION_LABEL[product.condition]}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: size === 'sm' ? '10px 10px' : '12px 12px' }}>
        <div style={{ fontSize: 11, color: '#9898A6', fontWeight: 500, marginBottom: 3 }}>
          {product.merchant}
        </div>
        <h3 style={{
          fontSize: size === 'sm' ? 13 : 14, fontWeight: 700, color: '#ffffff',
          lineHeight: 1.3, marginBottom: 6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}>
          {product.name}
        </h3>

        {/* Rating row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Star size={10} color="#ffffff" fill="#ffffff" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
            {product.rating.toFixed(1)}
          </span>
          <span style={{ fontSize: 11, color: '#9898A6' }}>({product.reviewCount})</span>
          {product.merchantVerified && (
            <ShieldCheck size={11} color="#ffffff" style={{ marginLeft: 2 }} />
          )}
        </div>

        {/* Location */}
        {product.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 6 }}>
            <MapPin size={10} color="#9898A6" />
            <span style={{ fontSize: 11, color: '#9898A6' }}>{product.location}</span>
          </div>
        )}

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
          <div>
            <span style={{
              fontSize: size === 'sm' ? 15 : 16,
              fontWeight: 800, color: '#ffffff',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '-0.02em',
            }}>
              {formatUSDC(product.price)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#5C5C6B', marginLeft: 3 }}>USDC</span>
            {product.priceLocal && product.localCurrency && (
              <div style={{ fontSize: 10, color: '#9898A6', marginTop: 1 }}>
                ≈ {product.localCurrency} {product.priceLocal.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton loader — grayscale, no color */
export function ShopProductCardSkeleton() {
  return (
    <div style={{
      background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{ aspectRatio: '4/3', background: '#F0F0F0', animation: 'pw-pulse 1.4s ease infinite' }} />
      <div style={{ padding: '12px 12px' }}>
        <div style={{ height: 10, width: '50%', background: '#1a1a1a', borderRadius: 4, marginBottom: 8, animation: 'pw-pulse 1.4s ease infinite' }} />
        <div style={{ height: 14, width: '80%', background: '#1a1a1a', borderRadius: 4, marginBottom: 8, animation: 'pw-pulse 1.4s ease infinite' }} />
        <div style={{ height: 12, width: '40%', background: '#1a1a1a', borderRadius: 4, marginBottom: 8, animation: 'pw-pulse 1.4s ease infinite' }} />
        <div style={{ height: 18, width: '55%', background: '#1a1a1a', borderRadius: 4, animation: 'pw-pulse 1.4s ease infinite' }} />
      </div>
    </div>
  )
}
