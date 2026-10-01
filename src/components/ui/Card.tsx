import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'balance' | 'glow' | 'flat'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-7' }

export function Card({ variant = 'default', padding = 'md', className = '', style, children, ...props }: CardProps) {
  const base: React.CSSProperties = {
    borderRadius: 14,
    background: variant === 'glow'
      ? 'rgba(0,102,255,0.06)'
      : 'var(--nan-surface)',
    border: variant === 'glow'
      ? '1px solid rgba(0,102,255,0.18)'
      : '1px solid var(--nan-bdr)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
    ...style,
  }
  return (
    <div {...props} className={[paddings[padding], className].join(' ')} style={base}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={['flex items-center gap-2 mb-4', className].join(' ')} style={{
      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--nan-text2)',
    }}>
      {children}
    </div>
  )
}

export function CardRow({ label, value, mono = false, className = '' }: {
  label: string; value: React.ReactNode; mono?: boolean; className?: string
}) {
  return (
    <div className={['flex items-center justify-between py-2.5', className].join(' ')}
      style={{ borderBottom: '1px solid var(--nan-bdr)' }}>
      <span style={{ fontSize: 13, color: 'var(--nan-text2)', fontFamily: 'Inter, sans-serif' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: 'var(--nan-text)',
        fontFamily: mono ? 'monospace' : 'Inter, sans-serif',
      }}>{value}</span>
    </div>
  )
}
