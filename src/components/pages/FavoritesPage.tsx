import { Bookmark, Trash2, ArrowRight, Search } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'

const F = "'Inter', -apple-system, sans-serif"

export function FavoritesPage() {
  const C = useNanTheme()
  const { favorites, removeFavorite, setActiveView } = useAppStore()

  return (
    <div style={{ width: '100%', fontFamily: F, paddingBottom: 80 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.025em' }}>Saved Items</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>{favorites.length} item{favorites.length !== 1 ? 's' : ''} saved</div>
      </div>

      {favorites.length === 0 ? (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 20, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Bookmark size={24} color={C.t3} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>No saved items yet</div>
          <div style={{ fontSize: 13, color: C.t3, maxWidth: 240, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Tap the bookmark icon on any item to save it here for quick access.
          </div>
          <button onClick={() => setActiveView('faq')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: C.blueDim, border: `1px solid ${C.blueBd}`, color: '#0066FF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            Browse FAQs <ArrowRight size={13} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {favorites.map(fav => (
            <div key={fav.id} style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.blueDim, border: `1px solid ${C.blueBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bookmark size={16} color="#0066FF" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fav.title}</div>
                {fav.subtitle && <div style={{ fontSize: 12, color: C.t3, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fav.subtitle}</div>}
                <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Saved {new Date(fav.savedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {fav.href && (
                  <button onClick={() => setActiveView(fav.href!)}
                    style={{ width: 30, height: 30, borderRadius: 8, background: C.blueDim, border: `1px solid ${C.blueBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <ArrowRight size={13} color="#0066FF" />
                  </button>
                )}
                <button onClick={() => removeFavorite(fav.id)}
                  style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} color="#FF3B3B" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {favorites.length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={() => setActiveView('search')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, background: C.surf, border: `1px solid ${C.bdr}`, color: C.t2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            <Search size={13} /> Discover more to save
          </button>
        </div>
      )}
    </div>
  )
}
