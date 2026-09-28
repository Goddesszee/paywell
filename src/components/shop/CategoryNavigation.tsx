import React from 'react'
import {
  LayoutGrid, Cpu, Smartphone, Monitor, Shirt, Home, Zap, Car,
  Gamepad2, Sparkles, Sofa, Wrench, Download, Briefcase, MoreHorizontal,
} from 'lucide-react'
import { SHOP_CATEGORIES } from '../../data/shopCategories'

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutGrid, Cpu, Smartphone, Monitor, Shirt, Home, Zap, Car,
  Gamepad2, Sparkles, Sofa, Wrench, Download, Briefcase, MoreHorizontal,
}

interface CategoryNavigationProps {
  active: string
  onChange: (id: string) => void
}

const FONT = "'Inter', -apple-system, sans-serif"

export function CategoryNavigation({ active, onChange }: CategoryNavigationProps) {
  return (
    <div style={{
      display: 'flex', gap: 6,
      overflowX: 'auto', paddingBottom: 4,
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
    }}>
      {SHOP_CATEGORIES.map((cat) => {
        const isActive = active === cat.id
        const Icon = ICON_MAP[cat.icon] ?? LayoutGrid
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            style={{
              flexShrink: 0,
              height: 34, padding: '0 13px',
              borderRadius: 20,
              border: `1px solid ${isActive ? '#0D0D0D' : 'rgba(0,0,0,0.09)'}`,
              background: isActive ? '#0D0D0D' : '#F7F7F8',
              color: isActive ? '#FFF' : '#0D0D0D',
              fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
              cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: FONT,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={12} color={isActive ? '#FFF' : '#5C5C6B'} />
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
