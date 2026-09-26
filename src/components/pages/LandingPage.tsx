import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'

const STYLES = `
@keyframes pw-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pw-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pw-card-slide {
  0%   { transform: translateX(-100vw) rotate(-8deg); }
  15%  { transform: translateX(10px)   rotate(-6deg); }
  45%  { transform: translateX(10px)   rotate(-6deg); }
  55%  { transform: translateX(calc(100vw - 220px)) rotate(6deg); }
  85%  { transform: translateX(calc(100vw - 220px)) rotate(6deg); }
  100% { transform: translateX(-100vw) rotate(-8deg); }
}
@keyframes pw-card-in {
  from { opacity: 0; transform: translateX(-100vw) rotate(-8deg); }
  to   { opacity: 1; transform: translateX(10px)   rotate(-6deg); }
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
      background: '#b0b0b0',
      backgroundImage: 'url(/girl.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center top',
    }}>
      {/* Dark gradient at bottom so buttons are readable */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.55) 100%)',
        zIndex: 1,
      }} />

      {/* Wordmark top-left */}
      <div style={{
        position: 'absolute',
        top: 52,
        left: 24,
        display: 'flex',
        alignItems: 'center',
        animation: 'pw-fade-in 0.6s ease 0.1s both',
        zIndex: 3,
      }}>
        <span style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.5px',
          textShadow: '0 1px 8px rgba(0,0,0,0.25)',
        }}>Paywell</span>
      </div>

      {/* Sliding card — left to right and back */}
      <div style={{
        position: 'absolute',
        bottom: 180,
        left: 0,
        width: 200,
        aspectRatio: '1.586',
        background: 'linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 60%, #111 100%)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 6px 20px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 20px',
        animation: 'pw-card-slide 4s cubic-bezier(0.45,0,0.55,1) 0.5s infinite',
        zIndex: 2,
      }}>
        <div style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 13,
          fontWeight: 500,
        }}>
          Paywell
        </div>
        <div style={{
          alignSelf: 'flex-end',
          width: 38,
          height: 28,
          background: 'linear-gradient(135deg, #888 0%, #aaa 50%, #777 100%)',
          borderRadius: 5,
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
        }} />
      </div>

      {/* Bottom: tagline + button */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0, right: 0,
        padding: '0 20px 52px',
        zIndex: 3,
        animation: 'pw-fade-up 0.6s ease 0.5s both',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.82)',
          fontSize: 15,
          fontWeight: 400,
          textAlign: 'center',
          margin: '0 0 16px',
          letterSpacing: '0.01em',
        }}>
          The intelligent payment layer
        </p>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%',
            height: 58,
            background: '#fff',
            color: '#0d0d0d',
            border: 'none',
            borderRadius: 30,
            fontSize: 17,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.2px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          Get started
        </button>
      </div>
    </div>
  )
}
