import React from 'react'

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'blue' | 'mono'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  dot?: boolean
  size?: 'sm' | 'md'
}

const styles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: '#F7F7F8', color: '#6B6B6B', border: '1px solid rgba(0,0,0,0.08)' },
  success: { background: 'rgba(34,197,94,0.12)',   color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' },
  danger:  { background: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' },
  warning: { background: 'rgba(245,158,11,0.12)',  color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' },
  blue:    { background: 'rgba(0,0,0,0.05)',   color: '#0D0D0D', border: '1px solid rgba(0,0,0,0.10)' },
  mono:    { background: 'rgba(0,0,0,0.04)',   color: '#0D0D0D', border: '1px solid rgba(0,0,0,0.08)', fontFamily: 'JetBrains Mono, Menlo, monospace', letterSpacing: '0.04em' },
}

const dotColors: Record<BadgeVariant, string> = {
  default: '#6B6B6B',
  success: '#22C55E',
  danger:  '#ef4444',
  warning: '#F59E0B',
  blue:    '#0D0D0D',
  mono:    '#0D0D0D',
}

export function Badge({ variant = 'default', children, dot, size = 'md' }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: size === 'sm' ? '2px 7px' : '3px 9px', borderRadius: 100,
        fontSize: size === 'sm' ? 11 : 12, fontWeight: 600,
        fontFamily: 'Inter, -apple-system, sans-serif',
        whiteSpace: 'nowrap',
        ...styles[variant],
      }}
    >
      {dot && (
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: dotColors[variant], flexShrink: 0,
          boxShadow: `0 0 5px ${dotColors[variant]}`,
        }} />
      )}
      {children}
    </span>
  )
}
