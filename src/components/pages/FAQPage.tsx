import { useState, useEffect, useMemo } from 'react'
import { HelpCircle, Search, ChevronDown, ChevronUp } from 'lucide-react'

const SANS = "var(--nan-font, 'Inter', sans-serif)"

interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
  order: number
}

export function FAQPage() {
  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/faqs')
      .then(r => r.json())
      .then((d: { faqs: FaqItem[] }) => { if (d.faqs) setFaqs(d.faqs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return faqs
    const q = search.toLowerCase()
    return faqs.filter(f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
  }, [faqs, search])

  const categories = useMemo(() => {
    const cats = [...new Set(filtered.map(f => f.category))]
    return cats
  }, [filtered])

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: SANS }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <HelpCircle size={18} color="var(--nan-blue)" />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--nan-text)' }}>FAQ</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Answers to common questions about NAN</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--nan-text3)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search questions…"
          style={{ width: '100%', padding: '11px 14px 11px 38px', borderRadius: 11, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text)', fontSize: 14, fontFamily: SANS, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
          <HelpCircle size={28} style={{ margin: '0 auto 12px', color: 'var(--nan-text3)' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 6 }}>No results found</div>
          <div style={{ fontSize: 13, color: 'var(--nan-text2)' }}>
            {search ? `No FAQs match "${search}"` : 'No FAQs available yet.'}
          </div>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10, paddingLeft: 2 }}>{cat}</div>
            <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 14, overflow: 'hidden' }}>
              {filtered.filter(f => f.category === cat).map((f, i, arr) => {
                const isOpen = expanded.has(f.id)
                return (
                  <div key={f.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nan-bdr)' : 'none' }}>
                    <button
                      onClick={() => toggle(f.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: isOpen ? 'var(--nan-blue)' : 'var(--nan-text)', flex: 1, lineHeight: 1.4 }}>
                        {f.question}
                      </span>
                      <span style={{ flexShrink: 0, color: isOpen ? 'var(--nan-blue)' : 'var(--nan-text3)' }}>
                        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: '0 16px 16px 16px', fontSize: 13, color: 'var(--nan-text2)', lineHeight: 1.7, borderTop: '1px solid var(--nan-bdr)' }}>
                        <div style={{ paddingTop: 12 }}>{f.answer}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
