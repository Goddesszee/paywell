import { useEffect } from 'react'
import { Bell, CheckCheck, MessageSquare, Zap, Info, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { AppNotification } from '../../store/appStore'

const SANS = "var(--nan-font, 'Inter', sans-serif)"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function NotifIcon({ type }: { type: AppNotification['type'] }) {
  const map = {
    support: <MessageSquare size={16} color="var(--nan-blue)" />,
    support_reply: <MessageSquare size={16} color="var(--nan-green)" />,
    payment: <Zap size={16} color="var(--nan-gold)" />,
    system: <Info size={16} color="var(--nan-text2)" />,
  }
  const bgMap = {
    support: 'var(--nan-blue-dim)',
    support_reply: 'var(--nan-green-dim)',
    payment: 'var(--nan-gold-dim)',
    system: 'var(--nan-surface2)',
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: bgMap[type], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {map[type]}
    </div>
  )
}

export function NotificationsPage() {
  const { notifications, unreadCount, fetchNotifications, markNotificationRead, markAllNotificationsRead, setActiveView } = useAppStore()

  useEffect(() => {
    void fetchNotifications()
  }, [fetchNotifications])

  const handleNotifClick = (n: AppNotification) => {
    if (!n.read) markNotificationRead(n.id)
    if (n.ticketId) setActiveView('support')
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: SANS }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Bell size={18} color="var(--nan-blue)" />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--nan-text)' }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{ background: 'var(--nan-blue)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20, marginLeft: 4 }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--nan-text2)' }}>Account activity and support updates</div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 9, background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', color: 'var(--nan-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}
          >
            <CheckCheck size={13} />
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {notifications.length === 0 ? (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, padding: '52px 24px', textAlign: 'center' }}>
          <Bell size={32} style={{ margin: '0 auto 14px', color: 'var(--nan-text3)' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--nan-text)', marginBottom: 6 }}>No notifications yet</div>
          <div style={{ fontSize: 13, color: 'var(--nan-text2)', lineHeight: 1.6, maxWidth: 280, margin: '0 auto' }}>
            Account activity, support replies, and important updates will appear here.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--nan-surface)', border: '1px solid var(--nan-bdr)', borderRadius: 16, overflow: 'hidden' }}>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              onClick={() => handleNotifClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                borderBottom: i < notifications.length - 1 ? '1px solid var(--nan-bdr)' : 'none',
                background: n.read ? 'transparent' : 'var(--nan-blue-dim)',
                cursor: n.ticketId ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <NotifIcon type={n.type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: 'var(--nan-text)', lineHeight: 1.3 }}>
                    {n.title}
                    {!n.read && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--nan-blue)', marginLeft: 7, verticalAlign: 'middle', flexShrink: 0 }} />}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--nan-text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--nan-text2)', lineHeight: 1.5 }}>{n.body}</div>
                {n.ticketId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--nan-blue)', fontSize: 11, fontWeight: 600 }}>
                    View conversation <ChevronRight size={11} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
