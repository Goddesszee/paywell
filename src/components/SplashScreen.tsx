/**
 * SplashScreen — 4 quadrants fly in from the corners to form the NAN logo,
 * hold for a beat, then fade out. Auto-dismisses after ~2.2s.
 */
import React, { useEffect, useState } from 'react'

const BLUE = '#0066FF'

interface Props { onDone: () => void }

export function SplashScreen({ onDone }: Props) {
  // phase: 'in' → pieces fly in | 'hold' → fully assembled | 'out' → fade away
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 700)   // pieces land
    const t2 = setTimeout(() => setPhase('out'),  1400)  // start fade
    const t3 = setTimeout(() => onDone(),         2000)  // unmount
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onDone])

  const opacity = phase === 'out' ? 0 : 1

  // Each quadrant translates from a corner toward center (0,0) as phase → 'hold'
  const q = (dx: number, dy: number): React.CSSProperties => ({
    position: 'absolute',
    width: '50%', height: '50%',
    transform: phase === 'in' ? `translate(${dx}px, ${dy}px)` : 'translate(0,0)',
    transition: phase === 'in'
      ? 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1)'
      : 'transform 0.3s ease',
    willChange: 'transform',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: BLUE,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity, transition: phase === 'out' ? 'opacity 0.5s ease' : 'none',
    }}>
      {/* NAN logo assembled from 4 quadrant clips */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>

        {/* top-left quadrant — arrives from top-left */}
        <div style={{ ...q(-80, -80), top: 0, left: 0, overflow: 'hidden' }}>
          <svg viewBox="0 0 324 480" width="120" height="120" style={{ position: 'absolute', top: 0, left: 0 }}>
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>

        {/* top-right quadrant — arrives from top-right */}
        <div style={{ ...q(80, -80), top: 0, right: 0, overflow: 'hidden' }}>
          <svg viewBox="0 0 324 480" width="120" height="120" style={{ position: 'absolute', top: 0, right: 0 }}>
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>

        {/* bottom-left quadrant — arrives from bottom-left */}
        <div style={{ ...q(-80, 80), bottom: 0, left: 0, overflow: 'hidden' }}>
          <svg viewBox="0 0 324 480" width="120" height="120" style={{ position: 'absolute', bottom: 0, left: 0 }}>
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>

        {/* bottom-right quadrant — arrives from bottom-right */}
        <div style={{ ...q(80, 80), bottom: 0, right: 0, overflow: 'hidden' }}>
          <svg viewBox="0 0 324 480" width="120" height="120" style={{ position: 'absolute', bottom: 0, right: 0 }}>
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>

      </div>

      {/* NAN wordmark fades in once pieces land */}
      <div style={{
        position: 'absolute', bottom: '38%',
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: '#fff',
        opacity: phase === 'in' ? 0 : 1,
        transition: 'opacity 0.4s ease 0.2s',
      }}>
        NAN
      </div>
    </div>
  )
}
