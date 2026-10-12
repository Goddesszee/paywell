/**
 * Toggles the `nan-public-page` class on <html> while a public pay-page
 * is mounted. This unlocks the overflow:hidden set by the app shell so the
 * page can scroll normally on mobile — without affecting the main app.
 */
import { useEffect } from 'react'

export function usePublicPage() {
  useEffect(() => {
    document.documentElement.classList.add('nan-public-page')
    return () => {
      document.documentElement.classList.remove('nan-public-page')
    }
  }, [])
}
