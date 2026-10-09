import { useState } from 'react'
import { Star, Send, CheckCircle, MessageSquare, ArrowLeft } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F = "'Inter', -apple-system, sans-serif"
const API = (import.meta.env.VITE_RAILWAY_URL as string | undefined) ?? (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const CATEGORIES = [
  { id: 'general',  label: 'General' },
  { id: 'payments', label: 'Payments' },
  { id: 'agents',   label: 'AI Agents' },
  { id: 'support',  label: 'Support' },
  { id: 'other',    label: 'Other' },
]

export function FeedbackPage() {
  const C = useNanTheme()
  const { auth, setActiveView } = useAppStore()
  const [rating, setRating]       = useState(0)
  const [hovered, setHovered]     = useState(0)
  const [comment, setComment]     = useState('')
  const [category, setCategory]   = useState('general')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')

  const submit = async () => {
    if (!rating) { setError('Please select a star rating.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth?.sessionToken ?? ''}` },
        body: JSON.stringify({ rating, comment, category }),
      })
      const text = await res.text()
      let data: { success: boolean; error?: string; message?: string }
      try { data = JSON.parse(text) as typeof data }
      catch { throw new Error(res.status === 503 ? 'Service temporarily unavailable — please try again shortly.' : `Server error (${res.status})`) }
      if (!data.success) throw new Error(data.error ?? data.message ?? 'Failed')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: F, paddingBottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(0,200,83,0.10)', border: '1px solid rgba(0,200,83,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <CheckCircle size={28} color="#00C853" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', marginBottom: 8 }}>Thank you!</div>
      <div style={{ fontSize: 14, color: C.t2, textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 32 }}>
        Your feedback helps us make NAN better for everyone.
      </div>
      <button onClick={() => setActiveView('home')}
        style={{ padding: '12px 28px', borderRadius: 12, background: '#0066FF', color: '#fff', fontFamily: F, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
        Back to Home
      </button>
    </div>
  )

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button onClick={() => setActiveView('home')} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={15} color={C.t2} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Rate your experience</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Your feedback matters to us</div>
        </div>
      </div>

      {/* Star rating */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '24px 20px', marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.t2, marginBottom: 16 }}>How would you rate NAN overall?</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          {[1,2,3,4,5].map(n => (
            <button key={n}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(n)}
              style={{ width: 46, height: 46, borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s', transform: hovered >= n || rating >= n ? 'scale(1.15)' : 'scale(1)' }}>
              <Star size={28} color={(hovered || rating) >= n ? '#F0A500' : C.bdr2} fill={(hovered || rating) >= n ? '#F0A500' : 'transparent'} />
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.t3, minHeight: 18 }}>
          {rating === 1 && 'Poor'}{rating === 2 && 'Fair'}{rating === 3 && 'Good'}{rating === 4 && 'Great'}{rating === 5 && 'Excellent! 🎉'}
        </div>
      </div>

      {/* Category */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>What is this about?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${category === cat.id ? '#0066FF' : C.bdr}`, background: category === cat.id ? 'rgba(0,102,255,0.10)' : C.surf2, color: category === cat.id ? '#0066FF' : C.t2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, transition: 'all 0.15s' }}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Additional comments (optional)</div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Tell us what you love, or what we can improve…"
          rows={4}
          style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: F, resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
        />
        <div style={{ fontSize: 11, color: C.t3, textAlign: 'right', marginTop: 4 }}>{comment.length}/1000</div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#FF3B3B', marginBottom: 12 }}>{error}</div>
      )}

      <button onClick={() => { void submit() }} disabled={submitting || !rating}
        style={{ width: '100%', padding: '14px', borderRadius: 12, background: rating ? '#0066FF' : C.surf2, color: rating ? '#fff' : C.t3, border: `1px solid ${rating ? '#0066FF' : C.bdr}`, fontSize: 15, fontWeight: 600, cursor: rating ? 'pointer' : 'not-allowed', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s', opacity: submitting ? 0.7 : 1 }}>
        <Send size={15} />
        {submitting ? 'Submitting…' : 'Submit Feedback'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, justifyContent: 'center' }}>
        <MessageSquare size={13} color={C.t3} />
        <span style={{ fontSize: 12, color: C.t3 }}>Have a problem? <button onClick={() => setActiveView('support')} style={{ color: '#0066FF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 600, padding: 0 }}>Contact support</button></span>
      </div>
    </div>
  )
}
