import { useState, useEffect, useRef } from 'react'
import { User, Camera, Save, Shield, Bell, Clock, LogOut, ChevronRight, CheckCircle, Sun, Moon, Monitor, ArrowLeft, AtSign, Headphones } from 'lucide-react'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useNanName } from '../../hooks/useNanName'

const F    = "'Inter', -apple-system, sans-serif"
const MONO = "'JetBrains Mono', Menlo, monospace"

type Tab = 'profile' | 'security' | 'notifications' | 'theme'

interface SessionEntry { ts: string; ip: string; agent: string }

export function ProfilePage() {
  const C = useNanTheme()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { auth, profile, setProfile, setActiveView, theme, setTheme, nanHandle, setNanHandle, logout } = useAppStore()
  const { resolveName, registrySet } = useNanName()
  const [view, setView] = useState<'main' | 'account'>('main')
  const [tab, setTab] = useState<Tab>('profile')
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio]                 = useState(profile.bio)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [sessions, setSessions]       = useState<SessionEntry[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const token = auth?.sessionToken ?? ''

  // Load session history when security tab opens
  useEffect(() => {
    if (tab !== 'security' || !token) return
    // eslint-disable-next-line react/set-state-in-effect
    setLoadingSessions(true)
    fetch('/api/account/sessions', { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { success: boolean; sessions: SessionEntry[] }) => { if (d.success) setSessions(d.sessions) })
      .catch(() => {})
      .finally(() => setLoadingSessions(false))
  }, [tab, token])

  const saveProfile = async () => {
    setSaving(true); setSaveError('')
    try {
      // Always update local store immediately so the UI reflects changes
      setProfile({ displayName, bio })

      // Only attempt backend save when a session token is available
      if (token) {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ displayName, bio }),
        })
        if (res.ok) {
          const data = await res.json() as { success: boolean; profile?: typeof profile }
          if (data.profile) setProfile(data.profile)
        }
        // Non-ok response is silent — local save already succeeded
      }

      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {
      // Local store was already updated — just show success
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const saveNotifPrefs = async (prefs: typeof profile.notifPrefs) => {
    setProfile({ notifPrefs: prefs })
    try {
      await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ notifPrefs: prefs }),
      })
    } catch { /* silent */ }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { setSaveError('Image too large (max 4 MB)'); return }
    setAvatarUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setProfile({ avatarUrl: dataUrl })
      if (token) {
        fetch('/api/account/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatarUrl: dataUrl }),
        }).catch(() => {})
      }
      setAvatarUploading(false)
    }
    reader.readAsDataURL(file)
    // reset so re-picking same file fires change event
    e.target.value = ''
  }

  // Load onchain NAN handle and sync to global store
  useEffect(() => {
    const addr = address ?? (auth?.circleWalletAddress)
    if (!addr || !registrySet) return
    resolveName(addr).then(h => { if (h) setNanHandle(h) }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, auth?.circleWalletAddress, registrySet])

  const avatarLetter = (profile.displayName || auth?.email || 'N').slice(0, 1).toUpperCase()

  const TABS = [
    { id: 'profile' as Tab, label: 'Profile', Icon: User },
    { id: 'security' as Tab, label: 'Security', Icon: Shield },
    { id: 'notifications' as Tab, label: 'Alerts', Icon: Bell },
    { id: 'theme' as Tab, label: 'Theme', Icon: Sun },
  ]

  const isDark = theme === 'dark' || (theme !== 'light' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const handleLogout = () => {
    if (!window.confirm('Log out and clear your session data?')) return
    disconnect()
    logout()
    setActiveView('landing')
  }

  const iconCircle = (icon: React.ReactNode) => (
    <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
  )

  const listRow = (opts: { key: string; icon: React.ReactNode; label: string; sub?: string; onClick: () => void; right?: React.ReactNode; chevron?: boolean }) => (
    <div key={opts.key} role="button" tabIndex={0} onClick={opts.onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick() } }}
      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px', cursor: 'pointer', borderRadius: 12 }}>
      {iconCircle(opts.icon)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{opts.label}</div>
        {opts.sub && <div style={{ fontSize: 12, color: C.t3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opts.sub}</div>}
      </div>
      {opts.right ?? (opts.chevron === false ? null : <ChevronRight size={18} color={C.t3} />)}
    </div>
  )

  if (view === 'main') {
    return (
      <div style={{ width: '100%', fontFamily: F, paddingBottom: 80 }}>
        {/* Top bar */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, marginBottom: 12 }}>
          <button onClick={() => setActiveView('settings')} aria-label="Back"
            style={{ position: 'absolute', left: 0, width: 36, height: 36, borderRadius: 10, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={20} color={C.text} />
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Profile</div>
        </div>

        {/* Avatar + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 24px' }}>
          <div style={{ position: 'relative' }}>
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" onError={() => setProfile({ avatarUrl: '' })}
                style={{ width: 104, height: 104, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${C.bdr}` }} />
            ) : (
              <div style={{ width: 104, height: 104, borderRadius: '50%', background: 'rgba(8,102,245,0.12)', border: '1px solid rgba(8,102,245,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700, color: C.blue }}>
                {avatarLetter}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={avatarUploading} aria-label="Change photo"
              style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: avatarUploading ? '#555' : C.blue, border: `3px solid ${C.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Camera size={14} color="#fff" />
            </button>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 14, textAlign: 'center' }}>
            {profile.displayName || auth?.email?.split('@')[0] || 'User'}
          </div>
          {saveError && <div style={{ fontSize: 12, color: '#FF3B3B', marginTop: 6 }}>{saveError}</div>}
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {listRow({ key: 'account', icon: <User size={22} color="#fff" />, label: 'My Account', onClick: () => { setTab('profile'); setView('account') } })}
          {nanHandle
            ? listRow({ key: 'nan', icon: <AtSign size={22} color="#fff" />, label: 'NAN Name', sub: `@${nanHandle}`, onClick: () => setActiveView('nan-name') })
            : registrySet
              ? listRow({ key: 'nan', icon: <AtSign size={22} color="#fff" />, label: 'NAN Name', sub: 'Get your @handle', onClick: () => setActiveView('nan-name') })
              : null}
          {listRow({
            key: 'dark', icon: <Moon size={22} color="#fff" />, label: 'Dark Mode', onClick: () => setTheme(isDark ? 'light' : 'dark'),
            right: (
              <div aria-label="Dark mode" style={{ width: 52, height: 30, borderRadius: 15, background: isDark ? C.blue : C.surf2, border: `1px solid ${isDark ? C.blue : C.bdr}`, position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: isDark ? 25 : 3, width: 22, height: 22, borderRadius: 11, background: '#fff', transition: 'left 0.2s' }} />
              </div>
            ),
          })}
          {listRow({ key: 'support', icon: <Headphones size={22} color="#fff" />, label: 'Support service', onClick: () => setActiveView('support') })}
          {listRow({ key: 'logout', icon: <LogOut size={22} color="#fff" />, label: 'Logout', onClick: handleLogout, chevron: false })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setView('main')} aria-label="Back" style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={15} color={C.t2} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>My Account</div>
          <div style={{ fontSize: 13, color: C.t3 }}>{auth?.email ?? ''}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: 4 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', borderRadius: 9, border: 'none', background: tab === id ? C.blue : 'transparent', color: tab === id ? '#fff' : C.t2, cursor: 'pointer', fontFamily: F, transition: 'all 0.15s' }}>
            <Icon size={14} color={tab === id ? '#fff' : C.t3} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {tab === 'profile' && (
        <div>
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Personal information</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 6 }}>Display name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How should we call you?"
                style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 14, fontFamily: F, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 6 }}>Bio (optional)</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A short note about yourself…" rows={3} maxLength={300}
                style={{ width: '100%', padding: '10px 12px', background: C.surf2, border: `1px solid ${C.bdr}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: F, resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
              <div style={{ fontSize: 11, color: C.t3, textAlign: 'right', marginTop: 2 }}>{bio.length}/300</div>
            </div>
            {saveError && <div style={{ background: 'rgba(255,59,59,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#FF3B3B', marginBottom: 10 }}>{saveError}</div>}
            {saved && <div style={{ background: 'rgba(0,200,83,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#00C853', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={13} /> Saved!</div>}
            <button onClick={() => { void saveProfile() }} disabled={saving}
              style={{ width: '100%', padding: '11px', borderRadius: 10, background: '#0066FF', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── Security tab ── */}
      {tab === 'security' && (
        <div>
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Account</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.bdr}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Email</div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 1, fontFamily: MONO }}>{auth?.email ?? '—'}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#00C853', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.15)', padding: '2px 8px', borderRadius: 20 }}>Verified</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Authentication</div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>One-time password (OTP) via email</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#0066FF', background: 'rgba(0,102,255,0.08)', border: '1px solid rgba(0,102,255,0.18)', padding: '2px 8px', borderRadius: 20 }}>Active</span>
            </div>
          </div>

          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} /> Recent login activity</div>
            </div>
            {loadingSessions ? (
              <div style={{ textAlign: 'center', padding: 24, color: C.t3, fontSize: 13 }}>Loading…</div>
            ) : sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: C.t3, fontSize: 13 }}>No recent sessions recorded</div>
            ) : (
              sessions.slice(0, 5).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < Math.min(sessions.length, 5) - 1 ? `1px solid ${C.bdr}` : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#00C853' : C.t3, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{i === 0 ? 'Current session' : 'Session'}</div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>{new Date(s.ts).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    <div style={{ fontSize: 10, color: C.t3, fontFamily: MONO, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.agent}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {isConnected && (
            <button onClick={() => disconnect()}
              style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.15)', color: '#FF3B3B', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LogOut size={14} /> Disconnect wallet
            </button>
          )}
        </div>
      )}

      {/* ── Notifications tab ── */}
      {tab === 'notifications' && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px', fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notification preferences</div>
          {([
            { key: 'supportReplies' as const, label: 'Support replies', sub: 'When an admin responds to your ticket' },
            { key: 'systemUpdates' as const, label: 'System updates', sub: 'Important NAN platform announcements' },
            { key: 'payments' as const, label: 'Payments', sub: 'Incoming USDC and payment confirmations' },
          ]).map(({ key, label, sub }, i, arr) => {
            const on = profile.notifPrefs[key]
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: i === 0 ? `1px solid ${C.bdr}` : 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.bdr}` : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{sub}</div>
                </div>
                <button
                  onClick={() => { void saveNotifPrefs({ ...profile.notifPrefs, [key]: !on }) }}
                  style={{ width: 46, height: 26, borderRadius: 13, background: on ? '#0066FF' : C.surf2, border: `1px solid ${on ? '#0066FF' : C.bdr}`, position: 'relative', cursor: 'pointer', transition: 'all 0.25s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left 0.25s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                </button>
              </div>
            )
          })}
          <div style={{ padding: '12px 18px', background: C.surf2, borderTop: `1px solid ${C.bdr}` }}>
            <div style={{ fontSize: 12, color: C.t3 }}>You can always view all notifications in the bell icon at the top of the screen.</div>
          </div>
        </div>
      )}

      {/* ── Theme tab ── */}
      {tab === 'theme' && (
        <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px 8px', fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Appearance</div>
          {[
            { id: 'dark',  label: 'Dark',   sub: 'Near-black backgrounds, high contrast',  Icon: Moon },
            { id: 'light', label: 'Light',  sub: 'Clean white surfaces, great in daylight', Icon: Sun },
            { id: 'system',label: 'System', sub: 'Follows your device preference',          Icon: Monitor },
          ].map(({ id, label, sub, Icon }, i) => {
            const active = theme === id || (id === 'system' && !theme)
            return (
              <button key={id} onClick={() => setTheme(id as 'dark' | 'light')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderLeft: 'none', borderRight: 'none', borderTop: i === 0 ? `1px solid ${C.bdr}` : 'none', borderBottom: i < 2 ? `1px solid ${C.bdr}` : 'none', background: active ? C.blueDim : 'transparent', cursor: 'pointer', fontFamily: F, textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? 'rgba(0,102,255,0.15)' : C.surf2, border: `1px solid ${active ? C.blueBd : C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={active ? '#0066FF' : C.t2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: active ? '#0066FF' : C.text }}>{label}</div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{sub}</div>
                </div>
                {active && <CheckCircle size={16} color="#0066FF" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
