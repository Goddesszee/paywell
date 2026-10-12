import { useEffect } from 'react'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
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

/** NAN app icon — rounded square with the N mark optically centred, like an OS notification. */
function NanAppIcon({ size = 44 }: { size?: number }) {
  const h = size * 0.5
  const w = h * (324 / 480)
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.26, background: '#0866F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 324 480" width={w} height={h} style={{ display: 'block' }} aria-hidden>
        <path d="M255,0 L84,167 L71,163 L0,97 L0,378 L246,132 L255,110 Z" fill="#fff" />
        <path d="M69,480 L240,313 L253,317 L324,383 L324,102 L78,348 L69,370 Z" fill="#fff" />
      </svg>
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
    if (n.type === 'invoice_paid' || n.type === 'invoice_claimed') {
      // Store the invoiceId so InvoicePage can highlight it, then navigate
      if (n.invoiceId) {
        try { localStorage.setItem('nan_highlight_invoice', n.invoiceId) } catch { /* ignore */ }
      }
      setActiveView('invoices')
    } else if (n.ticketId) {
      setActiveView('support')
    }
  }

  return (
    <div style={{ width: '100%', minHeight: '100%', fontFamily: SANS }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotifClick(n)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                borderRadius: 22,
                background: 'var(--nan-surface)',
                border: `1px solid ${n.read ? 'var(--nan-bdr)' : 'rgba(8,102,245,0.35)'}`,
                boxShadow: n.read ? 'none' : '0 2px 14px rgba(8,102,245,0.10)',
                cursor: (n.ticketId || n.type === 'invoice_paid' || n.type === 'invoice_claimed') ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              <NanAppIcon size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--nan-text)', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                    {!n.read && <span aria-label="Unread" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--nan-blue)', flexShrink: 0 }} />}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--nan-text3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--nan-text2)', lineHeight: 1.4, marginTop: 2 }}>{n.body}</div>
                {(n.type === 'invoice_paid' || n.type === 'invoice_claimed') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, color: 'var(--nan-blue)', fontSize: 12, fontWeight: 600 }}>
                    View invoice <ChevronRight size={12} />
                  </div>
                )}
                {n.ticketId && n.type !== 'invoice_paid' && n.type !== 'invoice_claimed' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, color: 'var(--nan-blue)', fontSize: 12, fontWeight: 600 }}>
                    View conversation <ChevronRight size={12} />
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
