import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ArrowRight } from 'lucide-react'

const SLIDES = [
  {
    img: '/girl.jpg',
    headline: 'Money that moves\nat the speed of now.',
    sub: 'Send, receive and swap USDC instantly — no banks, no borders.',
  },
  {
    img: '/john.jpg',
    headline: 'Your money,\nyour control.',
    sub: 'Non-custodial wallets. You own your keys and your funds.',
  },
]

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const [slide, setSlide] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const advanceSlide = () => {
    setFading(true)
    setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setFading(false) }, 350)
  }

  const goSlide = (i: number) => {
    if (i === slide) return
    setFading(true)
    setTimeout(() => { setSlide(i); setFading(false) }, 350)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(advanceSlide, 5000)
  }

  useEffect(() => {
    timerRef.current = setInterval(advanceSlide, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = SLIDES[slide]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflow: 'hidden',
    }}>
      {/* Full-bleed photo */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${cur.img})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s ease',
      }} />

      {/* Gradient: dark top + dark bottom, photo shows through middle */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(8,9,11,0.80) 0%, rgba(8,9,11,0.05) 35%, rgba(8,9,11,0.05) 60%, rgba(8,9,11,0.94) 100%)',
      }} />

      {/* Top bar — logo + dots */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px',
      }}>
        {/* NAN logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: '#0066FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
        </div>

        {/* Slide dots */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goSlide(i)} style={{
              width: i === slide ? 20 : 6, height: 6, borderRadius: 3,
              background: i === slide ? '#fff' : 'rgba(255,255,255,0.35)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      {/* Bottom — headline + CTAs */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '0 24px calc(env(safe-area-inset-bottom, 0px) + 36px)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s ease',
      }}>
        <h1 style={{
          fontSize: 'clamp(30px, 8vw, 42px)',
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: '#FFFFFF',
          marginBottom: 10,
          whiteSpace: 'pre-line',
        }}>{cur.headline}</h1>

        <p style={{
          fontSize: 15,
          color: 'rgba(255,255,255,0.72)',
          marginBottom: 28,
          lineHeight: 1.55,
        }}>{cur.sub}</p>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setActiveView('onboarding')}
            style={{
              width: '100%', height: 54,
              background: '#0066FF', color: '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: '-0.01em',
            }}
          >
            Get started <ArrowRight size={18} />
          </button>
          <button
            onClick={() => setActiveView('login')}
            style={{
              width: '100%', height: 50,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 14, fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              backdropFilter: 'blur(10px)',
            }}
          >
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )
}
