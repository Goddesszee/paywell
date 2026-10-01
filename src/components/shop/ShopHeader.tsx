import React from 'react'
import { Search, ShoppingCart, Package, Plus, SlidersHorizontal, Heart } from 'lucide-react'

interface ShopHeaderProps {
  search: string
  onSearchChange: (v: string) => void
  onOpenCart: () => void
  onOpenOrders: () => void
  onOpenSell: () => void
  onOpenSaved: () => void
  onOpenFilters: () => void
  cartCount: number
  ordersCount: number
  savedCount: number
}

const FONT = "'Inter', -apple-system, sans-serif"

export function ShopHeader({
  search, onSearchChange, onOpenCart, onOpenOrders, onOpenSell,
  onOpenSaved, onOpenFilters, cartCount, ordersCount, savedCount,
}: ShopHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: '#ffffff',
            letterSpacing: '-0.03em', lineHeight: 1.15,
            fontFamily: FONT, marginBottom: 2,
          }}>
            NAN Shop
          </h1>
          <p style={{ fontSize: 12, color: '#9898A6', fontFamily: FONT }}>
            Programmable commerce on Arc · Powered by Circle
          </p>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Saved */}
          <HeaderIconBtn onClick={onOpenSaved} label="Saved items" badge={savedCount}>
            <Heart size={17} color="#ffffff" />
          </HeaderIconBtn>
          {/* Orders */}
          <HeaderIconBtn onClick={onOpenOrders} label="My orders" badge={ordersCount}>
            <Package size={17} color="#ffffff" />
          </HeaderIconBtn>
          {/* Cart */}
          <HeaderIconBtn onClick={onOpenCart} label="Cart" badge={cartCount}>
            <ShoppingCart size={17} color="#ffffff" />
          </HeaderIconBtn>
        </div>
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={15} color="#9898A6" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none',
          }} />
          <input
            type="search"
            placeholder="Search products, brands or categories"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%', height: 42,
              paddingLeft: 36, paddingRight: 14,
              border: '1px solid rgba(0,0,0,0.10)',
              borderRadius: 11,
              background: '#1a1a1a',
              fontSize: 14, color: '#ffffff',
              fontFamily: FONT,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#ffffff'; e.currentTarget.style.background = '#ffffff' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.10)'; e.currentTarget.style.background = '#1a1a1a' }}
          />
        </div>
        {/* Filter button */}
        <button
          onClick={onOpenFilters}
          aria-label="Filters"
          style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0,
            background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a1a' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1a1a' }}
        >
          <SlidersHorizontal size={16} color="#ffffff" />
        </button>
        {/* Sell */}
        <button
          onClick={onOpenSell}
          aria-label="Sell an item"
          style={{
            height: 42, padding: '0 14px', borderRadius: 11, flexShrink: 0,
            background: '#ffffff', border: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1A1A1A' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff' }}
        >
          <Plus size={15} color="#ffffff" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', fontFamily: FONT }}>Sell</span>
        </button>
      </div>
    </div>
  )
}

function HeaderIconBtn({
  children, onClick, label, badge,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 38, height: 38, borderRadius: 10, position: 'relative',
        background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a1a' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1a1a' }}
    >
      {children}
      {!!badge && badge > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4,
          minWidth: 16, height: 16, borderRadius: 8,
          background: '#ffffff', color: '#ffffff',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 3px', fontFamily: "'Inter', sans-serif",
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
