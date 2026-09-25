import React, { useState, useMemo, useEffect } from 'react'
import { Search, Star, ShoppingCart, ArrowLeft, Check, X, SlidersHorizontal, ShoppingBag, ExternalLink, Loader2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Input } from '../ui/Input'
import { useAppStore, CartItem } from '../../store/appStore'
import { PRODUCTS, CATEGORIES, Product } from '../../data/products'
import { formatUSDC } from '../../utils/format'
import { useShopCheckout } from '../../hooks/useShopCheckout'
import { buildTxExplorerUrl } from '../../onchain-facts'

type ShopSubView = 'catalog' | 'product' | 'cart' | 'checkout' | 'success' | 'list'

export function ShopPage() {
  const [subView, setSubView] = useState<ShopSubView>('catalog')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')

  const { cart, addToCart, removeFromCart, clearCart, addActivity } = useAppStore()
  const { isConnected } = useAccount()

  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchCat = activeCategory === 'all' || p.category === activeCategory
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.merchant.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [activeCategory, search])

  const cartCount = cart.reduce((acc, c) => acc + c.quantity, 0)
  const cartTotal = cart.reduce((acc, c) => acc + c.product.price * c.quantity, 0)

  const handlePurchaseComplete = () => {
    cart.forEach((item) => {
      addActivity({
        type: 'purchase',
        description: item.product.name,
        amount: item.product.price * item.quantity,
        sign: '-',
        status: 'confirmed',
        counterparty: item.product.merchant,
        productId: item.product.id,
      })
    })
    clearCart()
    setSubView('success')
    toast.success('Purchase complete!')
  }

  if (subView === 'product' && selectedProduct) {
    return (
      <ProductDetailPage
        product={selectedProduct}
        onBack={() => setSubView('catalog')}
        onAddToCart={() => { addToCart(selectedProduct); toast.success(`${selectedProduct.name} added to cart`) }}
        onBuyNow={() => { addToCart(selectedProduct); setSubView('cart') }}
        inCart={cart.some((c) => c.product.id === selectedProduct.id)}
      />
    )
  }

  if (subView === 'cart') {
    return (
      <CartPage
        cart={cart}
        total={cartTotal}
        onBack={() => setSubView('catalog')}
        onRemove={removeFromCart}
        onCheckout={() => setSubView('checkout')}
      />
    )
  }

  if (subView === 'checkout') {
    return (
      <CheckoutPage
        cart={cart}
        total={cartTotal}
        isConnected={isConnected}
        onBack={() => setSubView('cart')}
        onComplete={handlePurchaseComplete}
      />
    )
  }

  if (subView === 'list') {
    return <ListProductForm onBack={() => setSubView('catalog')} />
  }

  if (subView === 'success') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-[#166534]" />
        </div>
        <h2 className="text-2xl font-bold text-[#0D0D0D] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>
          Order confirmed
        </h2>
        <p className="text-[#5C5C6B] text-sm mb-8">Your USDC payment was processed successfully.</p>
        <Button onClick={() => setSubView('catalog')} fullWidth>Continue shopping</Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: "'Inter', sans-serif" }}>
            Shop with Paywell
          </h1>
          <p className="text-sm text-[#5C5C6B] mt-0.5">Discover products you can pay for with USDC.</p>
        </div>
        {cartCount > 0 && (
          <button
            onClick={() => setSubView('cart')}
            className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-[#0D0D0D] text-white hover:bg-[#333] transition-colors"
          >
            <ShoppingCart size={18} />
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0D0D0D] text-white text-xs font-bold flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        )}
      </div>

      {/* Merchant CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', marginBottom: 16,
        background: '#F7F7F8', borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.07)',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0D0D0D' }}>Sell on Paywell</div>
          <div style={{ fontSize: 12, color: '#5C5C6B', marginTop: 2 }}>List a product and accept USDC</div>
        </div>
        <button
          onClick={() => setSubView('list')}
          style={{
            height: 34, padding: '0 14px', borderRadius: 8,
            background: '#0D0D0D', color: '#FFF',
            fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          + List item
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search size={16} />}
          />
        </div>
        <button className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#F7F7F8] hover:bg-[#EFEFEF] text-[#0D0D0D] border border-[rgba(18,45,69,0.1)] transition-colors">
          <SlidersHorizontal size={17} />
        </button>
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex-shrink-0 h-8 px-4 rounded-full text-sm font-semibold transition-all ${
              activeCategory === cat.id
                ? 'bg-[#0D0D0D] text-white'
                : 'bg-[#F7F7F8] text-[#0D0D0D] hover:bg-[#EFEFEF]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Product grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag size={36} className="text-[#9898A6] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#0D0D0D] mb-1">No products found</h3>
          <p className="text-sm text-[#5C5C6B]">Try a different search or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              inCart={cart.some((c) => c.product.id === product.id)}
              onClick={() => { setSelectedProduct(product); setSubView('product') }}
              onAddToCart={(e) => {
                e.stopPropagation()
                addToCart(product)
                toast.success(`${product.name} added to cart`)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductCard({
  product,
  inCart,
  onClick,
  onAddToCart,
}: {
  product: Product
  inCart: boolean
  onClick: () => void
  onAddToCart: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-[rgba(18,45,69,0.08)] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      <div className="aspect-[4/3] overflow-hidden bg-[#F7F7F8] relative">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Badge variant="default" size="sm">Out of stock</Badge>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs text-[#5C5C6B] font-medium mb-1">{product.merchant}</div>
        <h3 className="text-sm font-bold text-[#0D0D0D] leading-snug mb-1.5 line-clamp-2">{product.name}</h3>
        <div className="flex items-center gap-1 mb-2">
          <Star size={11} className="text-[#f59e0b] fill-[#f59e0b]" />
          <span className="text-xs font-semibold text-[#0D0D0D] tabular-nums">{product.rating}</span>
          <span className="text-xs text-[#9898A6]">({product.reviewCount})</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-[#0D0D0D] tabular-nums">{product.price} <span className="text-xs font-semibold text-[#5C5C6B]">USDC</span></span>
          {product.inStock && (
            <button
              onClick={onAddToCart}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                inCart
                  ? 'bg-[#dcfce7] text-[#166534]'
                  : 'bg-[#F7F7F8] text-[#0D0D0D] hover:bg-[#0D0D0D] hover:text-white'
              }`}
            >
              {inCart ? <Check size={14} /> : <ShoppingCart size={14} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductDetailPage({
  product,
  onBack,
  onAddToCart,
  onBuyNow,
  inCart,
}: {
  product: Product
  onBack: () => void
  onAddToCart: () => void
  onBuyNow: () => void
  inCart: boolean
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-28 lg:pb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-semibold text-[#5C5C6B] hover:text-[#0D0D0D] mb-4 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Shop
      </button>

      <div className="bg-white rounded-2xl border border-[rgba(18,45,69,0.08)] shadow-sm overflow-hidden mb-4">
        <div className="aspect-[16/9] overflow-hidden bg-[#F7F7F8]">
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="default" size="sm">{product.category}</Badge>
            <div className="flex items-center gap-1">
              <Star size={13} className="text-[#f59e0b] fill-[#f59e0b]" />
              <span className="text-sm font-bold text-[#0D0D0D] tabular-nums">{product.rating}</span>
              <span className="text-xs text-[#9898A6]">({product.reviewCount} reviews)</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[#0D0D0D] mb-1" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.03em' }}>
            {product.name}
          </h1>
          <p className="text-sm text-[#5C5C6B] font-medium mb-3">by {product.merchant}</p>
          <p className="text-sm text-[#0D0D0D] leading-relaxed mb-4">{product.description}</p>

          <div className="flex flex-wrap gap-2 mb-5">
            {product.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 bg-[#F7F7F8] rounded-full text-xs font-medium text-[#0D0D0D]">
                #{tag}
              </span>
            ))}
          </div>

          {/* Reviews section */}
          <div className="pt-4 border-t border-[rgba(0,0,0,0.06)] mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#0D0D0D] uppercase tracking-wider">Reviews</span>
              <div className="flex items-center gap-1">
                <Star size={13} className="text-[#f59e0b] fill-[#f59e0b]" />
                <span className="text-sm font-bold text-[#0D0D0D]">{product.rating}</span>
                <span className="text-xs text-[#9898A6]">({product.reviewCount})</span>
              </div>
            </div>
            {/* Rating bars */}
            {[5,4,3,2,1].map(star => (
              <div key={star} className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[#5C5C6B] w-3">{star}</span>
                <Star size={10} className="text-[#f59e0b] fill-[#f59e0b]" />
                <div className="flex-1 h-1.5 rounded-full bg-[#F7F7F8] overflow-hidden">
                  <div className="h-full rounded-full bg-[#0D0D0D]" style={{ width: star === 5 ? '70%' : star === 4 ? '20%' : star === 3 ? '7%' : '2%' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[rgba(0,0,0,0.06)] mb-4">
            <div>
              <div className="text-xs text-[#5C5C6B] font-medium">Price</div>
              <div className="text-2xl font-bold text-[#0D0D0D] tabular-nums" style={{ fontFamily: "'Inter', sans-serif" }}>
                {product.price} <span className="text-base font-semibold text-[#5C5C6B]">USDC</span>
              </div>
            </div>
            {!product.inStock ? (
              <Badge variant="default">Out of stock</Badge>
            ) : (
              <Badge variant="success">In stock</Badge>
            )}
          </div>

          {product.inStock && (
            <div className="flex gap-2">
              <Button
                fullWidth
                variant="secondary"
                onClick={onAddToCart}
                icon={inCart ? <Check size={16} /> : <ShoppingCart size={16} />}
              >
                {inCart ? 'In cart' : 'Add to cart'}
              </Button>
              <Button fullWidth onClick={onBuyNow} icon={<ShoppingBag size={16} />}>
                Buy now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CartPage({
  cart,
  total,
  onBack,
  onRemove,
  onCheckout,
}: {
  cart: CartItem[]
  total: number
  onBack: () => void
  onRemove: (id: string) => void
  onCheckout: () => void
}) {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F7F7F8] text-[#0D0D0D]">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: "'Inter', sans-serif" }}>
          Cart ({cart.length})
        </h1>
      </div>

      {cart.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart size={36} className="text-[#9898A6] mx-auto mb-3" />
          <p className="text-sm text-[#5C5C6B]">Your cart is empty</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-5">
            {cart.map((item: CartItem) => (
              <Card key={item.product.id} padding="md">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#F7F7F8] flex-shrink-0">
                    <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#0D0D0D] truncate">{item.product.name}</h3>
                    <p className="text-xs text-[#5C5C6B]">{item.product.merchant}</p>
                    <p className="text-sm font-bold text-[#0D0D0D] tabular-nums mt-1">
                      {formatUSDC(item.product.price * item.quantity)} USDC
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(item.product.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#9898A6] hover:text-[#ba2b4c] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </Card>
            ))}
          </div>

          <Card padding="md" className="mb-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-[#5C5C6B]">
                <span>Subtotal</span>
                <span className="font-semibold text-[#0D0D0D] tabular-nums">{formatUSDC(total)} USDC</span>
              </div>
              <div className="flex justify-between text-sm text-[#5C5C6B]">
                <span>Network fee</span>
                <span className="font-semibold text-[#166534]">Free</span>
              </div>
              <div className="pt-2 border-t border-[rgba(18,45,69,0.06)] flex justify-between font-bold text-[#0D0D0D]">
                <span>Total</span>
                <span className="tabular-nums">{formatUSDC(total)} USDC</span>
              </div>
            </div>
          </Card>

          <Button fullWidth size="lg" onClick={onCheckout} icon={<ShoppingBag size={18} />}>
            Checkout · {formatUSDC(total)} USDC
          </Button>
        </>
      )}
    </div>
  )
}

function CheckoutPage({
  cart,
  total,
  isConnected,
  onBack,
  onComplete,
}: {
  cart: CartItem[]
  total: number
  isConnected: boolean
  onBack: () => void
  onComplete: () => void
}) {
  const { checkout, status, txHash, error } = useShopCheckout()
  const { chainId } = useAccount()

  useEffect(() => {
    if (status === 'confirmed') {
      const t = setTimeout(onComplete, 1200)
      return () => clearTimeout(t)
    }
  }, [status, onComplete])

  const handleConfirm = async () => {
    if (!isConnected) return
    await checkout(cart)
  }

  const isPending   = status === 'approving' || status === 'creating-order' || status === 'pending'
  const isConfirmed = status === 'confirmed'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-28 lg:pb-8">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F7F7F8] text-[#0D0D0D]">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-[#0D0D0D]" style={{ fontFamily: "'Inter', sans-serif" }}>
          Checkout
        </h1>
      </div>

      {!isConnected && (
        <div className="flex items-center gap-2 bg-[#fef9c3] border border-[#fde68a] rounded-xl px-3 py-2.5 mb-4">
          <span className="text-sm text-[#854d0e] font-medium">Connect your wallet to complete purchase.</span>
        </div>
      )}

      <Card padding="md" className="mb-4">
        <p className="text-xs font-bold text-[#5C5C6B] uppercase tracking-wider mb-3">Order summary</p>
        <div className="space-y-2 mb-3">
          {cart.map((item: CartItem) => (
            <div key={item.product.id} className="flex justify-between text-sm">
              <span className="text-[#5C5C6B] truncate pr-2">{item.product.name} ×{item.quantity}</span>
              <span className="font-semibold text-[#0D0D0D] tabular-nums flex-shrink-0">
                {formatUSDC(item.product.price * item.quantity)} USDC
              </span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-[rgba(0,0,0,0.06)] flex justify-between font-bold text-[#0D0D0D]">
          <span>Total</span>
          <span className="tabular-nums">{formatUSDC(total)} USDC</span>
        </div>
      </Card>

      <Card padding="md" className="mb-4">
        <p className="text-xs font-bold text-[#5C5C6B] uppercase tracking-wider mb-2">Merchant wallet</p>
        <p className="text-xs font-mono text-[#5C5C6B] break-all">{cart[0]?.product.merchantWallet}</p>
        <p className="text-xs text-[#9898A6] mt-1">USDC transfers directly to this address onchain.</p>
      </Card>

      <Card padding="md" className="mb-5">
        <p className="text-xs font-bold text-[#5C5C6B] uppercase tracking-wider mb-2">Payment method</p>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#F7F7F8] flex items-center justify-center border border-[rgba(0,0,0,0.08)]">
            <ShoppingBag size={15} className="text-[#0D0D0D]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0D0D0D]">USDC Wallet</p>
            <p className="text-xs text-[#5C5C6B]">Arc Testnet · Direct onchain transfer</p>
          </div>
          <span className="ml-auto"><Badge variant="success" size="sm">Ready</Badge></span>
        </div>
      </Card>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-[#FEE2E2] border border-[#FECACA] rounded-xl px-3 py-2.5">
          <span className="text-sm text-[#7F1D1D]">{error}</span>
        </div>
      )}

      {txHash && chainId && (
        <div className="mb-4 flex items-center gap-2 bg-[#F7F7F8] border border-[rgba(0,0,0,0.08)] rounded-xl px-3 py-2.5">
          <span className="text-xs text-[#5C5C6B] font-mono truncate flex-1">{txHash.slice(0, 20)}…</span>
          <a href={buildTxExplorerUrl(chainId, txHash)} target="_blank" rel="noopener noreferrer" className="text-[#0D0D0D] flex-shrink-0">
            <ExternalLink size={14} />
          </a>
        </div>
      )}

      <Button
        fullWidth
        size="lg"
        onClick={() => { void handleConfirm() }}
        disabled={!isConnected || isPending}
      >
        {isPending
          ? <><Loader2 size={16} style={{ animation: 'nan-spin 0.8s linear infinite', display: 'inline-block', marginRight: 8 }} />{status === 'approving' ? 'Approving USDC…' : status === 'creating-order' ? 'Creating order…' : 'Confirming…'}</>
          : isConfirmed
          ? '✓ Payment confirmed'
          : `Pay ${formatUSDC(total)} USDC`}
      </Button>
      <p className="text-center text-xs text-[#9898A6] mt-3">
        Real USDC transfer on Arc Testnet · Irreversible once signed
      </p>
    </div>
  )
}

function ListProductForm({ onBack }: { onBack: () => void }) {
  const { address } = useAccount()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [category, setCategory] = useState('digital')
  const [wallet, setWallet] = useState(address ?? '')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!name || !price || !wallet) return
    setSubmitted(true)
  }

  const FONT = "'Inter', -apple-system, sans-serif"
  const S = { fontFamily: FONT, color: '#0D0D0D' }

  if (submitted) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F7F7F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Check size={24} color="#0D0D0D" />
        </div>
        <h2 style={{ ...S, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Listing submitted</h2>
        <p style={{ color: '#5C5C6B', fontSize: 14, marginBottom: 8 }}>
          <strong style={{ color: '#0D0D0D' }}>{name}</strong> · {price} USDC
        </p>
        <p style={{ color: '#9898A6', fontSize: 13, marginBottom: 24 }}>
          Payments will go to {wallet.slice(0, 6)}...{wallet.slice(-4)} on Arc Testnet.
          To go live, connect this app to a product database — see AGENTS.md for the backend endpoint.
        </p>
        <button onClick={onBack} style={{ ...S, height: 48, padding: '0 24px', borderRadius: 12, background: '#0D0D0D', color: '#FFF', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer', width: '100%' }}>
          Back to shop
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 9, background: '#F7F7F8', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={16} color="#0D0D0D" />
        </button>
        <div>
          <div style={{ ...S, fontSize: 17, fontWeight: 700 }}>List a product</div>
          <div style={{ color: '#5C5C6B', fontSize: 13 }}>Accept USDC directly to your wallet</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Product name" placeholder="e.g. Custom design template" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Price (USDC)" type="number" min="0.01" step="0.01" placeholder="e.g. 12.50" value={price} onChange={(e) => setPrice(e.target.value)} suffix={<span style={{ fontSize: 12, fontWeight: 700, color: '#9898A6' }}>USDC</span>} />
        <Input label="Description (optional)" placeholder="What does the buyer get?" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Product image URL" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        {imageUrl && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', aspectRatio: '16/9', background: '#F7F7F8' }}>
            <img src={imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5C5C6B', marginBottom: 6, fontFamily: FONT }}>Category</div>
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, background: '#F7F7F8', color: '#0D0D0D', fontSize: 14, fontFamily: FONT, appearance: 'none' }}>
            <option value="digital">Digital</option>
            <option value="services">Services</option>
            <option value="fashion">Fashion</option>
            <option value="electronics">Electronics</option>
            <option value="food">Food</option>
          </select>
        </div>
        <Input label="Your wallet address (receives USDC)" placeholder="0x..." value={wallet} onChange={(e) => setWallet(e.target.value)} />

        <div style={{ padding: '12px 14px', background: '#F7F7F8', borderRadius: 10, border: '1px solid rgba(0,0,0,0.07)' }}>
          <p style={{ margin: 0, fontSize: 12, color: '#5C5C6B', fontFamily: FONT }}>
            When a buyer completes checkout, the USDC amount is transferred directly onchain to the wallet address you provide. No intermediary.
          </p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!name || !price || !wallet}
          style={{ height: 50, borderRadius: 13, background: '#0D0D0D', color: '#FFF', fontSize: 15, fontWeight: 600, border: 'none', cursor: name && price && wallet ? 'pointer' : 'not-allowed', opacity: name && price && wallet ? 1 : 0.4, fontFamily: FONT }}
        >
          Submit listing
        </button>
      </div>
    </div>
  )
}
