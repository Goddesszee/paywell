import { useState, useEffect, useCallback, useMemo } from 'react'
import { adminJson } from '../../lib/admin-api'

const SANS = "'Inter', -apple-system, sans-serif"
const S = 'var(--nan-surface)'
const B = 'var(--nan-bdr)'
const usd = (n: number) => `$${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—')
const when = (iso: string) => new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

interface UserRow {
  key: string; email: string; loginType: string; mainWallet: string; circleWallet: string; agentWallet: string
  firstSeen: string; lastSeen: string; sessions: number; txCount: number; volume: number
}
interface Tx { id: string; walletType: string; walletAddress: string; userEmail: string; type: string; amount: number; description: string; txHash?: string; timestamp: string }
interface Ticket { id: string; subject: string; status: string; updatedAt: string }
interface Overview {
  generatedAt: string; registryEmpty: boolean; auditEntries: number
  users: { total: number; wallets: number; agentWallets: number; active24h: number; active7d: number; new7d: number; byLogin: Record<string, number>; recent: UserRow[]; top: { key: string; email: string; mainWallet: string; volume: number; txCount: number }[] }
  volume: { total: number; main: number; agent: number; txCount: number }
  series: { date: string; volume: number; txCount: number; newUsers: number; activeUsers: number }[]
  support: { total: number; open: number; inProgress: number; resolved: number; unread: number }
  feedback: { total: number; avgRating: number; unreviewed: number; ratingDist: number[] }
  suggestions: { total: number; open: number; planned: number; implemented: number }
  recentTx: Tx[]
}

const card: React.CSSProperties = { background: S, border: `1px solid ${B}`, borderRadius: 14, padding: '16px 18px' }
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--nan-text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }
const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, background: S, border: `1px solid ${B}`, color: 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }

function Stat({ title, value, sub, accent }: { title: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6, color: accent ?? 'var(--nan-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Bars({ data, color, fmt }: { data: { label: string; value: number }[]; color: string; fmt: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90 }}>
      {data.map(d => (
        <div key={d.label} title={`${d.label}: ${fmt(d.value)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
          <div style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%`, background: d.value > 0 ? color : B, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  )
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols}px, 1fr))`, gap: 12, marginBottom: 20 }}>{children}</div>
}
const H = ({ children }: { children: React.ReactNode }) => <div style={{ ...label, margin: '4px 0 10px' }}>{children}</div>

// ── Overview ─────────────────────────────────────────────────────────────────

export function AdminOverviewPanel({ goTo }: { goTo: (tab: string) => void }) {
  const [d, setD] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setBusy(true); setErr('')
    try {
      const r = await adminJson<Overview>('/api/admin/overview')
      if (r.success) setD(r); else setErr(r.error ?? 'Could not load overview')
    } catch { setErr('Could not reach the server.') }
    setBusy(false)
  }, [])
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const backfill = async () => {
    setMsg('')
    const r = await adminJson<{ imported: number; txCounted: number }>('/api/admin/backfill', { method: 'POST' })
    setMsg(r.success ? `Imported ${r.imported} users and ${r.txCounted} transactions.` : (r.error ?? 'Backfill failed'))
    void load()
  }

  if (err) return <div style={{ ...card, color: '#FF3B3B', fontSize: 13 }}>{err} <button style={{ ...btn, marginLeft: 8 }} onClick={() => void load()}>Retry</button></div>
  if (!d) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>

  const s14 = d.series
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Platform Overview</div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Updated {when(d.generatedAt)} · all users, not just this device</div>
        </div>
        <button style={btn} onClick={() => void load()} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {d.registryEmpty && (
        <div style={{ ...card, marginBottom: 16, borderColor: '#F0A500' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>User registry is empty</div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginBottom: 10, lineHeight: 1.5 }}>
            Users are recorded as they open the app after this update. To bring in people who signed in earlier, import them from stored sessions and the transaction ledger. This can only be run once.
          </div>
          <button style={btn} onClick={() => void backfill()}>Import existing users</button>
          {msg && <span style={{ fontSize: 12, marginLeft: 10 }}>{msg}</span>}
        </div>
      )}

      <H>Users &amp; wallets</H>
      <Grid cols={150}>
        <Stat title="Total users" value={String(d.users.total)} sub={`${d.users.new7d} new this week`} />
        <Stat title="Wallets" value={String(d.users.wallets)} sub={`${d.users.agentWallets} agent wallets`} />
        <Stat title="Active 24h" value={String(d.users.active24h)} sub={`${d.users.active7d} in 7 days`} />
        <Stat title="Login types" value={String(Object.keys(d.users.byLogin).length)}
          sub={Object.entries(d.users.byLogin).map(([k, v]) => `${v} ${k}`).join(' · ') || '—'} />
      </Grid>

      <H>Volume</H>
      <Grid cols={150}>
        <Stat title="Total volume" value={usd(d.volume.total)} sub={`${d.volume.txCount} transactions`} accent="#0066FF" />
        <Stat title="Main wallets" value={usd(d.volume.main)} accent="#00C853" />
        <Stat title="Agent wallets" value={usd(d.volume.agent)} accent="#F0A500" />
      </Grid>

      <Grid cols={280}>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Volume · last 14 days</div>
          <Bars data={s14.map(x => ({ label: x.date, value: x.volume }))} color="#0066FF" fmt={usd} />
          <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 6 }}>{usd(s14.reduce((a, x) => a + x.volume, 0))} in period</div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>New users · last 14 days</div>
          <Bars data={s14.map(x => ({ label: x.date, value: x.newUsers }))} color="#00C853" fmt={n => `${n} new`} />
          <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 6 }}>{s14.reduce((a, x) => a + x.newUsers, 0)} signed up in period</div>
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Daily active users</div>
          <Bars data={s14.map(x => ({ label: x.date, value: x.activeUsers }))} color="#F0A500" fmt={n => `${n} active`} />
          <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 6 }}>Peak {Math.max(0, ...s14.map(x => x.activeUsers))}</div>
        </div>
      </Grid>

      <H>Support, feedback &amp; ideas</H>
      <Grid cols={150}>
        <div onClick={() => goTo('support')} style={{ cursor: 'pointer' }}><Stat title="Support tickets" value={String(d.support.total)} sub={`${d.support.open} open · ${d.support.inProgress} in progress · ${d.support.unread} unread`} accent={d.support.unread ? '#FF3B3B' : undefined} /></div>
        <div onClick={() => goTo('feedback')} style={{ cursor: 'pointer' }}><Stat title="Feedback" value={String(d.feedback.total)} sub={`${d.feedback.avgRating || '—'}/5 avg · ${d.feedback.unreviewed} to review`} /></div>
        <div onClick={() => goTo('suggestions')} style={{ cursor: 'pointer' }}><Stat title="Suggestions" value={String(d.suggestions.total)} sub={`${d.suggestions.open} open · ${d.suggestions.planned} planned · ${d.suggestions.implemented} shipped`} /></div>
        <div onClick={() => goTo('audit')} style={{ cursor: 'pointer' }}><Stat title="Admin actions" value={String(d.auditEntries)} sub="Logged in audit trail" /></div>
      </Grid>

      <Grid cols={320}>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Newest users</div>
          {d.users.recent.length === 0 ? <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>None yet</div> : d.users.recent.map(u => (
            <div key={u.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: `1px solid ${B}`, fontSize: 12 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || short(u.mainWallet || u.key)}</span>
              <span style={{ color: 'var(--nan-text3)', flexShrink: 0 }}>{when(u.firstSeen)}</span>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Top users by volume</div>
          {d.users.top.length === 0 ? <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>No volume yet</div> : d.users.top.map(u => (
            <div key={u.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: `1px solid ${B}`, fontSize: 12 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || short(u.mainWallet || u.key)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{usd(u.volume)} <span style={{ color: 'var(--nan-text3)', fontWeight: 500 }}>· {u.txCount} tx</span></span>
            </div>
          ))}
        </div>
      </Grid>

      <H>Latest transactions</H>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {d.recentTx.length === 0 ? <div style={{ padding: 20, fontSize: 12, color: 'var(--nan-text2)', textAlign: 'center' }}>No transactions tracked yet</div> : d.recentTx.map((t, i) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 16px', borderTop: i ? `1px solid ${B}` : 'none', fontSize: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.type.replace('_', ' ')} <span style={{ color: 'var(--nan-text3)', fontWeight: 500 }}>· {t.walletType}</span></div>
              <div style={{ color: 'var(--nan-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.userEmail === 'anonymous' ? short(t.walletAddress) : t.userEmail} · {t.description}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 700 }}>{usd(t.amount)}</div><div style={{ color: 'var(--nan-text3)' }}>{when(t.timestamp)}</div></div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--nan-text3)', marginTop: 12, lineHeight: 1.5 }}>
        Volume and transaction counts are reported by the app when a user sends, receives, swaps or the agent spends. They are not independently verified on-chain.
      </div>
    </div>
  )
}

// ── Users ────────────────────────────────────────────────────────────────────

interface Detail { user: UserRow; transactions: Tx[]; tickets: Ticket[]; feedback: { id: string; rating: number; comment: string; createdAt: string }[]; suggestions: { id: string; title: string; status: string }[] }

function csvEscape(v: unknown) { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : `${v as string | number | boolean}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export function AdminUsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'lastSeen' | 'volume' | 'txCount' | 'firstSeen'>('lastSeen')
  const [sel, setSel] = useState<Detail | null>(null)
  const [selLoading, setSelLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await adminJson<{ users: UserRow[] }>('/api/admin/users')
      if (r.success) setUsers(r.users); else setErr(r.error ?? 'Could not load users')
    } catch { setErr('Could not reach the server.') }
    setLoading(false)
  }, [])
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const open = async (key: string) => {
    setSelLoading(true)
    try {
      const r = await adminJson<Detail>(`/api/admin/users/${encodeURIComponent(key)}`)
      if (r.success) setSel(r)
    } catch { /* ignore */ }
    setSelLoading(false)
  }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return users
      .filter(u => !t || [u.email, u.key, u.mainWallet, u.circleWallet, u.agentWallet].some(v => (v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => sort === 'volume' ? b.volume - a.volume : sort === 'txCount' ? b.txCount - a.txCount
        : new Date(b[sort]).getTime() - new Date(a[sort]).getTime())
  }, [users, q, sort])

  const exportCsv = () => {
    const head = ['email', 'key', 'loginType', 'mainWallet', 'circleWallet', 'agentWallet', 'firstSeen', 'lastSeen', 'sessions', 'txCount', 'volume']
    const csv = [head.join(','), ...rows.map(u => head.map(h => csvEscape((u as unknown as Record<string, unknown>)[h])).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `nan-users-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  if (sel) {
    const u = sel.user
    return (
      <div>
        <button style={{ ...btn, marginBottom: 14 }} onClick={() => setSel(null)}>← All users</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{u.email || short(u.key)}</div>
        <div style={{ fontSize: 12, color: 'var(--nan-text2)', marginBottom: 16 }}>{u.loginType} login · joined {when(u.firstSeen)} · last seen {when(u.lastSeen)}</div>
        <Grid cols={140}>
          <Stat title="Volume" value={usd(u.volume)} />
          <Stat title="Transactions" value={String(u.txCount)} />
          <Stat title="Sessions" value={String(u.sessions)} />
          <Stat title="Tickets" value={String(sel.tickets.length)} />
        </Grid>
        <H>Wallets</H>
        <div style={{ ...card, marginBottom: 20, fontSize: 12, lineHeight: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {[['Main', u.mainWallet], ['Circle', u.circleWallet], ['Agent', u.agentWallet]].map(([n, a]) => (
            <div key={n}><span style={{ fontFamily: SANS, color: 'var(--nan-text3)', display: 'inline-block', width: 56 }}>{n}</span>{a || '—'}</div>
          ))}
        </div>
        <H>Recent transactions</H>
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          {sel.transactions.length === 0 ? <div style={{ padding: 16, fontSize: 12, color: 'var(--nan-text2)' }}>No recent transactions in the ledger</div> : sel.transactions.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: i ? `1px solid ${B}` : 'none', fontSize: 12 }}>
              <span style={{ textTransform: 'capitalize' }}>{t.type.replace('_', ' ')} · <span style={{ color: 'var(--nan-text3)' }}>{t.description}</span></span>
              <span><b>{usd(t.amount)}</b> <span style={{ color: 'var(--nan-text3)' }}>{when(t.timestamp)}</span></span>
            </div>
          ))}
        </div>
        {sel.tickets.length > 0 && <><H>Support tickets</H>
          <div style={{ ...card, marginBottom: 20, fontSize: 12 }}>{sel.tickets.map(t => <div key={t.id} style={{ padding: '4px 0' }}>{t.id} · {t.subject} <b>({t.status})</b></div>)}</div></>}
        {sel.feedback.length > 0 && <><H>Feedback</H>
          <div style={{ ...card, marginBottom: 20, fontSize: 12 }}>{sel.feedback.map(f => <div key={f.id} style={{ padding: '4px 0' }}>{'★'.repeat(f.rating)} {f.comment}</div>)}</div></>}
        {sel.suggestions.length > 0 && <><H>Suggestions</H>
          <div style={{ ...card, fontSize: 12 }}>{sel.suggestions.map(s => <div key={s.id} style={{ padding: '4px 0' }}>{s.title} <b>({s.status})</b></div>)}</div></>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Users &amp; Wallets</div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>{users.length} registered · showing {rows.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
          <button style={btn} onClick={() => void load()}>Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or wallet address…"
          style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 13, fontFamily: SANS, outline: 'none' }} />
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
          style={{ padding: '9px 10px', borderRadius: 9, background: S, border: `1px solid ${B}`, color: 'var(--nan-text)', fontSize: 12, fontFamily: SANS }}>
          <option value="lastSeen">Last active</option><option value="firstSeen">Newest</option>
          <option value="volume">Volume</option><option value="txCount">Transactions</option>
        </select>
      </div>
      {err && <div style={{ ...card, color: '#FF3B3B', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--nan-text2)', fontSize: 13 }}>Loading…</div>
        : rows.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--nan-text2)', fontSize: 13 }}>
          {users.length ? 'No users match that search.' : 'No users registered yet. Open Overview to import existing ones.'}</div>
        : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {rows.slice(0, 300).map((u, i) => (
              <div key={u.key} onClick={() => void open(u.key)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '12px 16px', borderTop: i ? `1px solid ${B}` : 'none', cursor: 'pointer', opacity: selLoading ? 0.6 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || short(u.key)}</div>
                  <div style={{ fontSize: 11, color: 'var(--nan-text3)', fontFamily: 'monospace' }}>
                    {short(u.mainWallet || u.circleWallet)}{u.agentWallet ? ` · agent ${short(u.agentWallet)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{usd(u.volume)} <span style={{ color: 'var(--nan-text3)', fontWeight: 500 }}>· {u.txCount} tx</span></div>
                  <div style={{ color: 'var(--nan-text3)' }}>{u.loginType} · {when(u.lastSeen)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
