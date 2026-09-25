const FONT = "'Inter', -apple-system, sans-serif"

export function PaywellLogo({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg', className?: string }) {
  const s = { sm: { mark: 26, text: 15 }, md: { mark: 32, text: 18 }, lg: { mark: 38, text: 22 } }[size]
  return (
    <div className={`flex items-center gap-2 ${className}`} style={{ fontFamily: FONT }}>
      <div style={{
        width: s.mark, height: s.mark, borderRadius: 7,
        background: '#0D0D0D',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg width={s.mark * 0.52} height={s.mark * 0.58} viewBox="0 0 20 22" fill="none">
          <path d="M3 1h9a5 5 0 0 1 0 10H3V1z" fill="white" fillOpacity="0.92"/>
          <rect x="3" y="11" width="3.2" height="10" rx="1.2" fill="white" fillOpacity="0.92"/>
        </svg>
      </div>
      <span style={{ fontWeight: 700, fontSize: s.text, letterSpacing: '-0.025em', color: '#0D0D0D', lineHeight: 1 }}>
        Paywell
      </span>
    </div>
  )
}

export const NanLogo = PaywellLogo

export function PaywellWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.025em', color: '#0D0D0D', fontFamily: FONT }}>
      Paywell
    </span>
  )
}

export const NanWordmark = PaywellWordmark
