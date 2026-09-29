import React from 'react'
import { X } from 'lucide-react'
import { useShopStore, ShopFilter, ConditionLabel, DeliveryMethod } from '../../store/shopStore'
import { Button } from '../ui/Button'

const FONT = "'Inter', -apple-system, sans-serif"
const CONDITIONS: { id: ConditionLabel; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'like_new', label: 'Like New' },
  { id: 'excellent', label: 'Excellent' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
]
const SORT_OPTIONS: { id: ShopFilter['sortBy']; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'newest', label: 'Newest first' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Highest rated' },
]
const DELIVERY_OPTIONS: { id: DeliveryMethod; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'express', label: 'Express' },
  { id: 'digital', label: 'Digital download' },
  { id: 'pickup', label: 'Pickup' },
]

interface FilterPanelProps {
  onClose: () => void
}

export function FilterPanel({ onClose }: FilterPanelProps) {
  const { filter, setFilter, resetFilter } = useShopStore()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'flex-end',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: '100%',
        background: '#ffffff',
        borderRadius: '20px 20px 0 0',
        maxHeight: '90dvh',
        overflowY: 'auto',
        padding: '20px 20px 40px',
        zIndex: 1,
        animation: 'pw-up 0.22s ease both',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#1a1a1a', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: FONT }}>Filters & Sort</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: '#1a1a1a', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} color="#5C5C6B" />
          </button>
        </div>

        {/* Sort */}
        <Section label="Sort by">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SORT_OPTIONS.map((s) => (
              <Chip key={s.id} active={filter.sortBy === s.id} onClick={() => setFilter({ sortBy: s.id })}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Condition */}
        <Section label="Condition">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CONDITIONS.map((c) => (
              <Chip key={c.id} active={filter.condition === c.id} onClick={() => setFilter({ condition: filter.condition === c.id ? undefined : c.id })}>
                {c.label}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Price */}
        <Section label="Price (USDC)">
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9898A6', fontFamily: FONT, marginBottom: 4 }}>Min</div>
              <input
                type="number" min={0} placeholder="0"
                value={filter.priceMin ?? ''}
                onChange={(e) => setFilter({ priceMin: e.target.value ? Number(e.target.value) : undefined })}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#9898A6', fontFamily: FONT, marginBottom: 4 }}>Max</div>
              <input
                type="number" min={0} placeholder="Any"
                value={filter.priceMax ?? ''}
                onChange={(e) => setFilter({ priceMax: e.target.value ? Number(e.target.value) : undefined })}
                style={inputStyle}
              />
            </div>
          </div>
        </Section>

        {/* Delivery */}
        <Section label="Delivery">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DELIVERY_OPTIONS.map((d) => (
              <Chip key={d.id} active={filter.deliveryMethod === d.id} onClick={() => setFilter({ deliveryMethod: filter.deliveryMethod === d.id ? undefined : d.id })}>
                {d.label}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Verified only */}
        <Section label="Seller">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div
              onClick={() => setFilter({ verifiedOnly: !filter.verifiedOnly })}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: filter.verifiedOnly ? '#ffffff' : '#1a1a1a',
                border: '1px solid rgba(0,0,0,0.10)',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: filter.verifiedOnly ? 20 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.20)',
                transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 14, color: '#ffffff', fontFamily: FONT, fontWeight: 500 }}>
              Verified sellers only
            </span>
          </label>
        </Section>

        {/* Min rating */}
        <Section label="Minimum rating">
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 3, 4, 4.5].map((r) => (
              <Chip key={r} active={(filter.minRating ?? 0) === r} onClick={() => setFilter({ minRating: r === 0 ? undefined : r })}>
                {r === 0 ? 'Any' : `${r}+`}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <Button variant="ghost" fullWidth onClick={() => { resetFilter(); onClose() }}>
            Reset
          </Button>
          <Button fullWidth onClick={onClose}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5C5C6B', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32, padding: '0 12px', borderRadius: 20,
        border: `1px solid ${active ? '#ffffff' : 'rgba(0,0,0,0.10)'}`,
        background: active ? '#ffffff' : '#1a1a1a',
        color: active ? '#ffffff' : '#ffffff',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.12s', fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px',
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 9, background: '#1a1a1a',
  fontSize: 14, color: '#ffffff',
  fontFamily: "'Inter', sans-serif",
  outline: 'none', boxSizing: 'border-box',
}
