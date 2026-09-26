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
@keyframes pw-card-float {
  0%   { transform: rotate(-6deg) translateY(0px)   scale(1);    }
  30%  { transform: rotate(-4deg) translateY(-12px) scale(1.02); }
  60%  { transform: rotate(-8deg) translateY(-6px)  scale(0.99); }
  100% { transform: rotate(-6deg) translateY(0px)   scale(1);    }
}
@keyframes pw-card-in {
  from { opacity: 0; transform: rotate(-6deg) translateY(60px) scale(0.88); }
  to   { opacity: 1; transform: rotate(-6deg) translateY(0)    scale(1);    }
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

      {/* Logo top-left */}
      <div style={{
        position: 'absolute',
        top: 52,
        left: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'pw-fade-in 0.6s ease 0.1s both',
        zIndex: 3,
      }}>
        <div style={{
          width: 44, height: 44,
          borderRadius: 13,
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#0d0d0d', letterSpacing: '-1px', lineHeight: 1 }}>P</span>
        </div>
        <span style={{
          fontSize: 26,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.5px',
          textShadow: '0 1px 8px rgba(0,0,0,0.25)',
        }}>Paywell</span>
      </div>

      {/* Floating card — bottom-right, out of the way of the face */}
      <div style={{
        position: 'absolute',
        bottom: 160,
        right: -20,
        width: '62vw',
        maxWidth: 260,
        aspectRatio: '1.586',
        background: 'linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 60%, #111 100%)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 6px 20px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '16px 20px',
        animation: 'pw-card-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.3s both, pw-card-float 5s ease-in-out 1.2s infinite',
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
