const FONT = "'Inter', -apple-system, sans-serif"

// The single Paywell logo mark — square black pill with white P
// inverted=true → white pill with black P (for dark backgrounds like the landing page)
export function PaywellMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg  = inverted ? '#FFFFFF' : '#0D0D0D'
  const fg  = inverted ? '#0D0D0D' : '#FFFFFF'
  const r   = Math.round(size * 0.22)
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.52} height={size * 0.58} viewBox="0 0 20 22" fill="none">
        <path d="M3 1h9a5 5 0 0 1 0 10H3V1z" fill={fg} fillOpacity="0.92"/>
        <rect x="3" y="11" width="3.2" height="10" rx="1.2" fill={fg} fillOpacity="0.92"/>
      </svg>
    </div>
  )
}

// Full horizontal lockup: mark + wordmark
// inverted=true → white text + white mark (for dark backgrounds)
export function PaywellLogo({
  size = 'md',
  inverted = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  inverted?: boolean
  className?: string
}) {
  const s = { sm: { mark: 26, text: 15 }, md: { mark: 32, text: 18 }, lg: { mark: 38, text: 22 } }[size]
  const textColor = inverted ? '#FFFFFF' : '#0D0D0D'
  return (
    <div className={`flex items-center gap-2 ${className}`} style={{ fontFamily: FONT }}>
      <PaywellMark size={s.mark} inverted={inverted} />
      <span style={{ fontWeight: 700, fontSize: s.text, letterSpacing: '-0.025em', color: textColor, lineHeight: 1 }}>
        Paywell
      </span>
    </div>
  )
}

// Vertical lockup: large mark above wordmark (for landing page)
export function PaywellLogoVertical({
  inverted = false,
  markSize = 64,
}: {
  inverted?: boolean
  markSize?: number
}) {
  const textColor = inverted ? '#FFFFFF' : '#0D0D0D'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
      <PaywellMark size={markSize} inverted={inverted} />
      <span style={{ fontWeight: 700, fontSize: markSize * 0.56, letterSpacing: '-0.03em', color: textColor, lineHeight: 1 }}>
        Paywell
      </span>
    </div>
  )
}

// Legacy aliases — keep any old import working
export const NanLogo     = PaywellLogo
export const NanWordmark = ({ className = '' }: { className?: string }) => (
  <span className={className} style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.025em', color: '#0D0D0D', fontFamily: FONT }}>
    Paywell
  </span>
)
export const PaywellWordmark = NanWordmark
