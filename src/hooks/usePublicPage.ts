/**
 * Injects a <style> tag that undoes the app-shell overflow:hidden
 * lock while a public pay-page is mounted, so the page can scroll
 * normally on all phones. Removes itself on unmount so the main
 * app is completely unaffected.
 *
 * Why a <style> tag instead of a CSS class?
 * The app CSS uses high-specificity selectors (#root, html, body)
 * with no equivalent counters available via a simple class toggle.
 * A dynamically-injected <style> at the end of <head> wins the
 * cascade cleanly, and is the only reliable cross-browser approach.
 */
import { useEffect } from 'react'

const STYLE_ID = 'nan-public-page-overrides'

const CSS = `
  /* NAN public pay-page: undo app-shell overflow lock */
  html, body {
    height: auto !important;
    min-height: 100% !important;
    overflow: auto !important;
    overflow-x: hidden !important;
    position: static !important;
  }
  #root {
    position: static !important;
    height: auto !important;
    min-height: 100dvh !important;
    overflow: visible !important;
    max-width: 100% !important;
  }
  /* Also target the inner app-root wrapper if present */
  #app-root {
    position: static !important;
    height: auto !important;
    overflow: visible !important;
    max-width: 100% !important;
  }
`

export function usePublicPage() {
  useEffect(() => {
    // Remove any leftover from a previous render
    document.getElementById(STYLE_ID)?.remove()

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head.appendChild(style)

    // Ensure html/body scroll position is at the top
    window.scrollTo(0, 0)

    return () => {
      document.getElementById(STYLE_ID)?.remove()
    }
  }, [])
}
