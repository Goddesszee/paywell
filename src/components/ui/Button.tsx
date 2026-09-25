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

const base = [
  'inline-flex items-center justify-center gap-2 font-semibold',
  'border cursor-pointer select-none',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D0D0D] focus-visible:ring-offset-2',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
].join(' ')

const variants: Record<Variant, string> = {
  primary: [
    'bg-[#0D0D0D] text-white border-transparent',
    'hover:bg-[#1A1A1A]',
    'active:bg-[#1038A0] active:scale-[0.99]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[#0D0D0D] border-[rgba(0,0,0,0.14)]',
    'hover:border-[rgba(0,0,0,0.24)] hover:bg-[rgba(0,0,0,0.03)]',
    'active:scale-[0.99]',
  ].join(' '),
  danger: [
    'bg-[#DC2626] text-white border-transparent',
    'hover:bg-[#B91C1C]',
    'active:scale-[0.99]',
  ].join(' '),
  success: [
    'bg-[#16A34A] text-white border-transparent',
    'hover:bg-[#15803D]',
    'active:scale-[0.99]',
  ].join(' '),
  soft: [
    'bg-[rgba(0,0,0,0.05)] text-[#0D0D0D] border-[rgba(27,79,216,0.18)]',
    'hover:bg-[rgba(0,0,0,0.08)]',
    'active:scale-[0.99]',
  ].join(' '),
  secondary: [
    'bg-[#F7F7F8] text-[#0D0D0D] border-[rgba(0,0,0,0.10)]',
    'hover:bg-[#EFEFEF] hover:border-[rgba(0,0,0,0.18)]',
    'active:scale-[0.99]',
  ].join(' '),
}

const sizes: Record<Size, string> = {
  sm: 'text-[13px] px-3 py-[7px] rounded-[8px]',
  md: 'text-[14px] px-4 py-[10px] rounded-[9px]',
  lg: 'text-[15px] px-5 py-[13px] rounded-[10px]',
}

export function Button({
  variant = 'primary', size = 'md', loading = false,
  icon, iconRight, fullWidth = false, children, className = '', disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[base, variants[variant], sizes[size], fullWidth ? 'w-full' : '', className].join(' ')}
      style={{ fontFamily: FONT, letterSpacing: '-0.01em', ...props.style }}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
          style={{ animation: 'pw-spin 0.7s linear infinite' }} />
      ) : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
}

export function IconButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center w-9 h-9 rounded-[9px]',
        'bg-[#F7F7F8] border border-[rgba(0,0,0,0.10)] text-[#5C5C6B]',
        'hover:bg-[#EFEFEF] hover:text-[#0D0D0D] hover:border-[rgba(0,0,0,0.18)]',
        'transition-all duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D0D0D]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
