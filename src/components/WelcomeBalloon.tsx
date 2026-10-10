/**
 * WelcomeBalloon — full-screen celebration overlay shown once per login.
 * Triggered by appStore.showWelcome = true, dismissed on tap or after 5s.
 * Works for all auth types: email, passkey, wagmi wallet.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'

const MONO = "'JetBrains Mono', Menlo, monospace"
const F    = "'Inter', -apple-system, sans-serif"

const FLOATERS = [
  { emoji: '🎈', x: 6,  y: 8,  size: 52, delay: 0.0, dur: 3.2 },
  { emoji: '🎉', x: 20, y: 4,  size: 40, delay: 0.3, dur: 2.8 },
  { emoji: '🎊', x: 72, y: 7,  size: 46, delay: 0.5, dur: 3.5 },
  { emoji: '🎈', x: 88, y: 15, size: 54, delay: 0.1, dur: 2.9 },
  { emoji: '✨', x: 50, y: 3,  size: 36, delay: 0.7, dur: 2.6 },
  { emoji: '🌟', x: 36, y: 74, size: 34, delay: 0.4, dur: 3.1 },
  { emoji: '💫', x: 62, y: 70, size: 40, delay: 0.2, dur: 2.7 },
  { emoji: '🎈', x: 12, y: 68, size: 44, delay: 0.6, dur: 3.3 },
  { emoji: '🥳', x: 82, y: 62, size: 42, delay: 0.8, dur: 2.5 },
  { emoji: '🎉', x: 92, y: 38, size: 36, delay: 0.9, dur: 3.0 },
  { emoji: '✨', x: 3,  y: 44, size: 30, delay: 1.1, dur: 2.4 },
  { emoji: '🎊', x: 46, y: 82, size: 38, delay: 1.0, dur: 2.9 },
  { emoji: '🎈', x: 30, y: 20, size: 34, delay: 1.3, dur: 3.4 },
  { emoji: '🌟', x: 75, y: 30, size: 32, delay: 0.6, dur: 2.8 },
]

const CONFETTI_COLORS = [
  '#0066FF','#00C853','#FF6B35','#FFD600',
  '#E040FB','#00BCD4','#FF4081','#69F0AE',
]

export function WelcomeBalloon() {
  const { showWelcome, setShowWelcome, auth, nanHandle } = useAppStore()
  const [visible, setVisible] = useState(false)
  const [cardIn,  setCardIn]  = useState(false)
  const [fading,  setFading]  = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const dismiss = useCallback(() => {
    setFading(true); setCardIn(false)
    const t = setTimeout(() => { setVisible(false); setFading(false); setShowWelcome(false) }, 400)
    timers.current.push(t)
  }, [setShowWelcome])

  // showWelcome toggling is an external event — syncing animation state to it is
  // exactly the use-case for useEffect.
  useEffect(() => {
    if (!showWelcome) return
    timers.current.forEach(clearTimeout); timers.current = []
    setFading(false); setCardIn(false); setVisible(true)
    const t1 = setTimeout(() => setCardIn(true), 60)
    const t2 = setTimeout(() => dismiss(), 5500)
    timers.current.push(t1, t2)
    return () => { timers.current.forEach(clearTimeout) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome])

  if (!visible) return null

  const name = nanHandle
    ? `@${nanHandle}`
    : auth?.email?.includes('@')
      ? auth.email.split('@')[0]
      : 'friend'

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(4,8,20,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.4s ease',
        overflow: 'hidden',
      }}
    >
      {/* Confetti rain */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: 45 }).map((_, i) => {
          const x     = 2 + (i * 2.2) % 96
          const delay = (i * 0.13) % 3.2
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
          const w     = 4 + (i % 5) * 2
          const h     = w * 0.45
          return (
            <rect key={i}
              x={`${x}%`} y="-20"
              width={w} height={h} rx="1"
              fill={color}
              style={{
                animation: `wb-confetti ${2.2 + delay * 0.4}s ease-in ${delay}s infinite`,
                opacity: 0.9,
              }}
            />
          )
        })}
        <style>{`@keyframes wb-confetti{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(800deg);opacity:0}}`}</style>
      </svg>

      {/* Floating balloons */}
      {FLOATERS.map((f, i) => (
        <span key={i} style={{
          position: 'absolute',
          left: `${f.x}%`, top: `${f.y}%`,
          fontSize: f.size,
          pointerEvents: 'none', userSelect: 'none',
          animation: `wb-float ${f.dur}s ease-in-out ${f.delay}s infinite alternate`,
          filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))',
        }}>{f.emoji}</span>
      ))}

      {/* Hero card */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'linear-gradient(155deg, #08102A 0%, #0D1A40 55%, #08102A 100%)',
        border: '1.5px solid rgba(0,102,255,0.4)',
        borderRadius: 32,
        padding: '48px 36px 36px',
        maxWidth: 340, width: '88%',
        textAlign: 'center',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 100px rgba(0,102,255,0.45)',
        transform: cardIn ? 'scale(1) translateY(0)' : 'scale(0.6) translateY(50px)',
        opacity: cardIn ? 1 : 0,
        transition: 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease',
      }}>
        {/* Animated glow border */}
        <div style={{
          position: 'absolute', inset: -1, borderRadius: 33,
          background: 'linear-gradient(135deg, rgba(0,102,255,0.5), rgba(0,200,83,0.15), rgba(0,102,255,0.5))',
          zIndex: -1,
          animation: 'wb-glow 2.5s ease-in-out infinite alternate',
        }} />

        {/* Big emoji */}
        <div style={{ fontSize: 70, lineHeight: 1, marginBottom: 8, animation: 'wb-bounce 0.9s ease-in-out 0.4s 3' }}>
          🎉
        </div>

        {/* Welcome to NAN */}
        <div style={{
          fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase', letterSpacing: '0.14em',
          marginBottom: 6, fontFamily: F,
        }}>
          Welcome to
        </div>
        <div style={{
          fontSize: 48, fontWeight: 900, lineHeight: 1,
          letterSpacing: '-0.05em', marginBottom: 6,
          fontFamily: MONO,
          background: 'linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          NAN
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.45)',
          fontFamily: F, marginBottom: 22, lineHeight: 1.5,
        }}>
          Your USDC wallet for everyone
        </div>

        {/* Name badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,102,255,0.18)',
          border: '1px solid rgba(0,102,255,0.4)',
          borderRadius: 50, padding: '9px 20px',
          marginBottom: 24,
        }}>
          <span style={{ fontSize: 20 }}>👋</span>
          <span style={{
            fontSize: 16, fontWeight: 700, color: '#fff',
            fontFamily: nanHandle ? MONO : F,
          }}>
            Hey, {name}!
          </span>
        </div>

        {/* Feature pills */}
        <div style={{
          display: 'flex', gap: 7, justifyContent: 'center',
          flexWrap: 'wrap', marginBottom: 28,
        }}>
          {['Send USDC','Bridge','Swap','AI Agent','NAN Names'].map(tag => (
            <span key={tag} style={{
              fontSize: 11, fontWeight: 600,
              color: 'rgba(255,255,255,0.55)',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20, padding: '4px 12px',
              fontFamily: F,
            }}>{tag}</span>
          ))}
        </div>

        {/* CTA button */}
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          style={{
            width: '100%', padding: '15px',
            background: 'linear-gradient(135deg, #0066FF 0%, #0044CC 100%)',
            border: 'none', borderRadius: 16,
            color: '#fff', fontSize: 16, fontWeight: 800,
            cursor: 'pointer', fontFamily: F,
            letterSpacing: '-0.02em',
            boxShadow: '0 10px 30px rgba(0,102,255,0.55)',
          }}
        >
          Let's go 🚀
        </button>

        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.2)',
          marginTop: 14, fontFamily: F,
        }}>
          Tap anywhere to continue
        </div>
      </div>

      <style>{`
        @keyframes wb-float {
          from { transform: translateY(0px) rotate(-8deg) scale(1); }
          to   { transform: translateY(-24px) rotate(8deg) scale(1.07); }
        }
        @keyframes wb-bounce {
          0%,100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-14px) scale(1.1); }
        }
        @keyframes wb-glow {
          from { opacity: 0.5; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
