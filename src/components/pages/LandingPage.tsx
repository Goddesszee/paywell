import { useEffect, useRef, useState } from 'react'
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
@keyframes pw-slide-enter {
  from { opacity: 0; transform: translateX(60px) scale(0.96); }
  to   { opacity: 1; transform: translateX(0)    scale(1);    }
}
@keyframes pw-slide-exit {
  from { opacity: 1; transform: translateX(0)     scale(1);    }
  to   { opacity: 0; transform: translateX(-60px) scale(0.96); }
}
@keyframes pw-bg-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pw-bg-exit {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes pw-card-slide-enter {
  from { opacity: 0; transform: translate(calc(-50% + 60px), -50%) scale(0.96); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes pw-card-slide-exit {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(calc(-50% - 60px), -50%) scale(0.96); }
}
`

/* The two slides: girl photo + card-only dark slide */
const SLIDES = ['photo', 'card'] as const
type Slide = typeof SLIDES[number]

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const injected = useRef(false)
  const [current, setCurrent] = useState<Slide>('photo')
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (injected.current) return
    injected.current = true
    const el = document.createElement('style')
    el.textContent = STYLES
    document.head.appendChild(el)
  }, [])

  /* Auto-advance every 3.5 s */
  useEffect(() => {
    const id = setInterval(() => {
      setExiting(true)
      setTimeout(() => {
        setCurrent(s => s === 'photo' ? 'card' : 'photo')
        setExiting(false)
      }, 420)
    }, 3500)
    return () => clearInterval(id)
  }, [])

  const slideAnim = exiting
    ? 'pw-slide-exit 0.42s ease forwards'
    : 'pw-slide-enter 0.42s ease forwards'
  const cardSlideAnim = exiting
    ? 'pw-card-slide-exit 0.42s ease forwards'
    : 'pw-card-slide-enter 0.42s ease forwards'
  const bgAnim = exiting
    ? 'pw-bg-exit 0.42s ease forwards'
    : 'pw-bg-enter 0.42s ease forwards'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: 'hidden',
      background: '#111',
    }}>

      {/* ── Background layer — girl photo (slide 1) ── */}
      {current === 'photo' && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/girl.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          animation: bgAnim,
          zIndex: 0,
        }} />
      )}

      {/* ── Background layer — dark gradient (slide 2) ── */}
      {current === 'card' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #0d0d0d 0%, #1c1c1c 60%, #0a0a0a 100%)',
          animation: bgAnim,
          zIndex: 0,
        }} />
      )}

      {/* Always-on dark gradient overlay for legible bottom text */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.65) 100%)',
        zIndex: 1,
      }} />

      {/* Wordmark — centered at the top */}
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

      {/* Slide dot indicators */}
      <div style={{
        position: 'absolute', top: 60, right: 24,
        display: 'flex', gap: 6, alignItems: 'center',
        zIndex: 3,
      }}>
        {SLIDES.map(s => (
          <div key={s} style={{
            width: current === s ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: current === s ? '#fff' : 'rgba(255,255,255,0.35)',
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        ))}
      </div>

      {/* ── Slide content ── */}

      {/* Slide 2: dark bg — payment card, fixed centre of screen */}
      {current === 'card' && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          animation: cardSlideAnim,
          zIndex: 2,
          width: 'min(300px, calc(100vw - 48px))',
        }}>
          {/* Card */}
          <div style={{
            width: '100%',
            aspectRatio: '1.586',
            background: 'linear-gradient(135deg, #3a3a3d 0%, #1c1c1f 45%, #050505 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            boxShadow: '0 32px 72px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.45)',
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
              background: 'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 20%, transparent 40%, transparent 100%)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 90% 100%, rgba(255,255,255,0.05) 0%, transparent 50%)',
              pointerEvents: 'none',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <span style={{
                fontSize: 19, fontWeight: 800, fontStyle: 'italic', color: '#fff',
                letterSpacing: '-0.2px', transform: 'rotate(-5deg)', transformOrigin: 'left top',
                textShadow: '0 1px 6px rgba(0,0,0,0.4)',
              }}>
                Paywell
              </span>
              {/* Chip */}
              <div style={{
                width: 34, height: 26,
                borderRadius: 5,
                background: 'linear-gradient(155deg, #f2f2f2 0%, #c9c9c9 50%, #9a9a9a 100%)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.35)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.2)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.2)' }} />
              </div>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 13, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                ····  ····  ····  4291
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card holder</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>Paywell User</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>USDC · Arc</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
