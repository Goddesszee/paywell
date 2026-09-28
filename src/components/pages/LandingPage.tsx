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
@keyframes pw-card-in {
  from { opacity: 0; transform: translate(-50%, -46%) scale(0.94); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1);    }
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
      {/* Dark gradient overlay so wordmark, card and bottom text stay legible */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.65) 100%)',
        zIndex: 1,
      }} />

      {/* Wordmark — centered at the top, like the reference */}
      <div style={{
        position: 'absolute', top: 52, left: 0, right: 0,
        textAlign: 'center',
        animation: 'pw-fade-in 0.6s ease 0.1s both',
        zIndex: 3,
      }}>
        <span style={{
          fontSize: 30, fontWeight: 800, color: '#fff',
          letterSpacing: '-0.5px', textShadow: '0 1px 8px rgba(0,0,0,0.3)',
        }}>Paywell</span>
      </div>

      {/* Card — fixed, centered in the middle of the screen */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        animation: 'pw-card-in 0.6s cubic-bezier(0.2,0.8,0.2,1) 0.15s both',
        zIndex: 2,
        width: 'min(300px, calc(100vw - 48px))',
      }}>
        <div style={{
          width: '100%',
          aspectRatio: '1.586',
          background: 'linear-gradient(135deg, #e94fb8 0%, #b347e8 22%, #6a3df0 45%, #2f3bcf 68%, #0a0f3d 100%)',
          borderRadius: 24,
          boxShadow: '0 32px 72px rgba(30,10,80,0.55), 0 8px 24px rgba(20,5,60,0.45)',
          padding: '22px 26px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Glossy diagonal sheen */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(115deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 18%, transparent 38%, transparent 100%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 85% 90%, rgba(0,0,0,0.35) 0%, transparent 55%)',
            pointerEvents: 'none',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
            <span style={{
              fontSize: 19, fontWeight: 800, fontStyle: 'italic', color: '#fff',
              letterSpacing: '-0.2px', transform: 'rotate(-5deg)', transformOrigin: 'left top',
              textShadow: '0 1px 6px rgba(0,0,0,0.25)',
            }}>
              Paywell
            </span>
            {/* Chip */}
            <div style={{
              width: 34, height: 26,
              borderRadius: 5,
              background: 'linear-gradient(155deg, #3a3a42 0%, #17171c 55%, #050507 100%)',
              boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.6)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 13, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
              ····  ····  ····  4291
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card holder</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>Paywell User</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>USDC · Arc</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: tagline + CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 20px 52px',
        zIndex: 3,
        animation: 'pw-fade-up 0.6s ease 0.5s both',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.82)',
          fontSize: 15, fontWeight: 400,
          textAlign: 'center',
          margin: '0 0 16px',
          letterSpacing: '0.01em',
        }}>
          The intelligent payment layer
        </p>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%', height: 58,
            background: '#fff', color: '#0d0d0d',
            border: 'none', borderRadius: 30,
            fontSize: 17, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
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
