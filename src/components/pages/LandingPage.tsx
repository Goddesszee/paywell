import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'

const SLIDES = [
  {
    img: '/girl.jpg',
    headline: 'Money that moves',
    accent: 'at the speed of now.',
    sub: 'Send, receive and swap USDC instantly — no banks, no borders.',
  },
  {
    img: '/john.jpg',
    headline: 'Your money,',
    accent: 'your control.',
    sub: 'Non-custodial wallets. You own your keys and your funds.',
  },
]

const F = "'Inter', -apple-system, sans-serif"

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const [slide, setSlide] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 769px)') : null
  const [isDesktop, setIsDesktop] = useState(mq ? mq.matches : false)

  useEffect(() => {
    if (!mq) return
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (i: number) => {
    setFading(true)
    setTimeout(() => { setSlide(i); setFading(false) }, 300)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(advance, 6000)
  }

  const advance = () => go((slide + 1) % SLIDES.length)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setFading(true)
      setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setFading(false) }, 300)
    }, 6000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = SLIDES[slide]

  // ── MOBILE — dark bg, text top, photo in rounded frame, CTAs below ─────────
  if (!isDesktop) {
    return (
      <div style={{
        position: 'fixed', inset: 0, fontFamily: F,
        background: '#0A0A0F',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 24px 0' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
        </div>

        {/* Headline */}
        <div style={{ padding: '28px 24px 20px', opacity: fading ? 0 : 1, transition: 'opacity 0.3s' }}>
          <h1 style={{ fontSize: 'clamp(28px,8vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#fff', margin: 0 }}>
            {cur.headline}
          </h1>
          <h1 style={{ fontSize: 'clamp(28px,8vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', color: '#0066FF', margin: '0 0 10px' }}>
            {cur.accent}
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, margin: 0 }}>{cur.sub}</p>
        </div>

        {/* Photo in rounded frame */}
        <div style={{ padding: '0 20px', flex: 1, minHeight: 0 }}>
          <div style={{
            borderRadius: 28,
            overflow: 'hidden',
            width: '100%',
            aspectRatio: '4/5',
            opacity: fading ? 0 : 1,
            transition: 'opacity 0.3s ease',
          }}>
            <img
              src={cur.img}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }}
            />
          </div>
        </div>

        {/* Slide dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 0 8px' }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => go(i)} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, background: i === slide ? '#0066FF' : 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }} />
          ))}
        </div>

        {/* CTAs */}
        <div style={{ padding: '8px 24px calc(env(safe-area-inset-bottom,0px) + 28px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setActiveView('login')} style={{ width: '100%', height: 54, background: '#0066FF', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            Get started <ArrowRight size={18} />
          </button>
          <button onClick={() => setActiveView('login')} style={{ width: '100%', height: 50, background: 'transparent', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            I already have an account
          </button>
        </div>
      </div>
    )
  }

  // ── DESKTOP — dark bg, left: text + CTAs, right: photo in rounded frame ────
  return (
    <div style={{
      position: 'fixed', inset: 0, fontFamily: F,
      background: '#0A0A0F',
      display: 'flex', alignItems: 'center',
    }}>
      {/* Left panel */}
      <div style={{ flex: '0 0 46%', display: 'flex', flexDirection: 'column', padding: '0 0 0 72px', justifyContent: 'center' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 52 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,102,255,0.45)' }}>
            <svg viewBox="0 0 324 480" width="14" height="20" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
        </div>

        {/* Headline */}
        <div style={{ opacity: fading ? 0 : 1, transition: 'opacity 0.3s' }}>
          <h1 style={{ fontSize: 'clamp(32px,3.6vw,58px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', color: '#fff', margin: 0 }}>
            {cur.headline}
          </h1>
          <h1 style={{ fontSize: 'clamp(32px,3.6vw,58px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', color: '#0066FF', margin: '0 0 18px' }}>
            {cur.accent}
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.50)', lineHeight: 1.65, marginBottom: 36, maxWidth: 380 }}>{cur.sub}</p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
            <button onClick={() => setActiveView('login')} style={{ padding: '13px 28px', borderRadius: 50, background: '#0066FF', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 20px rgba(0,102,255,0.40)' }}>
              Get started <ArrowRight size={16} />
            </button>
            <button onClick={() => setActiveView('login')} style={{ padding: '13px 28px', borderRadius: 50, background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.80)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              Sign in
            </button>
          </div>
        </div>

        {/* Slide dots + arrows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => go(i)} style={{ width: i === slide ? 24 : 8, height: 8, borderRadius: 4, background: i === slide ? '#0066FF' : 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([{ Icon: ChevronLeft, dir: -1 }, { Icon: ChevronRight, dir: 1 }] as const).map(({ Icon, dir }) => (
              <button
                key={dir}
                onClick={() => go((slide + dir + SLIDES.length) % SLIDES.length)}
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — photo in rounded frame */}
      <div style={{ flex: '0 0 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 56px 40px 32px' }}>
        <div style={{
          borderRadius: 36,
          overflow: 'hidden',
          width: '100%',
          maxWidth: 520,
          aspectRatio: '3/4',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.3s ease',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}>
          <img
            src={cur.img}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }}
          />
        </div>
      </div>
    </div>
  )
}
