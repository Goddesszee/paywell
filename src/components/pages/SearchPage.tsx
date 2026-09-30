import { useState, useEffect, useRef } from 'react'
import { Search, X, Clock, ArrowRight, ShoppingBag, Repeat, ArrowLeftRight, Bot, HelpCircle, Info, MessageSquare, Lightbulb, Star, Bookmark } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F = "'Inter', -apple-system, sans-serif"

interface SearchResult {
  id: string
  title: string
  subtitle: string
  category: string
  icon: React.ElementType
  iconColor: string
  action: string   // view to navigate to
}

const STATIC_RESULTS: SearchResult[] = [
  { id: 'send',        title: 'Send USDC',           subtitle: 'Transfer to any wallet address',         category: 'Payments',    icon: ArrowRight,     iconColor: '#0066FF', action: 'send' },
  { id: 'receive',     title: 'Receive USDC',         subtitle: 'Share your address to receive funds',    category: 'Payments',    icon: ArrowRight,     iconColor: '#00C853', action: 'receive' },
  { id: 'swap',        title: 'Swap tokens',          subtitle: 'Exchange USDC for other tokens',         category: 'Finance',     icon: Repeat,         iconColor: '#F0A500', action: 'swap' },
  { id: 'bridge',      title: 'Bridge USDC',          subtitle: 'Move USDC across blockchains',           category: 'Finance',     icon: ArrowLeftRight, iconColor: '#0066FF', action: 'bridge' },
  { id: 'buy',         title: 'Buy USDC',             subtitle: 'Purchase USDC with card or bank',        category: 'Finance',     icon: ShoppingBag,    iconColor: '#0066FF', action: 'onramp' },
  { id: 'agent',       title: 'AI Agents',            subtitle: 'Create and manage autonomous agents',    category: 'Agents',      icon: Bot,            iconColor: '#0066FF', action: 'agent' },
  { id: 'faq',         title: 'FAQ',                  subtitle: 'Find answers to common questions',       category: 'Help',        icon: HelpCircle,     iconColor: '#F0A500', action: 'faq' },
  { id: 'support',     title: 'Customer Support',     subtitle: 'Open a support ticket',                  category: 'Help',        icon: MessageSquare,  iconColor: '#0066FF', action: 'support' },
  { id: 'about',       title: 'About NAN',            subtitle: 'Learn about the NAN platform',           category: 'Info',        icon: Info,           iconColor: '#0066FF', action: 'about' },
  { id: 'feedback',    title: 'Leave Feedback',       subtitle: 'Rate your experience',                   category: 'Help',        icon: Star,           iconColor: '#F0A500', action: 'feedback' },
  { id: 'suggestions', title: 'Suggestion Box',       subtitle: 'Share ideas to improve NAN',             category: 'Help',        icon: Lightbulb,      iconColor: '#00C853', action: 'suggestions' },
  { id: 'favorites',   title: 'Saved Items',          subtitle: 'View your bookmarked content',           category: 'Account',     icon: Bookmark,       iconColor: '#0066FF', action: 'favorites' },
  { id: 'activity',    title: 'Transaction History',  subtitle: 'All past payments and activity',         category: 'Account',     icon: Clock,          iconColor: '#0066FF', action: 'activity' },
]

export function SearchPage() {
  const C = useNanTheme()
  const { setActiveView, recentSearches, addSearch, clearSearches } = useAppStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  const results = query.trim().length > 0
    ? STATIC_RESULTS.filter(r =>
        r.title.toLowerCase().includes(query.toLowerCase()) ||
        r.subtitle.toLowerCase().includes(query.toLowerCase()) ||
        r.category.toLowerCase().includes(query.toLowerCase())
      )
    : []

  const go = (result: SearchResult) => {
    addSearch(result.title)
    setActiveView(result.action)
  }

  const goSearch = (q: string) => {
    setQuery(q)
    addSearch(q)
  }

  // Group by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: F, paddingBottom: 80 }}>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <Search size={16} color={C.t3} />
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setActiveView('home') }}
          placeholder="Search NAN…"
          style={{ width: '100%', padding: '13px 42px 13px 42px', background: C.surf, border: `1px solid ${query ? C.blueBd : C.bdr}`, borderRadius: 14, color: C.text, fontSize: 15, fontFamily: F, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
        />
        {query ? (
          <button onClick={() => setQuery('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: C.surf2, border: 'none', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={13} color={C.t2} />
          </button>
        ) : (
          <button onClick={() => setActiveView('home')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.t2, fontFamily: F }}>
            Cancel
          </button>
        )}
      </div>

      {/* Recent searches */}
      {!query && recentSearches.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recent searches</span>
            <button onClick={clearSearches} style={{ fontSize: 12, color: '#0066FF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>Clear</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recentSearches.map(r => (
              <button key={r} onClick={() => goSearch(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 10, cursor: 'pointer', fontFamily: F, textAlign: 'left', transition: 'background 0.12s' }}>
                <Clock size={13} color={C.t3} />
                <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{r}</span>
                <ArrowRight size={12} color={C.t3} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search suggestions while typing */}
      {query && results.length > 0 && (
        <div>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{category}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map(r => (
                  <button key={r.id} onClick={() => go(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, cursor: 'pointer', fontFamily: F, textAlign: 'left', transition: 'all 0.12s' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${r.iconColor}12`, border: `1px solid ${r.iconColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <r.icon size={16} color={r.iconColor} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: C.t3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subtitle}</div>
                    </div>
                    <ArrowRight size={14} color={C.t3} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {query && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Search size={22} color={C.t3} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Nothing found</div>
          <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.6, maxWidth: 260, margin: '0 auto 20px' }}>
            We couldn't find anything matching "{query}". Try different keywords.
          </div>
          <button onClick={() => setActiveView('support')}
            style={{ padding: '10px 20px', borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, color: C.t2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Contact support
          </button>
        </div>
      )}

      {/* Browse all — empty query with no recent */}
      {!query && recentSearches.length === 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Browse</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {STATIC_RESULTS.slice(0, 8).map(r => (
              <button key={r.id} onClick={() => go(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, cursor: 'pointer', fontFamily: F, textAlign: 'left' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: `${r.iconColor}12`, border: `1px solid ${r.iconColor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <r.icon size={14} color={r.iconColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 0 }}>{r.category}</div>
                </div>
                <ArrowRight size={13} color={C.t3} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
