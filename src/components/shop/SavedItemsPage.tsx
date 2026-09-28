import React from 'react'
import { ArrowLeft, Heart } from 'lucide-react'
import { useShopStore, ShopProduct } from '../../store/shopStore'
import { useAppStore } from '../../store/appStore'

import { ShopProductCard } from './ShopProductCard'
import { Button } from '../ui/Button'
import { PRODUCTS } from '../../data/products'
import { getVerifiedProducts } from '../../utils/listings'
import { mapLegacyCategory } from '../../data/shopCategories'

const FONT = "'Inter', -apple-system, sans-serif"

interface SavedItemsPageProps {
  onBack: () => void
  onProduct: (p: ShopProduct) => void
  onContinueShopping: () => void
}

export function SavedItemsPage({ onBack, onProduct, onContinueShopping }: SavedItemsPageProps) {
  const { favorites, shopProducts } = useShopStore()
  const { pendingListings } = useAppStore()

  // Build the full product universe (same logic as ShopPage)
  const verifiedListings = getVerifiedProducts(pendingListings)
  const allProducts: ShopProduct[] = [
    ...PRODUCTS.map(legacyToShopProduct),
    ...verifiedListings.map(legacyToShopProduct),
    ...shopProducts,
  ]

  const saved = allProducts.filter((p) => favorites.includes(p.id))

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 9, background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={16} color="#0D0D0D" />
        </button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em' }}>Saved Items</h1>
      </div>

      {saved.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#F7F7F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Heart size={22} color="#9898A6" />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0D0D0D', fontFamily: FONT, marginBottom: 6 }}>No saved items yet</h3>
          <p style={{ fontSize: 13, color: '#9898A6', marginBottom: 20 }}>Tap the heart icon on any product to save it.</p>
          <Button onClick={onContinueShopping}>Explore Shop</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {saved.map((p) => (
            <ShopProductCard key={p.id} product={p} onClick={() => onProduct(p)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Convert legacy Product type (from products.ts) to ShopProduct */
export function legacyToShopProduct(p: { id: string; name: string; description: string; price: number; merchant: string; merchantId: string; merchantWallet: string; category: string; rating: number; reviewCount: number; imageUrl: string; inStock: boolean; tags: string[] }): ShopProduct {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    merchant: p.merchant,
    merchantId: p.merchantId,
    merchantWallet: p.merchantWallet,
    merchantVerified: true,
    merchantRating: p.rating,
    merchantCompletedTx: p.reviewCount,
    merchantResponseRate: 95,
    merchantLocation: 'Global',
    merchantJoined: '2024',
    category: mapLegacyCategory(p.category),
    condition: 'new' as const,
    images: [p.imageUrl],
    rating: p.rating,
    reviewCount: p.reviewCount,
    inStock: p.inStock,
    quantity: 10,
    tags: p.tags,
    location: 'Global',
    deliveryOptions: ['standard', 'express', 'digital'],
    deliveryDays: 5,
    isVerifiedListing: true,
    listedAt: '2024-01-01T00:00:00.000Z',
    agentSearchable: true,
    agentKeywords: p.tags,
  }
}
