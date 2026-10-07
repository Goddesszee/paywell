import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'

const F    = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
const BLUE = '#0066FF'
const BG   = '#FFFFFF'
const TEXT = '#1A1A2E'
const T2   = '#6B7280'
const DOTS_INACTIVE = '#D0D0E0'

const SLIDES = [
  {
    img:      '/john.jpg',
    accent:   'Your money,',
    headline: ' your agent, your rules.',
    sub:      'NAN gives your AI agent a real wallet — funded by you, limited by you, working for you.',
  },
  {
    img:      '/girl.jpg',
    accent:   'USDC payments',
    headline: ' handled by AI, controlled by you.',
    sub:      'Set limits, approve services and watch NAN Agent handle the rest — on Arc, Base, and beyond.',
  },
]

/* ── Slide dot bar ─────────────────────────────────────────────────────────── */
function Dots({ total, active, go, inactiveBg }: {
  total: number; active: number
  go: (i: number) => void
  inactiveBg: string
}) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => go(i)}
          style={{
            height: 4, borderRadius: 2,
            width: i === active ? 28 : 20,
            background: i === active ? BLUE : inactiveBg,
            border: 'none', cursor: 'pointer', padding: 0,
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */
export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const [slide, setSlide]   = useState(0)
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
    setTimeout(() => { setSlide(i); setFading(false) }, 250)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => advance_(), 6000)
  }

  const advance_ = () => {
    setSlide(s => {
      const next = (s + 1) % SLIDES.length
      setFading(true)
      setTimeout(() => setFading(false), 250)
      return next
    })
  }

  useEffect(() => {
    timerRef.current = setInterval(advance_, 6000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur     = SLIDES[slide]
  const gradBot = 'linear-gradient(0deg, rgba(255,255,255,0.25) 0%, transparent 100%)'

  /* ── MOBILE ── */
  if (!isDesktop) {
    return (
      <div style={{
        position: 'fixed', inset: 0, fontFamily: F,
        background: BG,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', height: '100dvh',
      }}>
        {/* Top: logo left + dots right on same row */}
        <div style={{ padding: '16px 24px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            {/* NAN logo top-left */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: BLUE, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 324 480" width="17" height="24" fill="none">
                  <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
                  <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
                </svg>
              </div>
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em', color: TEXT }}>NAN</span>
            </div>
            {/* Dots top-right */}
            <Dots total={SLIDES.length} active={slide} go={go} inactiveBg={DOTS_INACTIVE} />
          </div>
          <h1 style={{
            fontSize: 'clamp(24px,7vw,32px)', fontWeight: 900,
            lineHeight: 1.1, letterSpacing: '-0.03em',
            color: TEXT, margin: 0,
          }}>
            <span style={{ color: BLUE }}>{cur.accent}</span>
            {cur.headline}
          </h1>
        </div>

        {/* Middle: photo — fills remaining space, no card */}
        <div style={{
          position: 'relative', flex: 1, overflow: 'hidden',
          opacity: fading ? 0 : 1, transition: 'opacity 0.25s',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${cur.img})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 10%',
          }} />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
            background: gradBot,
          }} />
        </div>

        {/* Bottom: CTAs */}
        <div style={{
          background: BG, flexShrink: 0,
          padding: `16px 24px calc(env(safe-area-inset-bottom,0px) + 16px)`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <button
            onClick={() => setActiveView('login')}
            style={{
              width: '100%', height: 52,
              background: BLUE, color: '#fff',
              border: 'none', borderRadius: 16,
              fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: F,
              boxShadow: '0 6px 24px rgba(0,102,255,0.40)',
              letterSpacing: '-0.01em',
            }}
          >
            Sign up
          </button>
          <button
            onClick={() => setActiveView('login')}
            style={{
              width: '100%', height: 44,
              background: 'transparent', color: BLUE,
              border: 'none', borderRadius: 16,
              fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            Log in
          </button>
        </div>
      </div>
    )
  }

  /* ── DESKTOP ── */
  return (
    <div style={{
      position: 'fixed', inset: 0, fontFamily: F,
      background: BG,
      display: 'flex', alignItems: 'stretch',
    }}>
      {/* Left panel — text + CTAs */}
      <div style={{
        width: '42%', minWidth: 360,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px 56px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 56 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 324 480" width="14" height="20" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em', color: TEXT }}>nan</span>
        </div>

        <Dots total={SLIDES.length} active={slide} go={go} inactiveBg={DOTS_INACTIVE} />

        <h1 style={{
          fontSize: 'clamp(32px,3.2vw,52px)', fontWeight: 900,
          lineHeight: 1.1, letterSpacing: '-0.04em',
          color: TEXT, margin: '0 0 18px',
          opacity: fading ? 0 : 1, transition: 'opacity 0.25s',
        }}>
          <span style={{ color: BLUE }}>{cur.accent}</span>
          {cur.headline}
        </h1>

        <p style={{
          fontSize: 16, color: T2,
          lineHeight: 1.65, marginBottom: 40, maxWidth: 380,
          opacity: fading ? 0 : 1, transition: 'opacity 0.25s',
        }}>
          {cur.sub}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 }}>
          <button
            onClick={() => setActiveView('login')}
            style={{
              height: 54, background: BLUE, color: '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: F,
              boxShadow: '0 6px 24px rgba(0,102,255,0.35)',
            }}
          >
            Sign up
          </button>
          <button
            onClick={() => setActiveView('login')}
            style={{
              height: 50, background: 'transparent', color: BLUE,
              border: `1.5px solid ${BLUE}`, borderRadius: 14,
              fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            Log in
          </button>
        </div>
      </div>

      {/* Right panel — photo only, no card */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        borderTopLeftRadius: 40, borderBottomLeftRadius: 40,
        opacity: fading ? 0 : 1, transition: 'opacity 0.25s',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.30) 100%)',
        }} />
      </div>
    </div>
  )
}
