/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import './tracing'
import './console-capture'

// Apply persisted theme before first render — no flash
;(function () {
  try {
    const s = localStorage.getItem('paywell-state-v2')
    const parsed = s ? (JSON.parse(s) as { state?: { theme?: string } }) : null
    const t = parsed?.state?.theme ?? null
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark')
  } catch { document.documentElement.setAttribute('data-theme', 'dark') }
})()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import './index.css'

// Apply persisted theme before first render to avoid flash
try {
  const raw = localStorage.getItem('paywell-state-v2')
  if (raw) {
    const parsed = JSON.parse(raw) as { state?: { theme?: string } }
    const t = parsed?.state?.theme
    if (t === 'light' || t === 'dark') {
      
    }
  }
} catch { /* ignore */ }

const queryClient = new QueryClient()



// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {/* ignore in dev */})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <App />
          <Toaster position="top-center" />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)

