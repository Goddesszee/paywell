const FONT = "'Inter', -apple-system, sans-serif"

// The NAN logo mark — blue rounded square with white N SVG path
export function NanMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  const bg = inverted ? '#FFFFFF' : '#2563EB'
  const r  = Math.round(size * 0.22)
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: inverted ? 'none' : '0 4px 14px rgba(37,99,235,0.45)',
    }}>
      <svg width={size * 0.52} height={size * 0.58} viewBox="0 0 324 480" fill="none">
        <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
        <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
      </svg>
    </div>
  )
}

// Full horizontal lockup: mark + wordmark
export function NanLogo({
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
      <NanMark size={s.mark} inverted={inverted} />
      <span style={{ fontWeight: 800, fontSize: s.text, letterSpacing: '-0.03em', color: textColor, lineHeight: 1 }}>
        NAN
      </span>
    </div>
  )
}

// Vertical lockup: large mark above wordmark (for landing page)
export function NanLogoVertical({
  inverted = false,
  markSize = 64,
}: {
  inverted?: boolean
  markSize?: number
}) {
  const textColor = inverted ? '#FFFFFF' : '#0D0D0D'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, fontFamily: FONT }}>
      <NanMark size={markSize} inverted={inverted} />
      <span style={{ fontWeight: 800, fontSize: markSize * 0.56, letterSpacing: '-0.04em', color: textColor, lineHeight: 1 }}>
        NAN
      </span>
    </div>
  )
}

// Legacy aliases so any existing imports keep working
export const PaywellMark       = NanMark
export const PaywellLogo       = NanLogo
export const PaywellLogoVertical = NanLogoVertical
export const NanWordmark = ({ className = '' }: { className?: string }) => (
  <span className={className} style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#0D0D0D', fontFamily: FONT }}>
    NAN
  </span>
)
export const PaywellWordmark = NanWordmark
