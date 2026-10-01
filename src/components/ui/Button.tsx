import React from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'success' | 'soft' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
}

const FONT = "'Inter', -apple-system, sans-serif"

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { fontSize: 13, padding: '7px 12px', borderRadius: 8 },
  md: { fontSize: 14, padding: '10px 16px', borderRadius: 10 },
  lg: { fontSize: 15, padding: '13px 20px', borderRadius: 12 },
}

function getVariantStyle(variant: Variant): React.CSSProperties {
  switch (variant) {
    case 'primary':   return { background: '#0066FF', color: '#fff', border: 'none' }
    case 'secondary': return { background: 'var(--nan-surface)', color: 'var(--nan-text)', border: '1px solid var(--nan-bdr)' }
    case 'ghost':     return { background: 'transparent', color: 'var(--nan-text)', border: '1px solid var(--nan-bdr)' }
    case 'soft':      return { background: 'rgba(0,102,255,0.10)', color: '#0066FF', border: '1px solid rgba(0,102,255,0.20)' }
    case 'danger':    return { background: '#DC2626', color: '#fff', border: 'none' }
    case 'success':   return { background: '#16A34A', color: '#fff', border: 'none' }
  }
}

export function Button({
  variant = 'primary', size = 'md', loading = false,
  icon, iconRight, fullWidth = false, children, style, disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: FONT, fontWeight: 600, letterSpacing: '-0.01em',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.45 : 1,
        transition: 'opacity 0.15s, background 0.15s',
        width: fullWidth ? '100%' : undefined,
        ...sizeStyles[size],
        ...getVariantStyle(variant),
        ...style,
      }}
    >
      {loading ? (
        <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pw-spin 0.7s linear infinite' }} />
      ) : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}
