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

      {/* Wordmark */}
      <div style={{
        position: 'absolute', top: 52, left: 24,
        animation: 'pw-fade-in 0.6s ease 0.1s both',
        zIndex: 3,
      }}>
        <span style={{
          fontSize: 28, fontWeight: 800, color: '#fff',
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

      {/* Slide 1: girl photo — subtle caption card */}
      {current === 'photo' && (
        <div style={{
          position: 'absolute', bottom: 190, left: 24, right: 24,
          animation: slideAnim,
          zIndex: 2,
        }}>
          <div style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 16,
            padding: '10px 16px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
              Send USDC instantly
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              No fees · Settles on Arc
            </div>
          </div>
        </div>
      )}

      {/* Slide 2: dark bg — payment card front and centre */}
      {current === 'card' && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -54%)',
          animation: slideAnim,
          zIndex: 2,
          width: 300,
        }}>
          {/* Card */}
          <div style={{
            width: '100%',
            aspectRatio: '1.586',
            background: 'linear-gradient(145deg, #222 0%, #333 60%, #181818 100%)',
            borderRadius: 24,
            boxShadow: '0 32px 72px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5)',
            padding: '22px 26px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle circle gloss */}
            <div style={{
              position: 'absolute', top: -40, right: -40,
              width: 160, height: 160, borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em' }}>
                Paywell
              </span>
              {/* Chip */}
              <div style={{
                width: 34, height: 26,
                background: 'linear-gradient(135deg, #888 0%, #bbb 50%, #777 100%)',
                borderRadius: 5,
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 13, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
                ····  ····  ····  4291
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card holder</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Paywell User</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Balance</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>USDC · Arc</div>
                </div>
              </div>
            </div>
          </div>
          {/* Caption below card */}
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Your USDC wallet
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Powered by Arc · Built on Circle
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
