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
  /* NAN public pay-page: the page scrolls inside #root itself, not the document.
     Android in-app browsers (WhatsApp / Telegram / Custom Tabs) and some WebViews
     do not reliably scroll the document when html/body overflow is customised,
     but a fixed full-screen element with overflow-y:auto scrolls everywhere. */
  html, body {
    height: 100% !important;
    overflow: hidden !important;
    position: static !important;
    overscroll-behavior: none;
  }
  #root {
    position: fixed !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    touch-action: pan-y pinch-zoom;
  }
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
