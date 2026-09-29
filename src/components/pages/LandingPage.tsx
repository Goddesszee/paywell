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

const SLIDES = ['girl', 'john', 'card'] as const
type Slide = typeof SLIDES[number]

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const injected = useRef(false)
  const [current, setCurrent] = useState<Slide>('girl')
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (injected.current) return
    injected.current = true
    const el = document.createElement('style')
    el.textContent = STYLES
    document.head.appendChild(el)
  }, [])

  const advance = () => {
    setExiting(true)
    setTimeout(() => {
      setCurrent(s => s === 'girl' ? 'john' : s === 'john' ? 'card' : 'girl')
      setExiting(false)
    }, 420)
  }

  const goTo = (s: Slide) => {
    if (s === current) return
    if (timerRef.current) clearInterval(timerRef.current)
    setExiting(true)
    setTimeout(() => { setCurrent(s); setExiting(false) }, 420)
    timerRef.current = setInterval(advance, 4000)
  }

  useEffect(() => {
    timerRef.current = setInterval(advance, 4000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bgAnim = exiting ? 'pw-bg-exit 0.42s ease forwards' : 'pw-bg-enter 0.42s ease forwards'
  const slideAnim = exiting ? 'pw-slide-exit 0.42s ease forwards' : 'pw-slide-enter 0.42s ease forwards'
  const cardSlideAnim = exiting ? 'pw-card-slide-exit 0.42s ease forwards' : 'pw-card-slide-enter 0.42s ease forwards'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: 'hidden',
      background: '#111',
    }}>

      {/* ── Background: girl.jpg (slide 1) ── */}
      {current === 'girl' && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/girl.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          animation: bgAnim,
          zIndex: 0,
        }} />
      )}

      {/* ── Background: john.jpg (slide 2) ── */}
      {current === 'john' && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/john.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          animation: bgAnim,
          zIndex: 0,
        }} />
      )}

      {/* ── Background: dark gradient (slide 3) ── */}
      {current === 'card' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #0d0d0d 0%, #1c1c1c 60%, #0a0a0a 100%)',
          animation: bgAnim,
          zIndex: 0,
        }} />
      )}

      {/* Always-on dark gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.65) 100%)',
        zIndex: 1,
      }} />

      {/* Wordmark */}
      <div style={{
        position: 'absolute', top: 52, left: 0, right: 0,
        textAlign: 'center',
        animation: 'pw-fade-in 0.6s ease 0.1s both',
        zIndex: 3,
      }}>
        <span style={{
          fontSize: 30, fontWeight: 800, color: '#fff',
          letterSpacing: '-0.04em', textShadow: '0 1px 8px rgba(0,0,0,0.5)',
        }}>NAN</span>
      </div>

      {/* Dot indicators */}
      <div style={{
        position: 'absolute', top: 62, right: 24,
        display: 'flex', gap: 6, alignItems: 'center',
        zIndex: 3,
      }}>
        {SLIDES.map(s => (
          <div
            key={s}
            onClick={() => goTo(s)}
            style={{
              width: current === s ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: current === s ? '#fff' : 'rgba(255,255,255,0.35)',
              transition: 'width 0.3s ease, background 0.3s ease',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      {/* Slide headline (photo slides) */}
      {(current === 'girl' || current === 'john') && (
        <div style={{
          position: 'absolute',
          bottom: 170, left: 24, right: 24,
          animation: slideAnim,
          zIndex: 2,
        }}>
          <div style={{
            fontSize: 32, fontWeight: 800, color: '#fff',
            letterSpacing: '-0.03em', lineHeight: 1.1,
            textShadow: '0 2px 16px rgba(0,0,0,0.5)',
            marginBottom: 6,
          }}>
            {current === 'girl' ? 'Send USDC\ninstantly.' : 'Your money,\nyour control.'}
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>
            {current === 'girl' ? 'The intelligent payment layer' : 'Powered by Circle & Arc'}
          </div>
        </div>
      )}

      {/* Slide 3: payment card */}
      {current === 'card' && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          animation: cardSlideAnim,
          zIndex: 2,
          width: 'min(300px, calc(100vw - 48px))',
        }}>
          <div style={{
            width: '100%', aspectRatio: '1.586',
            background: 'linear-gradient(135deg, #3a3a3d 0%, #1c1c1f 45%, #050505 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            boxShadow: '0 32px 72px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.45)',
            padding: '22px 26px',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 20%, transparent 40%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <span style={{ fontSize: 19, fontWeight: 800, fontStyle: 'italic', color: '#fff', letterSpacing: '-0.2px', transform: 'rotate(-5deg)', transformOrigin: 'left top', textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>NAN</span>
              <div style={{ width: 34, height: 26, borderRadius: 5, background: 'linear-gradient(155deg, #f2f2f2 0%, #c9c9c9 50%, #9a9a9a 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.35)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.2)' }} />
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.2)' }} />
              </div>
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 13, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>····  ····  ····  4291</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card holder</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>NAN User</div>
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

      {/* Bottom CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 20px 52px',
        zIndex: 3,
        animation: 'pw-fade-up 0.6s ease 0.5s both',
      }}>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%', height: 58,
            background: '#ffffff', color: '#0d0d0d',
            border: 'none', borderRadius: 30,
            fontSize: 17, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer',
            letterSpacing: '-0.2px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            marginBottom: 12,
          }}
        >
          Get started
        </button>
        <button
          onClick={() => setActiveView('login')}
          style={{
            width: '100%', height: 50,
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 30,
            fontSize: 15, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          I already have an account
        </button>
      </div>
    </div>
  )
}
