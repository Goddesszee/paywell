import { useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface Props {
  color?: string
  size?: number
}

export function NotificationBell({ color, size = 18 }: Props) {
  const { unreadCount, fetchNotifications, setActiveView, auth } = useAppStore()

  // Poll for new notifications every 30 seconds while logged in
  useEffect(() => {
    if (!auth?.sessionToken) return
    fetchNotifications()
    const interval = setInterval(() => fetchNotifications(), 30000)
    return () => clearInterval(interval)
  }, [auth?.sessionToken, fetchNotifications])

  return (
    <button
      onClick={() => setActiveView('notifications')}
      aria-label="Notifications"
      style={{ position: 'relative', width: 34, height: 34, borderRadius: 8, background: 'transparent', border: '1px solid var(--nan-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s', WebkitTapHighlightColor: 'transparent' }}
    >
      <Bell size={size} color={color ?? 'var(--nan-text2)'} />
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: 3, right: 3,
          width: unreadCount > 9 ? 16 : 14, height: 14,
          borderRadius: 7,
          background: 'var(--nan-blue)',
          color: '#fff',
          fontSize: 9, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
          pointerEvents: 'none',
        }}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
