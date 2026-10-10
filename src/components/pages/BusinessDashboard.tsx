/**
 * BusinessDashboard — merchant/freelancer view.
 * Shows revenue summary, pending escrows, invoice status, and a one-tap
 * "share payment page" button. All data comes from the existing activity store.
 */
import React, { useMemo } from 'react'
import {
  ArrowLeft, TrendingUp, Clock, CheckCircle2,
  AlertCircle, Share2, FileText, QrCode, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { useNanTheme } from '../../hooks/useNanTheme'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'

const F = "'Inter', -apple-system, sans-serif"
const BLUE = '#0066FF'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: string
  C: ReturnType<typeof useNanTheme>
}

function StatCard({ label, value, sub, color = BLUE, C }: StatCardProps) {
  return (
    <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 14, padding: '14px 16px', flex: 1 }}>
      <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.02em', marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.t3 }}>{sub}</div>}
    </div>
  )
}

export function BusinessDashboard() {
  const C = useNanTheme()
  const { activity, setActiveView } = useAppStore()
  const { address } = useAccount()

  // Stable timestamp — set once on mount, does not change on re-renders
  const [mountTime] = React.useState(() => Date.now())
  const stats = useMemo(() => {
    const d30 = mountTime - 30 * 24 * 60 * 60 * 1000
    const d7  = mountTime - 7  * 24 * 60 * 60 * 1000
    const received = activity.filter(a => a.sign === '+' && a.status === 'confirmed')
    const month = received.filter(a => new Date(a.timestamp).getTime() > d30)
    const week  = received.filter(a => new Date(a.timestamp).getTime() > d7)
    const pending = activity.filter(a => a.status === 'pending')
    const totalRevenue = received.reduce((s, a) => s + a.amount, 0)
    const monthRevenue = month.reduce((s, a) => s + a.amount, 0)
    const weekRevenue  = week.reduce((s, a) => s + a.amount, 0)
    return { totalRevenue, monthRevenue, weekRevenue, pendingCount: pending.length, txCount: received.length }
  }, [activity, mountTime])

  const recentReceived = useMemo(() =>
    activity.filter(a => a.sign === '+').slice(0, 8), [activity])

  const payUrl = address ? `${window.location.origin}?pay=${address}` : ''

  const sharePayPage = async () => {
    if (!payUrl) return
    if (navigator.share) {
      try { await navigator.share({ title: 'Pay me with NAN', url: payUrl }); return } catch { /* dismissed */ }
    }
    await navigator.clipboard.writeText(payUrl)
    toast.success('Payment link copied!')
  }

  return (
    <div style={{ fontFamily: F, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setActiveView('home')} style={{ width: 32, height: 32, borderRadius: 8, background: C.surf, border: `1px solid ${C.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={15} color={C.t2} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>Business</div>
          <div style={{ fontSize: 12, color: C.t3 }}>Revenue, invoices & payment links</div>
        </div>
      </div>

      {/* Revenue stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <StatCard label="Total received" value={`$${stats.totalRevenue.toFixed(2)}`} sub={`${stats.txCount} payments`} C={C} />
        <StatCard label="This month" value={`$${stats.monthRevenue.toFixed(2)}`} sub="30 days" color={C.green} C={C} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <StatCard label="This week" value={`$${stats.weekRevenue.toFixed(2)}`} sub="7 days" color="#818CF8" C={C} />
        <StatCard label="Pending" value={`${stats.pendingCount}`} sub="transactions" color={C.gold} C={C} />
      </div>

      {/* Quick actions */}
      <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
        {[
          { icon: <QrCode size={17} color={BLUE} />, label: 'My payment QR code', sub: 'Printable QR — customers pay without an account', action: () => setActiveView('merchant-qr') },
          { icon: <FileText size={17} color={C.gold} />, label: 'New payment request', sub: 'Create & send an invoice link', action: () => setActiveView('payment-requests') },
          { icon: <Share2 size={17} color={C.green} />, label: 'Share my pay link', sub: payUrl ? payUrl.slice(0, 40) + '…' : 'Connect wallet first', action: sharePayPage },
          { icon: <TrendingUp size={17} color="#818CF8" />, label: 'Download statement', sub: 'CSV / JSON transaction history', action: () => setActiveView('exports') },
        ].map((item, i) => (
          <button key={i} onClick={item.action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${C.bdr}`, cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent', textAlign: 'left' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.surf2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.t3 }}>{item.sub}</div>
            </div>
            <ChevronRight size={15} color={C.t3} />
          </button>
        ))}
      </div>

      {/* Recent incoming payments */}
      {recentReceived.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Recent incoming</div>
          <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 16, overflow: 'hidden' }}>
            {recentReceived.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.bdr}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,200,83,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.status === 'confirmed' ? <CheckCircle2 size={15} color={C.green} /> : item.status === 'pending' ? <Clock size={15} color={C.gold} /> : <AlertCircle size={15} color={C.red} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.description}</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>
                      {item.counterparty ?? 'Unknown'} · {new Date(item.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>+{item.amount.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
