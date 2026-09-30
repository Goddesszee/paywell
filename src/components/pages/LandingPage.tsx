import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ArrowRight, Zap, Shield, Bot, Globe } from 'lucide-react'

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

const FEATURES = [
  { Icon: Zap,    label: 'Instant USDC' },
  { Icon: Shield, label: 'Non-custodial' },
  { Icon: Bot,    label: 'AI Agent' },
  { Icon: Globe,  label: 'No borders' },
]

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const [slide, setSlide]   = useState(0)
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

  // ── MOBILE layout (unchanged) ───────────────────────────────────────────────
  const mobileLayout = (
    <div style={{ position: 'fixed', inset: 0, fontFamily: F, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${cur.img})`,
        backgroundSize: 'cover', backgroundPosition: 'center top',
        opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg,rgba(8,9,11,0.75) 0%,rgba(8,9,11,0.05) 30%,rgba(8,9,11,0.15) 50%,rgba(8,9,11,0.72) 70%,rgba(8,9,11,0.97) 100%)',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goSlide(i)} style={{
              width: i === slide ? 20 : 6, height: 6, borderRadius: 3,
              background: i === slide ? '#fff' : 'rgba(255,255,255,0.35)',
              border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '0 24px calc(env(safe-area-inset-bottom,0px) + 36px)',
        opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
      }}>
        <h1 style={{
          fontSize: 'clamp(30px,8vw,42px)', fontWeight: 800, lineHeight: 1.05,
          letterSpacing: '-0.03em', color: '#fff', marginBottom: 10,
          whiteSpace: 'pre-line', textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>{cur.headline}</h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.90)', marginBottom: 28, lineHeight: 1.55, textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>{cur.sub}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setActiveView('login')} style={{
            width: '100%', height: 54, background: BLUE, color: '#fff',
            border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', fontFamily: F,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Get started <ArrowRight size={18} />
          </button>
          <button onClick={() => setActiveView('login')} style={{
            width: '100%', height: 50,
            background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14,
            fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F,
            backdropFilter: 'blur(10px)',
          }}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )

  // ── DESKTOP layout ──────────────────────────────────────────────────────────
  const desktopLayout = (
    <div style={{ position: 'fixed', inset: 0, fontFamily: F, display: 'flex', overflow: 'hidden' }}>

      {/* Left panel — dark, content */}
      <div style={{
        width: '46%', minWidth: 480, flexShrink: 0,
        background: '#08090B',
        display: 'flex', flexDirection: 'column',
        padding: '0 64px',
        position: 'relative', zIndex: 2,
        boxShadow: '8px 0 48px rgba(0,0,0,0.5)',
      }}>
        {/* Top — logo */}
        <div style={{ paddingTop: 40, paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 24px ${BLUE}55`,
            }}>
              <svg viewBox="0 0 324 480" width="16" height="22" fill="none">
                <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
          </div>
        </div>

        {/* Middle — headline + sub */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0 }}>
          {/* Pill badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.25)',
            borderRadius: 100, padding: '5px 14px', width: 'fit-content', marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, display: 'inline-block', boxShadow: `0 0 8px ${BLUE}` }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#7BA9FF', letterSpacing: '0.04em' }}>
              Powered by Circle · Arc Testnet
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(36px,3.5vw,52px)',
            fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-0.04em', color: '#fff',
            margin: 0, marginBottom: 20,
            whiteSpace: 'pre-line',
            opacity: fading ? 0 : 1, transition: 'opacity 0.35s',
          }}>{cur.headline}</h1>

          <p style={{
            fontSize: 17, color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6, marginBottom: 44, maxWidth: 400,
            opacity: fading ? 0 : 1, transition: 'opacity 0.35s',
          }}>{cur.sub}</p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
            <button onClick={() => setActiveView('login')} style={{
              height: 52, padding: '0 32px',
              background: BLUE, color: '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: `0 4px 24px ${BLUE}50`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}>
              Get started <ArrowRight size={18} />
            </button>
            <button onClick={() => setActiveView('login')} style={{
              height: 52, padding: '0 28px',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14, fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: F,
              backdropFilter: 'blur(10px)',
            }}>
              Sign in
            </button>
          </div>

          {/* Feature tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {FEATURES.map(({ Icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '7px 14px',
              }}>
                <Icon size={13} color="rgba(255,255,255,0.5)" />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — slide dots */}
        <div style={{ paddingBottom: 40, display: 'flex', gap: 8, alignItems: 'center' }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goSlide(i)} style={{
              width: i === slide ? 24 : 7, height: 7, borderRadius: 4,
              background: i === slide ? BLUE : 'rgba(255,255,255,0.2)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      {/* Right panel — full-bleed photo */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.35s ease',
          transform: 'scale(1.02)',
        }} />
        {/* subtle left-edge blend */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, rgba(8,9,11,0.35) 0%, transparent 25%)',
        }} />
        {/* subtle bottom darkening */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 60%, rgba(8,9,11,0.4) 100%)',
        }} />
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile — show below 769px */}
      <div style={{ display: 'block' }} className="landing-mobile">
        {mobileLayout}
      </div>
      {/* Desktop — show at 769px+ */}
      <div style={{ display: 'none' }} className="landing-desktop">
        {desktopLayout}
      </div>
      <style>{`
        @media (max-width: 768px) {
          .landing-desktop { display: none !important; }
          .landing-mobile  { display: block !important; }
        }
        @media (min-width: 769px) {
          .landing-mobile  { display: none !important; }
          .landing-desktop { display: block !important; }
        }
      `}</style>
    </>
  )
}
