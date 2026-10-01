import { useState, useRef, useEffect } from 'react'
import { ArrowRight, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

export function NamePage() {
  const { setActiveView, profile, setProfile } = useAppStore()
  const [name, setName] = useState(profile.displayName || '')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter your name'); return }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return }
    setProfile({ ...profile, displayName: trimmed })
    setActiveView('home')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#08090B',
      fontFamily: F,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Back */}
      <button
        onClick={() => setActiveView('login')}
        style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontFamily: F, padding: 4 }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* NAN logo */}
      <div style={{ marginBottom: 36, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 324 480" width="15" height="20" fill="none">
            <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff"/>
            <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff"/>
          </svg>
        </div>
        <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: '#fff' }}>nan</span>
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 32, maxWidth: 320 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 8, lineHeight: 1.1 }}>
          What's your name?
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          We'll use it to personalise your experience
        </p>
      </div>

      {/* Input */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        <input
          ref={inputRef}
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Enter your name"
          autoComplete="given-name"
          style={{
            width: '100%', height: 54,
            background: 'rgba(255,255,255,0.06)',
            border: `1.5px solid ${error ? '#FF3B3B' : name.trim() ? BLUE : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 14, padding: '0 18px',
            fontSize: 18, fontWeight: 600, color: '#fff',
            fontFamily: F, outline: 'none',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: '#FF3B3B', marginTop: 6, paddingLeft: 4 }}>{error}</div>
        )}

        <button
          onClick={submit}
          style={{
            width: '100%', height: 54, marginTop: 12,
            background: name.trim().length >= 2 ? BLUE : 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: 14,
            fontSize: 16, fontWeight: 700, color: '#fff',
            cursor: 'pointer', fontFamily: F,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: name.trim().length >= 2 ? '0 4px 16px rgba(0,102,255,0.4)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          Continue <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}
