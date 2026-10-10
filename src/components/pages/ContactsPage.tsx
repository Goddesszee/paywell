/**
 * ContactsPage — contact book with on-chain history per contact.
 * Contacts are auto-populated from sent transactions and can be manually added.
 */
import { useState } from 'react'
import {
  ArrowLeft, UserPlus, Search, Trash2, Send,
  Copy, Check, ChevronRight, Users,
} from 'lucide-react'
import { useAppStore, type Contact } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { formatAddress } from '../../utils/format'
import { toast } from 'sonner'

const F = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"
const BLUE = '#0066FF'

function ContactAvatar({ contact, size = 44 }: { contact: Contact; size?: number }) {
  if (contact.avatarUrl) {
    return <img src={contact.avatarUrl} alt={contact.name} style={{ width: size, height: size, borderRadius: size / 3, objectFit: 'cover', flexShrink: 0 }} />
  }
  const letter = contact.name.slice(0, 1).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 3, flexShrink: 0,
      background: 'rgba(0,102,255,0.12)', border: '1px solid rgba(0,102,255,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: BLUE, fontFamily: F,
    }}>
      {letter}
    </div>
  )
}

export function ContactsPage() {
  const C = useNanTheme()
  const { contacts, addContact, removeContact, setActiveView } = useAppStore()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newNote, setNewNote] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.address.toLowerCase().includes(query.toLowerCase())
  )

  const handleAdd = () => {
    if (!newName.trim()) { toast.error('Name is required'); return }
    if (!newAddress.trim() || !/^0x[0-9a-fA-F]{40}$/.test(newAddress)) { toast.error('Enter a valid 0x address'); return }
    addContact({ address: newAddress.trim(), name: newName.trim(), note: newNote.trim() || undefined })
    setNewName(''); setNewAddress(''); setNewNote(''); setShowAdd(false)
    toast.success('Contact saved')
  }

  const handleCopy = (id: string, address: string) => {
    void navigator.clipboard.writeText(address)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('Address copied')
  }

  return (
    <div style={{ fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setActiveView('home')} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={15} color={C.t2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Contacts</div>
          <div style={{ fontSize: 12, color: C.t3 }}>{contacts.length} saved</div>
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={{ height: 34, padding: '0 14px', borderRadius: 10, background: BLUE, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserPlus size={14} /> Add
        </button>
      </div>

      {/* Add contact form */}
      {showAdd && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>New contact</div>
          {[
            { label: 'Name *', value: newName, onChange: setNewName, placeholder: 'Display name', mono: false },
            { label: 'Wallet address *', value: newAddress, onChange: setNewAddress, placeholder: '0x…', mono: true },
            { label: 'Note (optional)', value: newNote, onChange: setNewNote, placeholder: 'How do you know them?', mono: false },
          ].map(({ label, value, onChange, placeholder, mono }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 5 }}>{label}</label>
              <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', padding: '9px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 9, color: C.text, fontSize: mono ? 12 : 14, fontFamily: mono ? MONO : F, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} style={{ flex: 1, padding: '10px', borderRadius: 10, background: BLUE, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: C.surf2, border: `1px solid ${C.bdr}`, color: C.t2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      {contacts.length > 0 && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} color={C.t3} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, color: C.text, fontSize: 14, fontFamily: F, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Empty state */}
      {contacts.length === 0 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
          <Users size={36} color={C.t3} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>No contacts yet</div>
          <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.6 }}>Contacts are auto-added when you send USDC, or tap + Add above.</div>
        </div>
      )}

      {/* Contact list */}
      {filtered.length > 0 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          {filtered.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.bdr}` }}>
              <ContactAvatar contact={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.t3, fontFamily: MONO }}>{formatAddress(c.address)}</div>
                {c.txCount > 0 && (
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                    {c.txCount} tx · {c.totalSent.toFixed(2)} USDC sent
                    {c.lastTxAt && ` · ${new Date(c.lastTxAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                  </div>
                )}
                {c.note && <div style={{ fontSize: 10, color: C.t3, marginTop: 1, fontStyle: 'italic' }}>{c.note}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleCopy(c.id, c.address)} style={{ width: 30, height: 30, borderRadius: 8, background: C.surf2, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {copiedId === c.id ? <Check size={13} color="#00C853" /> : <Copy size={13} color={C.t3} />}
                </button>
                <button onClick={() => { useAppStore.getState().setActiveView('send') }} style={{ width: 30, height: 30, borderRadius: 8, background: C.blueDim, border: `1px solid ${C.blueBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Send size={13} color={BLUE} />
                </button>
                <button onClick={() => removeContact(c.id)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} color="#FF3B3B" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {contacts.length > 0 && filtered.length === 0 && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: C.t3 }}>No contacts match "{query}"</div>
        </div>
      )}

      {/* Quick nav to sends from contacts */}
      {contacts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setActiveView('send')} style={{ width: '100%', padding: '13px', borderRadius: 12, background: BLUE, border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <ChevronRight size={15} /> Send to a contact
          </button>
        </div>
      )}
    </div>
  )
}
