import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'

const STYLES = `
@keyframes pw-fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pw-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pw-card-in {
  from { opacity: 0; transform: translateY(40px) rotate(-8deg); }
  to   { opacity: 1; transform: translateY(0) rotate(-8deg); }
}
@keyframes pw-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
`

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)

  const injected = useRef(false)
  useEffect(() => {
    if (injected.current) return
    injected.current = true
    const el = document.createElement('style')
    el.textContent = STYLES
    document.head.appendChild(el)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: 'hidden',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>

      {/* Top: logo */}
      <div style={{
        paddingTop: 56,
        animation: 'pw-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 36,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-1.5px',
        }}>Paywell</div>
        <div style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.45)',
          marginTop: 4,
          fontWeight: 400,
          letterSpacing: '0.02em',
        }}>The intelligent payment layer</div>
      </div>

      {/* Middle: card */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        position: 'relative',
      }}>
        {/* Glow behind card */}
        <div style={{
          position: 'absolute',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)',
          animation: 'pw-fade-in 1s ease 0.3s both',
        }} />

        {/* Card */}
        <div style={{
          width: 300,
          height: 185,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
          transform: 'rotate(-8deg)',
          animation: 'pw-card-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s both',
          position: 'relative',
          overflow: 'hidden',
          padding: '24px 24px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)',
            backgroundSize: '200% 100%',
            animation: 'pw-shimmer 3s linear infinite',
            pointerEvents: 'none',
          }} />

          {/* Card top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Paywell</span>
            {/* NFC icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(255,255,255,0.08)"/>
              <path d="M8 12c0-2.21 1.79-4 4-4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M5 12c0-3.87 3.13-7 7-7" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Chip */}
          <div style={{
            width: 38, height: 28,
            borderRadius: 5,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.12)',
          }} />

          {/* Card number */}
          <div style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
            fontFamily: 'monospace',
            letterSpacing: '0.15em',
          }}>
            •••• •••• •••• 8421
          </div>
        </div>
      </div>

      {/* Bottom: CTA */}
      <div style={{
        width: '100%',
        padding: '0 20px 48px',
        animation: 'pw-fade-up 0.7s cubic-bezier(0.22,1,0.36,1) 0.5s both',
      }}>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 28,
            border: 'none',
            background: '#fff',
            color: '#111',
            fontSize: 17,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.2px',
          }}
        >
          Get started
        </button>
      </div>
    </div>
  )
}
