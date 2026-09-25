import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'

const STYLES = `
@keyframes pw-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pw-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pw-photo-in {
  from { opacity: 0; transform: scale(1.03); }
  to   { opacity: 1; transform: scale(1); }
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
      background: '#0d0d0d',
    }}>

      {/* Full-screen photo */}
      <div style={{
        position: 'absolute', inset: 0,
        animation: 'pw-photo-in 1.1s cubic-bezier(0.22,1,0.36,1) 0.1s both',
      }}>
        <img
          src="https://i.imgur.com/3If4jmf.jpg"
          alt=""
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center top',
            display: 'block',
          }}
          onError={e => {
            const el = e.currentTarget.parentElement as HTMLElement
            el.style.background = 'linear-gradient(160deg, #2a2a2a 0%, #1a1a1a 50%, #0d0d0d 100%)'
            e.currentTarget.style.display = 'none'
          }}
        />
        {/* Gradient overlay — readable text top + bottom */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to bottom,
            rgba(0,0,0,0.52) 0%,
            rgba(0,0,0,0.05) 30%,
            rgba(0,0,0,0.05) 60%,
            rgba(0,0,0,0.72) 100%)`,
        }} />
      </div>

      {/* Logo */}
      <div style={{
        position: 'absolute', top: '7%', left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        animation: 'pw-fade-in 0.9s ease 0.25s both',
        zIndex: 10,
      }}>
        <span style={{
          fontSize: 36, fontWeight: 800,
          color: '#fff',
          letterSpacing: '-0.04em',
          textShadow: '0 2px 16px rgba(0,0,0,0.3)',
        }}>
          Paywell
        </span>
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '0 20px max(36px, env(safe-area-inset-bottom))',
        animation: 'pw-fade-up 0.8s cubic-bezier(0.22,1,0.36,1) 0.55s both',
        zIndex: 10,
      }}>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%', padding: '18px 0',
            background: '#fff',
            border: 'none', borderRadius: 50,
            fontSize: 17, fontWeight: 700, color: '#0D0D0D',
            cursor: 'pointer',
            fontFamily: "'Inter', -apple-system, sans-serif",
            letterSpacing: '-0.02em',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}
        >
          Get started
        </button>
      </div>

    </div>
  )
}
