import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ArrowRight } from 'lucide-react'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

const SLIDES = [
  {
    img: '/girl.jpg',
    headline: 'Money that moves\nat the speed of now.',
    sub: 'Send, receive and swap USDC instantly — no banks, no borders.',
    accent: '#0066FF',
  },
  {
    img: '/john.jpg',
    headline: 'Your money,\nyour control.',
    sub: 'Non-custodial wallets. You own your keys and your funds.',
    accent: '#0066FF',
  },
]

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

  return (
    <>
      {/* ── MOBILE layout (< 769px) ── */}
      <div style={{
        position: 'fixed', inset: 0,
        fontFamily: F, overflow: 'hidden',
        display: 'block',
      }} className="nan-landing-mobile">

        {/* Full-bleed photo */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover', backgroundPosition: 'center top',
          opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
        }} />

        {/* Overlay gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(8,9,11,0.75) 0%, rgba(8,9,11,0.05) 30%, rgba(8,9,11,0.15) 50%, rgba(8,9,11,0.72) 70%, rgba(8,9,11,0.97) 100%)',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NanMark />
            </div>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
          </div>
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

        {/* Bottom CTAs */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
          padding: '0 24px calc(env(safe-area-inset-bottom, 0px) + 36px)',
          opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
        }}>
          <h1 style={{
            fontSize: 'clamp(30px, 8vw, 42px)', fontWeight: 800,
            lineHeight: 1.05, letterSpacing: '-0.03em', color: '#FFFFFF',
            marginBottom: 10, whiteSpace: 'pre-line',
            textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8)',
          }}>{cur.headline}</h1>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.90)',
            marginBottom: 28, lineHeight: 1.55,
            textShadow: '0 1px 8px rgba(0,0,0,0.7)',
          }}>{cur.sub}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => setActiveView('login')} style={mobileBtn(BLUE, '#fff')}>
              Get started <ArrowRight size={18} />
            </button>
            <button onClick={() => setActiveView('login')} style={mobileBtn('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.18)')}>
              I already have an account
            </button>
          </div>
        </div>
      </div>

      {/* ── DESKTOP layout (≥ 769px) ── */}
      <div style={{
        position: 'fixed', inset: 0,
        fontFamily: F, display: 'none',
        background: '#08090B',
      }} className="nan-landing-desktop">

        {/* Left panel — dark with content */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: '48%', zIndex: 10,
          display: 'flex', flexDirection: 'column',
          padding: '0 64px',
          background: 'linear-gradient(135deg, #0a0c12 0%, #0d1020 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 40, marginBottom: 'auto' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: BLUE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0,102,255,0.4)' }}>
              <NanMark size={22} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
          </div>

          {/* Headline area — vertically centred */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>

            {/* Tag */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.25)',
              borderRadius: 50, padding: '5px 14px', marginBottom: 28, alignSelf: 'flex-start',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(100,140,255,0.9)', letterSpacing: '0.04em' }}>
                Powered by Circle USDC · Arc Testnet
              </span>
            </div>

            <h1 style={{
              fontSize: 'clamp(38px, 3.5vw, 56px)', fontWeight: 800,
              lineHeight: 1.04, letterSpacing: '-0.04em', color: '#FFFFFF',
              marginBottom: 20, whiteSpace: 'pre-line',
              opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
            }}>{cur.headline}</h1>

            <p style={{
              fontSize: 18, color: 'rgba(255,255,255,0.65)',
              marginBottom: 44, lineHeight: 1.65, maxWidth: 420,
              opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
            }}>{cur.sub}</p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
              <button onClick={() => setActiveView('login')} style={{
                height: 52, padding: '0 32px',
                background: BLUE, color: '#fff', border: 'none',
                borderRadius: 14, fontSize: 16, fontWeight: 700,
                cursor: 'pointer', fontFamily: F,
                display: 'flex', alignItems: 'center', gap: 9,
                letterSpacing: '-0.01em',
                boxShadow: '0 4px 24px rgba(0,102,255,0.45)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}>
                Get started <ArrowRight size={17} />
              </button>
              <button onClick={() => setActiveView('login')} style={{
                height: 52, padding: '0 28px',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.80)',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14,
                fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F,
                letterSpacing: '-0.01em', backdropFilter: 'blur(10px)',
              }}>
                Sign in
              </button>
            </div>

            {/* Feature pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['Instant USDC', 'Non-custodial', 'AI Agent', 'No borders'].map(tag => (
                <span key={tag} style={{
                  padding: '5px 12px', borderRadius: 50,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 500,
                }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* Slide dots */}
          <div style={{ display: 'flex', gap: 7, paddingBottom: 36, alignItems: 'center' }}>
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
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: '52%',
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.35s ease',
        }}>
          {/* Subtle inner shadow on left edge */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, rgba(10,12,18,0.35) 0%, transparent 25%)',
          }} />
        </div>
      </div>

      {/* CSS to switch between mobile/desktop */}
      <style>{`
        @media (min-width: 769px) {
          .nan-landing-mobile { display: none !important; }
          .nan-landing-desktop { display: block !important; }
        }
        @media (max-width: 768px) {
          .nan-landing-mobile { display: block !important; }
          .nan-landing-desktop { display: none !important; }
        }
      `}</style>
    </>
  )
}

function NanMark({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 324 480" width={size * 0.675} height={size} fill="none">
      <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
      <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
    </svg>
  )
}

function mobileBtn(bg: string, color: string, borderColor?: string): React.CSSProperties {
  return {
    width: '100%', height: 54, background: bg, color,
    border: borderColor ? `1px solid ${borderColor}` : 'none',
    borderRadius: 14, fontSize: 16, fontWeight: 700,
    cursor: 'pointer', fontFamily: F,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    letterSpacing: '-0.01em', backdropFilter: borderColor ? 'blur(10px)' : undefined,
  }
}

import React from 'react'
