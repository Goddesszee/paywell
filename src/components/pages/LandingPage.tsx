import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { PaywellLogoVertical } from '../ui/Logo'

const STYLES = `
@keyframes pw-card-in {
  from { opacity: 0; transform: rotate(-8deg) translateY(40px) scale(0.92); }
  to   { opacity: 1; transform: rotate(-8deg) translateY(0)    scale(1); }
}
@keyframes pw-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pw-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
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
      backgroundImage: 'url(https://i.imgur.com/3If4jmf.jpeg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center top',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>

      {/* Logo mark + wordmark */}
      <div style={{
        marginTop: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        animation: 'pw-fade-in 0.7s ease 0.1s both',
        zIndex: 2,
      }}>
        {/* P mark */}
        <div style={{
          width: 64, height: 64,
          borderRadius: 18,
          background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}>
          <span style={{ fontSize: 36, fontWeight: 900, color: '#0d0d0d', letterSpacing: '-2px', lineHeight: 1 }}>P</span>
        </div>
        {/* Wordmark */}
        <div style={{
          fontSize: 42,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: '-1px',
          textShadow: '0 2px 16px rgba(0,0,0,0.18)',
        }}>
          Paywell
        </div>
      </div>

      {/* Card */}
      <div style={{
        marginTop: 32,
        width: '78vw',
        maxWidth: 340,
        aspectRatio: '1.586',
        background: 'linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 60%, #111 100%)',
        borderRadius: 24,
        boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 24px',
        animation: 'pw-card-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s both',
        zIndex: 2,
        position: 'relative',
      }}>
        {/* Card label */}
        <div style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: '0.01em',
        }}>
          Paywell
        </div>

        {/* Chip */}
        <div style={{
          alignSelf: 'flex-end',
          width: 44,
          height: 34,
          background: 'linear-gradient(135deg, #888 0%, #aaa 50%, #777 100%)',
          borderRadius: 6,
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
        }} />
      </div>

      {/* Spacer pushes buttons to bottom */}
      <div style={{ flex: 1 }} />

      {/* Buttons */}
      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: '0 20px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'pw-fade-up 0.6s ease 0.5s both',
        zIndex: 2,
      }}>
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
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
        >
          Get started
        </button>
      </div>
    </div>
  )
}
