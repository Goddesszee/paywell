/**
 * ShopPage — Paywell marketplace composition root.
 * Orchestrates all shop sub-views.
 * Architecture is AI-agent ready: same Product/Order entities used by both humans and agents.
 */
import React, { useState, useMemo, useCallback } from 'react'
import { ShoppingBag } from 'lucide-react'
import { useAccount } from 'wagmi'

// Store
import { useAppStore } from '../../store/appStore'
import { useShopStore, ShopProduct } from '../../store/shopStore'

// Data
import { mapLegacyCategory } from '../../data/shopCategories'

// Components
import { ShopHeader } from '../shop/ShopHeader'
import { CategoryNavigation } from '../shop/CategoryNavigation'
import { FilterPanel } from '../shop/FilterPanel'
import { ShopProductCard } from '../shop/ShopProductCard'
import { ProductDetail } from '../shop/ProductDetail'
import { OfferModal } from '../shop/OfferModal'
import { CartPage, CheckoutPage, ProtectedPurchaseSuccess } from '../shop/ShopCart'
import { OrdersPage } from '../shop/OrdersPage'
import { SellerDashboard } from '../shop/SellerDashboard'
import { SellForm } from '../shop/SellForm'
import { SavedItemsPage } from '../shop/SavedItemsPage'
import { AgentPicksSection } from '../shop/AgentRecommendation'
import { Button } from '../ui/Button'

type ShopView =
  | 'catalog'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'success'
  | 'orders'
  | 'seller'
  | 'sell'
  | 'saved'

const FONT = "'Inter', -apple-system, sans-serif"

export function ShopPage() {
  // ── Sub-view state ─────────────────────────────────────────────────────────
  const [view, setView] = useState<ShopView>('catalog')
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null)
  const [showOffer, setShowOffer] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')
  const [lastTxHash, setLastTxHash] = useState<string | undefined>()

  // ── Stores ─────────────────────────────────────────────────────────────────
  const { cart, addToCart, removeFromCart, clearCart, addActivity } = useAppStore()
  const { filter, setFilter, favorites, orders, shopProducts } = useShopStore()
  useAccount()

  // ── Product universe ───────────────────────────────────────────────────────
  // Only admin-approved products appear in the marketplace.
  // shopProducts are written by AdminDashboard.approveListing → addShopProduct.
  const allProducts: ShopProduct[] = useMemo(() => shopProducts, [shopProducts])

  // ── Filtered & sorted catalog ──────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let list = allProducts.filter((p) => {
      if (filter.category !== 'all') {
        const mapped = mapLegacyCategory(p.category)
        if (mapped !== filter.category && p.category !== filter.category) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const match =
          p.name.toLowerCase().includes(q) ||
          p.merchant.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        if (!match) return false
      }
      if (filter.priceMin !== undefined && p.price < filter.priceMin) return false
      if (filter.priceMax !== undefined && p.price > filter.priceMax) return false
      if (filter.condition && p.condition !== filter.condition) return false
      if (filter.verifiedOnly && !p.merchantVerified) return false
      if (filter.minRating && p.rating < filter.minRating) return false
      if (filter.deliveryMethod && !p.deliveryOptions.includes(filter.deliveryMethod)) return false
      return true
    })

    switch (filter.sortBy) {
      case 'newest':
        list = [...list].sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime())
        break
      case 'price_asc':
        list = [...list].sort((a, b) => a.price - b.price)
        break
      case 'price_desc':
        list = [...list].sort((a, b) => b.price - a.price)
        break
      case 'rating':
        list = [...list].sort((a, b) => b.rating - a.rating)
        break
      default:
        break
    }
    return list
  }, [allProducts, filter, search])

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const cartCount = cart.reduce((acc, c) => acc + c.quantity, 0)
  const cartTotal = cart.reduce((acc, c) => acc + c.product.price * c.quantity, 0)

  const pendingOrdersCount = orders.filter((o) =>
    ['payment_protected', 'confirmed', 'shipped', 'delivered'].includes(o.status)
  ).length

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goProduct = useCallback((p: ShopProduct) => {
    setSelectedProduct(p)
    setView('product')
    window.scrollTo({ top: 0 })
  }, [])

  const goCatalog = useCallback(() => {
    setView('catalog')
    setSelectedProduct(null)
  }, [])

  const handlePurchaseComplete = useCallback((txHash?: string) => {
    cart.forEach((item) => {
      addActivity({
        type: 'purchase',
        description: item.product.name,
        amount: item.product.price * item.quantity,
        sign: '-',
        status: 'confirmed',
        counterparty: item.product.merchant,
        productId: item.product.id,
        txHash,
      })
    })
    clearCart()
    setLastTxHash(txHash)
    setView('success')
  }, [cart, addActivity, clearCart])

  // ── Section data ───────────────────────────────────────────────────────────
  const featured = useMemo(() => allProducts.filter((p) => p.inStock).slice(0, 4), [allProducts])
  const popular = useMemo(() => [...allProducts].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 8), [allProducts])
  const recentlyListed = useMemo(() => [...allProducts].sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime()).slice(0, 8), [allProducts])
  const agentPicks = useMemo(() => allProducts.filter((p) => p.agentSearchable).slice(0, 6), [allProducts])
  const isEmpty = allProducts.length === 0

  const isSearching = search.trim().length > 0 || filter.category !== 'all'

  // ── Views ──────────────────────────────────────────────────────────────────

  if (view === 'product' && selectedProduct) {
    return (
      <>
        <ProductDetail
          product={selectedProduct}
          onBack={goCatalog}
          onBuyNow={() => {
            addToCart({
              id: selectedProduct.id,
              name: selectedProduct.name,
              description: selectedProduct.description,
              price: selectedProduct.price,
              merchant: selectedProduct.merchant,
              merchantId: selectedProduct.merchantId,
              merchantWallet: selectedProduct.merchantWallet,
              category: selectedProduct.category as 'tech' | 'home' | 'fashion' | 'digital',
              rating: selectedProduct.rating,
              reviewCount: selectedProduct.reviewCount,
              imageUrl: selectedProduct.images[0] ?? '',
              inStock: selectedProduct.inStock,
              tags: selectedProduct.tags,
            })
            setView('cart')
          }}
          onAddToCart={() => {
            addToCart({
              id: selectedProduct.id,
              name: selectedProduct.name,
              description: selectedProduct.description,
              price: selectedProduct.price,
              merchant: selectedProduct.merchant,
              merchantId: selectedProduct.merchantId,
              merchantWallet: selectedProduct.merchantWallet,
              category: selectedProduct.category as 'tech' | 'home' | 'fashion' | 'digital',
              rating: selectedProduct.rating,
              reviewCount: selectedProduct.reviewCount,
              imageUrl: selectedProduct.images[0] ?? '',
              inStock: selectedProduct.inStock,
              tags: selectedProduct.tags,
            })
          }}
          onMakeOffer={() => setShowOffer(true)}
          inCart={cart.some((c) => c.product.id === selectedProduct.id)}
        />
        {showOffer && (
          <OfferModal product={selectedProduct} onClose={() => setShowOffer(false)} />
        )}
      </>
    )
  }

  if (view === 'cart') {
    return (
      <CartPage
        cart={cart}
        total={cartTotal}
        onBack={goCatalog}
        onRemove={removeFromCart}
        onCheckout={() => setView('checkout')}
        onContinueShopping={goCatalog}
      />
    )
  }

  if (view === 'checkout') {
    return (
      <CheckoutPage
        cart={cart}
        total={cartTotal}
        onBack={() => setView('cart')}
        onComplete={handlePurchaseComplete}
      />
    )
  }

  if (view === 'success') {
    return (
      <ProtectedPurchaseSuccess
        txHash={lastTxHash}
        onViewOrders={() => setView('orders')}
        onContinueShopping={goCatalog}
      />
    )
  }

  if (view === 'orders') {
    return (
      <OrdersPage
        onBack={goCatalog}
        onContinueShopping={goCatalog}
      />
    )
  }

  if (view === 'seller') {
    return (
      <SellerDashboard
        onBack={goCatalog}
        onListItem={() => setView('sell')}
      />
    )
  }

  if (view === 'sell') {
    return <SellForm onBack={() => setView('seller')} />
  }

  if (view === 'saved') {
    return (
      <SavedItemsPage
        onBack={goCatalog}
        onProduct={goProduct}
        onContinueShopping={goCatalog}
      />
    )
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
      {/* Header */}
      <ShopHeader
        search={search}
        onSearchChange={setSearch}
        onOpenCart={() => setView('cart')}
        onOpenOrders={() => setView('orders')}
        onOpenSell={() => setView('sell')}
        onOpenSaved={() => setView('saved')}
        onOpenFilters={() => setShowFilters(true)}
        cartCount={cartCount}
        ordersCount={pendingOrdersCount}
        savedCount={favorites.length}
      />

      {/* Categories */}
      <div style={{ marginBottom: 16 }}>
        <CategoryNavigation
          active={filter.category}
          onChange={(id) => setFilter({ category: id })}
        />
      </div>

      {/* Search / filtered results */}
      {isSearching ? (
        <SearchResults
          products={filteredProducts}
          onProduct={goProduct}
          cartProductIds={cart.map((c) => c.product.id)}
          query={search}
        />
      ) : isEmpty ? (
        /* Empty marketplace — no approved listings yet */
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, background: '#F7F7F8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <ShoppingBag size={26} color="#9898A6" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D0D0D', fontFamily: FONT, letterSpacing: '-0.02em', marginBottom: 8 }}>
            No listings yet
          </h2>
          <p style={{ fontSize: 14, color: '#5C5C6B', lineHeight: 1.7, marginBottom: 24, maxWidth: 300, margin: '0 auto 24px' }}>
            Be the first to list a product. All listings are reviewed before going live.
          </p>
          <Button onClick={() => setView('sell')}>Sell an Item</Button>
        </div>
      ) : (
        /* Full catalog sections */
        <div>
          {/* Featured */}
          {featured.length > 0 && (
            <Section title="Featured Products" onSeeAll={() => {}}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {featured.map((p) => (
                  <ShopProductCard key={p.id} product={p} onClick={() => goProduct(p)} inCart={cart.some((c) => c.product.id === p.id)} />
                ))}
              </div>
            </Section>
          )}

          {/* Agent picks */}
          <AgentPicksSection products={agentPicks} onProductClick={goProduct} />

          {/* Popular */}
          {popular.length > 0 && (
            <Section title="Popular Products" onSeeAll={() => {}}>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                {popular.map((p) => (
                  <div key={p.id} style={{ flexShrink: 0, width: 200 }}>
                    <ShopProductCard product={p} onClick={() => goProduct(p)} size="sm" />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recently listed */}
          {recentlyListed.length > 0 && (
            <Section title="Recently Listed" onSeeAll={() => {}}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {recentlyListed.slice(0, 6).map((p) => (
                  <ShopProductCard key={p.id} product={p} onClick={() => goProduct(p)} />
                ))}
              </div>
            </Section>
          )}

          {/* Sell CTA */}
          <div style={{
            padding: '16px 18px',
            background: '#0D0D0D',
            borderRadius: 14, marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FFF', fontFamily: FONT }}>Sell on Paywell</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                List a product and accept USDC
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('sell')}
              style={{ background: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.20)', color: '#FFF' }}
            >
              + List item
            </Button>
          </div>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && <FilterPanel onClose={() => setShowFilters(false)} />}
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  title, children,
}: {
  title: string
  onSeeAll?: () => void
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D', fontFamily: "'Inter', sans-serif" }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

// ── Search results ─────────────────────────────────────────────────────────

function SearchResults({
  products, onProduct, cartProductIds, query,
}: {
  products: ShopProduct[]
  onProduct: (p: ShopProduct) => void
  cartProductIds: string[]
  query: string
}) {
  if (products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: '#F7F7F8',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
        }}>
          <ShoppingBag size={22} color="#9898A6" />
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0D0D0D', fontFamily: "'Inter', sans-serif", marginBottom: 6 }}>
          No products found
        </h3>
        <p style={{ fontSize: 13, color: '#9898A6' }}>
          {query ? `No results for "${query}". Try a different search.` : 'Try a different category or filter.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#9898A6', fontFamily: "'Inter', sans-serif", marginBottom: 12 }}>
        {products.length} {products.length === 1 ? 'product' : 'products'} found
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {products.map((p) => (
          <ShopProductCard
            key={p.id}
            product={p}
            onClick={() => onProduct(p)}
            inCart={cartProductIds.includes(p.id)}
          />
        ))}
      </div>
    </div>
  )
}
