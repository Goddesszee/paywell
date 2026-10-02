import { useState, useEffect } from 'react'
import { Lightbulb, Send, CheckCircle, ArrowLeft, Plus, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F = "'Inter', -apple-system, sans-serif"
const CATEGORIES = [
  { id: 'feature',       label: '✨ Feature Idea' },
  { id: 'improvement',   label: '⚡ Improvement' },
  { id: 'bug',           label: '🐛 Bug / Problem' },
  { id: 'design',        label: '🎨 Design' },
  { id: 'other',         label: '💬 Other' },
]

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  new:         { bg: 'rgba(0,102,255,0.08)',   color: '#0066FF', label: 'New' },
  reviewing:   { bg: 'rgba(240,165,0,0.08)',   color: '#F0A500', label: 'Reviewing' },
  planned:     { bg: 'rgba(0,200,83,0.08)',    color: '#00C853', label: 'Planned' },
  implemented: { bg: 'rgba(0,200,83,0.12)',    color: '#00C853', label: '✓ Implemented' },
  closed:      { bg: 'rgba(128,128,128,0.08)', color: '#888',    label: 'Closed' },
}

interface Suggestion { id: string; title: string; description: string; category: string; status: string; createdAt: string }

export function SuggestionsPage() {
  const C = useNanTheme()
  const { auth, setActiveView } = useAppStore()
  const [view, setView]             = useState<'list' | 'new'>('list')
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState('feature')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading]       = useState(true)

  const token = auth?.sessionToken ?? ''

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    if (!token) { setLoading(false); return }
    fetch('/api/suggestions', { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { success: boolean; suggestions: Suggestion[] }) => { if (d.success) setSuggestions(d.suggestions) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, done])

  const submit = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, description, category }),
      })
      const data = await res.json() as { success: boolean; error?: string }
      if (!data.success) throw new Error(data.error ?? 'Failed')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F, paddingBottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(0,200,83,0.10)', border: '1px solid rgba(0,200,83,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <CheckCircle size={28} color="#00C853" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', marginBottom: 8 }}>Suggestion submitted!</div>
      <div style={{ fontSize: 14, color: C.t2, textAlign: 'center', maxWidth: 280, lineHeight: 1.6, marginBottom: 32 }}>
        We review every suggestion and use them to prioritize future improvements.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { setDone(false); setView('list'); setTitle(''); setDescription(''); setCategory('feature') }}
          style={{ padding: '12px 20px', borderRadius: 12, background: '#0066FF', color: '#fff', fontFamily: F, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          View my suggestions
        </button>
        <button onClick={() => setActiveView('home')}
          style={{ padding: '12px 20px', borderRadius: 12, background: C.surf, color: C.t2, fontFamily: F, fontSize: 14, fontWeight: 600, border: `1px solid ${C.bdr}`, cursor: 'pointer' }}>
          Home
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => view === 'new' ? setView('list') : setActiveView('home')}
            style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={15} color={C.t2} />
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {view === 'new' ? 'New Suggestion' : 'Suggestions'}
            </div>
            <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Help make NAN better</div>
          </div>
        </div>
        {view === 'list' && (
          <button onClick={() => setView('new')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: '#0066FF', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> New
          </button>
        )}
      </div>

      {view === 'list' ? (
        <div>
          {/* Hero card */}
          <div style={{ background: 'linear-gradient(135deg, rgba(0,102,255,0.10) 0%, rgba(0,102,255,0.04) 100%)', border: '1px solid rgba(0,102,255,0.15)', borderRadius: 16, padding: '20px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Lightbulb size={20} color="#0066FF" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Help make NAN better</div>
              <div style={{ fontSize: 13, color: C.t2, marginTop: 3, lineHeight: 1.5 }}>Share ideas, improvements, or problems you've noticed.</div>
            </div>
          </div>

          {loading ? (
            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: 40, textAlign: 'center', color: C.t3, fontSize: 13 }}>Loading…</div>
          ) : suggestions.length === 0 ? (
            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '40px 20px', textAlign: 'center' }}>
              <Lightbulb size={32} color={C.t3} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>No suggestions yet</div>
              <div style={{ fontSize: 13, color: C.t3, marginBottom: 20 }}>Be the first to share an idea!</div>
              <button onClick={() => setView('new')}
                style={{ padding: '10px 20px', borderRadius: 10, background: '#0066FF', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: 600 }}>
                Submit a suggestion
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map(s => {
                const badge = STATUS_COLORS[s.status] ?? STATUS_COLORS.new
                return (
                  <div key={s.id} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{s.title}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap' }}>{badge.label}</span>
                    </div>
                    {s.description && <div style={{ fontSize: 12, color: C.t2, marginBottom: 8, lineHeight: 1.5 }}>{s.description.slice(0, 120)}{s.description.length > 120 ? '…' : ''}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: C.surf2, padding: '2px 8px', borderRadius: 20 }}>{CATEGORIES.find(c => c.id === s.category)?.label ?? s.category}</span>
                      <span style={{ fontSize: 11, color: C.t3 }}>{new Date(s.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* New suggestion form */
        <div>
          {/* Category */}
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, border: `1px solid ${category === cat.id ? '#0066FF' : C.bdr}`, background: category === cat.id ? 'rgba(0,102,255,0.08)' : C.surf2, cursor: 'pointer', fontFamily: F, textAlign: 'left' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: category === cat.id ? '#0066FF' : C.text }}>{cat.label}</span>
                  {category === cat.id && <ChevronRight size={14} color="#0066FF" />}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Title *</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="One-line summary…" maxLength={200}
              style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 14, fontFamily: F, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Description */}
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Description (optional)</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your idea in more detail…" rows={5} maxLength={2000}
              style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: F, resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ fontSize: 11, color: C.t3, textAlign: 'right', marginTop: 4 }}>{description.length}/2000</div>
          </div>

          {error && <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.18)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#FF3B3B', marginBottom: 12 }}>{error}</div>}

          <button onClick={() => { void submit() }} disabled={submitting || !title.trim()}
            style={{ width: '100%', padding: '14px', borderRadius: 12, background: title.trim() ? '#0066FF' : C.surf2, color: title.trim() ? '#fff' : C.t3, border: 'none', fontSize: 15, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'not-allowed', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.7 : 1 }}>
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Suggestion'}
          </button>
        </div>
      )}
    </div>
  )
}
