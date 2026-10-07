import { useEffect, useState } from 'react'

const BLUE = '#0066FF'

interface Props { onDone: () => void }

export function SplashScreen({ onDone }: Props) {
  const [out, setOut] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setOut(true),  4400)  // start fade at 4.4s
    const t2 = setTimeout(() => onDone(),      5000)  // dismiss at 5s
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: BLUE,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: out ? 0 : 1,
      transition: out ? 'opacity 0.55s ease' : 'none',
    }}>
      {/* spinning NAN logo mark — no text */}
      <div style={{ animation: 'nan-splash-spin 2s linear infinite' }}>
        <svg viewBox="0 0 324 480" width="110" height="110" fill="none">
          <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
          <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
        </svg>
      </div>

      <style>{`
        @keyframes nan-splash-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
