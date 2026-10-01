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

  // ── MOBILE — unchanged full-screen photo ────────────────────────────────────
  if (!isDesktop) {
    return (
      <div style={{ position: 'fixed', inset: 0, fontFamily: F, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover', backgroundPosition: 'center top',
          opacity: fading ? 0 : 1, transition: 'opacity 0.3s ease',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg,rgba(8,9,11,0.75) 0%,rgba(8,9,11,0.05) 30%,rgba(8,9,11,0.15) 50%,rgba(8,9,11,0.72) 70%,rgba(8,9,11,0.97) 100%)',
        }} />
        {/* top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 324 480" width="13" height="18" fill="none">
                <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => go(i)} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, background: i === slide ? '#fff' : 'rgba(255,255,255,0.35)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }} />
            ))}
          </div>
        </div>
        {/* bottom */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: '0 24px calc(env(safe-area-inset-bottom,0px) + 36px)', opacity: fading ? 0 : 1, transition: 'opacity 0.3s' }}>
          <h1 style={{ fontSize: 'clamp(30px,8vw,42px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#fff', marginBottom: 4, whiteSpace: 'pre-line', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{cur.headline}</h1>
          <h1 style={{ fontSize: 'clamp(30px,8vw,42px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#0066FF', marginBottom: 10, whiteSpace: 'pre-line', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{cur.accent}</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.90)', marginBottom: 28, lineHeight: 1.55, textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>{cur.sub}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => setActiveView('login')} style={{ width: '100%', height: 54, background: '#0066FF', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '-0.01em' }}>
              Get started <ArrowRight size={18} />
            </button>
            <button onClick={() => setActiveView('login')} style={{ width: '100%', height: 50, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F, backdropFilter: 'blur(10px)' }}>
              I already have an account
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── DESKTOP — full-bleed photo with navbar overlay ─────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: F, overflow: 'hidden' }}>

      {/* Full-bleed photo */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${cur.img})`,
        backgroundSize: 'cover', backgroundPosition: 'center top',
        opacity: fading ? 0 : 1, transition: 'opacity 0.3s ease',
      }} />

      {/* Subtle dark overlay so text reads well */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(8,9,14,0.82) 0%, rgba(8,9,14,0.25) 40%, rgba(8,9,14,0.55) 100%)',
      }} />

      {/* ── Navbar ── */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
        background: 'rgba(10,11,18,0.75)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(0,102,255,0.5)' }}>
            <svg viewBox="0 0 324 480" width="14" height="20" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Products', 'Agents', 'Resources', 'Build'].map(link => (
            <button key={link} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 500, fontFamily: F, display: 'flex', alignItems: 'center', gap: 4, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
            >
              {link} {link !== 'Build' && <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>}
            </button>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setActiveView('login')}
            style={{ padding: '9px 20px', borderRadius: 50, background: '#0066FF', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Get started <ArrowRight size={14} />
          </button>
          <button
            onClick={() => setActiveView('login')}
            style={{ padding: '9px 20px', borderRadius: 50, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F, backdropFilter: 'blur(8px)' }}
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* ── Headline — bottom left ── */}
      <div style={{
        position: 'absolute', bottom: 80, left: 64, zIndex: 20, maxWidth: 560,
        opacity: fading ? 0 : 1, transition: 'opacity 0.3s',
      }}>
        <h1 style={{ fontSize: 'clamp(36px,4.5vw,64px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', color: '#ffffff', margin: 0, textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
          {cur.headline}
        </h1>
        <h1 style={{ fontSize: 'clamp(36px,4.5vw,64px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em', color: '#0066FF', margin: '0 0 16px', textShadow: '0 2px 24px rgba(0,102,255,0.4)' }}>
          {cur.accent}
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.80)', lineHeight: 1.6, marginBottom: 28, maxWidth: 420 }}>{cur.sub}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setActiveView('login')} style={{ padding: '13px 28px', borderRadius: 50, background: '#0066FF', border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 20px rgba(0,102,255,0.45)' }}>
            Get started <ArrowRight size={16} />
          </button>
          <button onClick={() => setActiveView('login')} style={{ padding: '13px 28px', borderRadius: 50, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F, backdropFilter: 'blur(8px)' }}>
            Sign in
          </button>
        </div>
      </div>

      {/* ── Slide dots — bottom left below headline ── */}
      <div style={{ position: 'absolute', bottom: 40, left: 64, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => go(i)} style={{ width: i === slide ? 24 : 8, height: 8, borderRadius: 4, background: i === slide ? '#0066FF' : 'rgba(255,255,255,0.35)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }} />
        ))}
      </div>

      {/* ── Prev / Next arrows — bottom right ── */}
      <div style={{ position: 'absolute', bottom: 32, right: 48, zIndex: 20, display: 'flex', gap: 10 }}>
        {[
          { Icon: ChevronLeft, dir: -1 },
          { Icon: ChevronRight, dir: 1 },
        ].map(({ Icon, dir }) => (
          <button
            key={dir}
            onClick={() => go((slide + dir + SLIDES.length) % SLIDES.length)}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}
