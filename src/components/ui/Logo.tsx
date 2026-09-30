import React from 'react'

const FONT = "'Inter', -apple-system, sans-serif"

interface LogoProps {
  size?: number
  showText?: boolean
  color?: string
}

export function NanLogo({ size = 30, showText = true, color = '#0066FF' }: LogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: Math.round(size * 0.27),
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <svg viewBox="0 0 324 480" width={size * 0.43} height={size * 0.6} fill="none">
          <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
          <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
        </svg>
      </div>
      {showText && (
        <span style={{ fontWeight: 800, fontSize: size * 0.57, letterSpacing: '-0.04em', color: 'var(--nan-text)', fontFamily: FONT }}>
          nan
        </span>
      )}
    </div>
  )
}

export default NanLogo
