import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'balance' | 'glow' | 'flat'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variants = {
  default: 'bg-[#EFEFEF] border border-[rgba(0,0,0,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(0,0,0,0.05),inset_0_0_0_0.5px_#F7F7F8]',
  balance: 'bg-[linear-gradient(145deg,#1a1a1a_0%,#111111_50%,#1a1a1a_100%)] border border-[rgba(0,0,0,0.07)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden relative',
  glow:    'bg-[rgba(0,0,0,0.03)] border border-[rgba(0,0,0,0.10)] shadow-[0_4px_20px_rgba(0,0,0,0.05)]',
  flat:    'bg-[#EFEFEF] border border-[rgba(0,0,0,0.06)]',
}

const paddings = {
  none: '',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-7',
}

export function Card({ variant = 'default', padding = 'md', className = '', children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={[
        'rounded-[14px]',
        variants[variant],
        paddings[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div
      className={['flex items-center gap-2 mb-4', className].join(' ')}
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#0D0D0D',
        opacity: 0.85,
      }}
    >
      {children}
    </div>
  )
}

export function CardRow({ label, value, mono = false, className = '' }: {
  label: string, value: React.ReactNode, mono?: boolean, className?: string
}) {
  return (
    <div className={['flex items-center justify-between py-2.5 border-b border-[rgba(0,0,0,0.05)] last:border-0', className].join(' ')}>
      <span style={{ fontSize: 13, color: '#A0A0A0', fontFamily: 'Space Grotesk, sans-serif' }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 600, color: '#0D0D0D',
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'Space Grotesk, sans-serif',
        letterSpacing: mono ? '0.01em' : undefined,
      }}>{value}</span>
    </div>
  )
}
