/**
 * AgentRecommendation — renders AI agent product picks.
 * Architecture is ready for live AI integration. Currently shows curated
 * picks from the product catalog. Does NOT claim AI functionality that
 * is not yet connected.
 */
import React from 'react'
import { Zap, ChevronRight } from 'lucide-react'
import { ShopProduct } from '../../store/shopStore'
import { ShopProductCard } from './ShopProductCard'
import { formatUSDC } from '../../utils/format'

interface AgentRecommendationProps {
  products: ShopProduct[]
  onProductClick: (p: ShopProduct) => void
  query?: string
}

const FONT = "'Inter', -apple-system, sans-serif"

export function AgentPicksSection({ products, onProductClick }: AgentRecommendationProps) {
  if (products.length === 0) return null

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: '#0D0D0D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={13} color="#FFF" fill="#FFF" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT }}>Agent Picks</div>
            <div style={{ fontSize: 11, color: '#9898A6', fontFamily: FONT }}>
              Curated · AI integration coming soon
            </div>
          </div>
        </div>
      </div>

      {/* Products horizontal scroll */}
      <div style={{
        display: 'flex', gap: 12,
        overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {products.slice(0, 6).map((p) => (
          <div key={p.id} style={{ flexShrink: 0, width: 180 }}>
            <ShopProductCard product={p} onClick={() => onProductClick(p)} size="sm" />
          </div>
        ))}
      </div>

      {/* Readiness note */}
      <div style={{
        marginTop: 10, padding: '10px 13px',
        background: '#F7F7F8', borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.07)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Zap size={13} color="#0D0D0D" />
        <p style={{ margin: 0, fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
          <strong style={{ color: '#0D0D0D' }}>Agent commerce ready.</strong>{' '}
          Connect a Paywell AI agent to search, compare and purchase on your behalf.
        </p>
        <ChevronRight size={13} color="#9898A6" style={{ flexShrink: 0 }} />
      </div>
    </section>
  )
}

/** Compact agent recommendation card shown inside agent chat / order flow */
export function AgentProductCard({
  product,
  reasoning,
  onApprove,
  onView,
}: {
  product: ShopProduct
  reasoning?: string
  onApprove?: () => void
  onView?: () => void
}) {
  return (
    <div style={{
      border: '1px solid rgba(0,0,0,0.10)',
      borderRadius: 14, overflow: 'hidden',
      background: '#FFF', fontFamily: FONT,
    }}>
      <div style={{ display: 'flex', gap: 12, padding: '12px 12px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 10,
          overflow: 'hidden', flexShrink: 0, background: '#F7F7F8',
        }}>
          <img src={product.images[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D', marginBottom: 2 }}>
            {product.name}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0D0D0D', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {formatUSDC(product.price)} <span style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B' }}>USDC</span>
          </div>
          <div style={{ fontSize: 12, color: '#5C5C6B', marginTop: 2 }}>
            {product.merchantVerified ? 'Verified Seller · ' : ''}{product.location}
          </div>
        </div>
      </div>
      {reasoning && (
        <div style={{ padding: '0 12px 10px', fontSize: 12, color: '#5C5C6B', fontStyle: 'italic' }}>
          "{reasoning}"
        </div>
      )}
      {(onApprove || onView) && (
        <div style={{
          borderTop: '1px solid rgba(0,0,0,0.07)',
          padding: '10px 12px',
          display: 'flex', gap: 8,
        }}>
          {onView && (
            <button
              onClick={onView}
              style={{
                flex: 1, height: 34, borderRadius: 8,
                background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.09)',
                fontSize: 12, fontWeight: 600, color: '#0D0D0D',
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              View
            </button>
          )}
          {onApprove && (
            <button
              onClick={onApprove}
              style={{
                flex: 1, height: 34, borderRadius: 8,
                background: '#0D0D0D', border: 'none',
                fontSize: 12, fontWeight: 700, color: '#FFF',
                cursor: 'pointer', fontFamily: FONT,
              }}
            >
              Approve purchase
            </button>
          )}
        </div>
      )}
    </div>
  )
}
