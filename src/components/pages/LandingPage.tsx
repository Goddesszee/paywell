import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { ArrowRight, Shield, Zap, Globe, Bot, ArrowUpRight, ArrowDownLeft, ArrowUpDown } from 'lucide-react'

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
  { icon: <Zap size={16} />, title: 'Instant payments', desc: 'Sub-second USDC transfers on Arc Testnet.' },
  { icon: <Globe size={16} />, title: 'Cross-chain bridge', desc: 'Move USDC across 10+ chains via CCTP.' },
  { icon: <Bot size={16} />, title: 'AI agent', desc: 'Autonomous spending with custom limits.' },
  { icon: <Shield size={16} />, title: 'Non-custodial', desc: 'Your keys, your funds. Always.' },
]

export function LandingPage() {
  const setActiveView = useAppStore(s => s.setActiveView)
  const [slide, setSlide] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goSlide = (i: number) => {
    if (i === slide) return
    setFading(true)
    setTimeout(() => { setSlide(i); setFading(false) }, 350)
    if (timerRef.current) clearInterval(timerRef.current as unknown as number)
    timerRef.current = setInterval(advanceSlide, 5000)
  }

  const advanceSlide = () => {
    setFading(true)
    setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setFading(false) }, 350)
  }

  useEffect(() => {
    timerRef.current = setInterval(advanceSlide, 5000)
    return () => { if (timerRef.current) clearInterval(timerRef.current as unknown as number) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cur = SLIDES[slide]

  return (
    <div style={{
      minHeight: '100dvh', background: '#08090B',
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: '#F2F3F5', display: 'flex', flexDirection: 'column',
      overflowX: 'hidden',
    }}>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
        {/* Photo */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `url(${cur.img})`,
          backgroundSize: 'cover', backgroundPosition: 'center top',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.35s ease',
        }} />
        {/* Gradient overlay — heavy at top and bottom, clear in middle */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(180deg, rgba(8,9,11,0.85) 0%, rgba(8,9,11,0.15) 40%, rgba(8,9,11,0.10) 60%, rgba(8,9,11,0.92) 100%)',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

        {/* Hero text */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
          padding: '0 24px 40px',
          opacity: fading ? 0 : 1, transition: 'opacity 0.35s ease',
        }}>
          <h1 style={{
            fontSize: 'clamp(30px,8vw,40px)', fontWeight: 800, lineHeight: 1.05,
            letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: 10,
            whiteSpace: 'pre-line',
          }}>{cur.headline}</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginBottom: 28, lineHeight: 1.55 }}>
            {cur.sub}
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setActiveView('onboarding')}
              style={{
                width: '100%', height: 54,
                background: '#0066FF', color: '#fff', border: 'none',
                borderRadius: 14, fontSize: 16, fontWeight: 700,
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
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 14, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(8px)',
              }}
            >
              I already have an account
            </button>
          </div>
        </div>
      </section>

      {/* ── WHAT IS NAN ── */}
      <section style={{ padding: '56px 24px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0066FF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The platform</span>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: '#FFFFFF', marginTop: 6, lineHeight: 1.1 }}>
            A global payment layer for people, businesses and AI.
          </h2>
          <p style={{ fontSize: 14, color: '#8A8F9E', marginTop: 12, lineHeight: 1.65 }}>
            nan is a stablecoin-native payment platform built on Arc — where USDC is the native gas token. No conversion fees. No slow settlement. Just money that works.
          </p>
        </div>

        {/* Feature grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: '#13151A', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '16px 14px',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0066FF', marginBottom: 10,
              }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F2F3F5', marginBottom: 3 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: '#8A8F9E', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ── */}
      <section style={{ padding: '0 24px 56px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#0066FF', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Wallet</span>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', color: '#FFFFFF', marginTop: 6, marginBottom: 20, lineHeight: 1.2 }}>
          Your digital money account.
        </h2>

        {/* Mock wallet card */}
        <div style={{
          background: 'linear-gradient(145deg, #0E1014 0%, #13151A 60%, #0D0F13 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20, padding: '22px 22px', marginBottom: 12,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,102,255,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Total Balance</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: '#FFFFFF', marginBottom: 14 }}>
            1,204.00 <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>USDC</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { Icon: ArrowUpRight, label: 'Send', color: '#0066FF' },
              { Icon: ArrowDownLeft, label: 'Receive', color: '#00C853' },
              { Icon: ArrowUpDown, label: 'Swap', color: '#8A8F9E' },
            ].map(({ Icon, label, color }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 4px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                <Icon size={16} color={color} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#50556A', textAlign: 'center' }}>Running on Arc Testnet · Powered by Circle USDC</p>
      </section>

      {/* ── AGENT SECTION ── */}
      <section style={{
        margin: '0 16px 48px', maxWidth: 448,
        background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.18)',
        borderRadius: 20, padding: '24px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0066FF' }}>NAN AI Agent</div>
            <div style={{ fontSize: 11, color: '#8A8F9E' }}>Autonomous payments</div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: '#8A8F9E', lineHeight: 1.6, marginBottom: 16 }}>
          Set spending rules. Let your AI agent shop, pay and transact on your behalf — with full transparency.
        </p>
        <button
          onClick={() => setActiveView('onboarding')}
          style={{
            width: '100%', height: 44, background: '#0066FF', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          Set up your agent <ArrowRight size={16} />
        </button>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: '#0066FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 324 480" width="9" height="12" fill="none">
              <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
              <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.04em', color: '#F2F3F5' }}>nan</span>
        </div>
        <p style={{ fontSize: 11, color: '#50556A', textAlign: 'center' }}>
          Arc Testnet · Circle USDC · Built with Arc Studio
        </p>
      </footer>
    </div>
  )
}
