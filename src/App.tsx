import { lazy, Suspense, useState, useMemo, useEffect, type ComponentType } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppStore } from './store/appStore'
import { getCircleCreds } from './lib/circle-session'
import { PaymentRequestPayPage } from './components/pages/PaymentRequestPayPage'
import { SplashScreen } from './components/SplashScreen'
import { AppShell } from './components/layout/AppShell'
import { AgentWalletExperience } from './components/pages/AgentWalletExperience'
import { LandingPage } from './components/pages/LandingPage'
import { LoginPage } from './components/pages/LoginPage'
import { OnboardingPage } from './components/pages/OnboardingPage'
import { HomePage } from './components/pages/HomePage'
import { WalletPage } from './components/pages/WalletPage'
import { AgentPage } from './components/pages/AgentPage'
import { ActivityPage } from './components/pages/ActivityPage'
import { SettingsPage } from './components/pages/SettingsPage'
import { OnrampPage } from './components/pages/OnrampPage'
import { FaucetPage } from './components/pages/FaucetPage'
import { AdminDashboard } from './components/pages/AdminDashboard'
import { GatewayPage } from './components/pages/GatewayPage'
import { RecurringPage } from './components/pages/RecurringPage'
import { NotificationsPage } from './components/pages/NotificationsPage'
import { SupportPage } from './components/pages/SupportPage'
import { FAQPage } from './components/pages/FAQPage'
import { AboutPage } from './components/pages/AboutPage'
import { FeedbackPage } from './components/pages/FeedbackPage'
import { SuggestionsPage } from './components/pages/SuggestionsPage'
import { ProfilePage } from './components/pages/ProfilePage'
import { SearchPage } from './components/pages/SearchPage'
import { FavoritesPage } from './components/pages/FavoritesPage'
import { NamePage } from './components/pages/NamePage'
import { DashboardPage } from './components/pages/DashboardPage'
import { ExportsPage } from './components/pages/ExportsPage'
import { PaymentRequestsPage } from './components/pages/PaymentRequestsPage'
import { ContactsPage } from './components/pages/ContactsPage'
import { NanNamePage } from './components/pages/NanNamePage'
import { useActivityStream } from './hooks/useActivityStream'
import { usePresence } from './hooks/usePresence'

// Lazy-load Circle App Kit pages — they import @circle-fin/app-kit which
// initialises sub-kit module-level code. Loading them lazily ensures React's
// internal dispatcher is fully set up before any kit code runs.
// If a lazy chunk fails to load (typically a stale tab after a new deploy, where the old hashed
// file no longer exists), reload once to pick up the fresh bundle instead of leaving a blank page.
function lazyWithReload<T extends ComponentType<Record<string, unknown>>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const KEY = 'chunk-reload-once'
    try {
      const mod = await factory()
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      return mod
    } catch (err) {
      let alreadyReloaded = false
      try { alreadyReloaded = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }
      if (!alreadyReloaded) {
        window.location.reload()
        return new Promise<{ default: T }>(() => { /* page is reloading */ })
      }
      throw err // second failure: let the ErrorBoundary show a message
    }
  })
}

const BridgePage = lazyWithReload(() => import('./components/pages/BridgePage').then(m => ({ default: m.BridgePage })))
const SwapPage   = lazyWithReload(() => import('./components/pages/SwapPage').then(m => ({ default: m.SwapPage })))

function PageLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--nan-text2)', fontSize: 14 }}>
      Loading…
    </div>
  )
}


export default function App() {
  // Email/Google (Circle) users: the signing session key lives in memory/sessionStorage only, so it is
  // gone after the tab is closed. Restore it silently with the login refreshToken (Circle returns a
  // fresh key), on startup and whenever the tab becomes visible again. If this isn't possible the
  // actions themselves tell the user to sign in again.
  useEffect(() => {
    const restore = () => {
      const a = useAppStore.getState().auth
      if (!a?.userToken || !a.refreshToken) return
      if (getCircleCreds().encryptionKey) return
      void useAppStore.getState().refreshCircleToken()
    }
    restore()
    const onVisible = () => { if (document.visibilityState === 'visible') restore() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const { activeView } = useAppStore()
  useActivityStream() // real-time SSE feed — connects when wallet is present
  usePresence() // registers the user + wallets for the admin dashboard
  const [splashDone, setSplashDone] = useState(() => {
    // only show splash on first ever visit per session
    if (sessionStorage.getItem('nan_splash_shown')) return true
    sessionStorage.setItem('nan_splash_shown', '1')
    return false
  })

  // Detect payment request links — ?pr=<id> or ?pay=<address>&amount=<n>
  // These must work for anyone (no NAN account), so intercept before auth/shell.
  const prParams = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const pr     = p.get('pr') ?? ''
    const pay    = p.get('pay') ?? ''
    const amount = parseFloat(p.get('amount') ?? '0')
    const note   = p.get('note') ?? ''
    const currency = (p.get('currency') ?? 'USDC') as 'USDC' | 'EURC'
    if (pr || (pay && amount > 0)) return { pr, pay, amount, note, currency }
    return null
  }, [])

  if (prParams) {
    return (
      <PaymentRequestPayPage
        requestId={prParams.pr}
        payAddress={prParams.pay}
        amount={prParams.amount}
        note={prParams.note}
        currency={prParams.currency}
      />
    )
  }

  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />

  // Public pages — no shell
  if (activeView === 'landing') return <LandingPage />
  if (activeView === 'login') return <LoginPage />
  if (activeView === 'onboarding') return <OnboardingPage />
  if (activeView === 'name') return <NamePage />
  if (activeView === 'admin') return <AdminDashboard />

  // App pages — inside the shell
  return (
    <AppShell>
      {activeView === 'home' && <HomePage />}
      {activeView === 'dashboard' && <DashboardPage />}
      {activeView === 'wallet' && <WalletPage />}
      {activeView === 'send' && <WalletPage initialSubView="send" />}
      {activeView === 'receive' && <WalletPage initialSubView="receive" />}
      {activeView === 'agent' && <AgentPage />}
      {activeView === 'agent-wallet' && <AgentWalletExperience />}
      {activeView === 'bridge' && <ErrorBoundary key="bridge"><Suspense fallback={<PageLoading />}><BridgePage /></Suspense></ErrorBoundary>}
      {activeView === 'swap'   && <ErrorBoundary key="swap"><Suspense fallback={<PageLoading />}><SwapPage /></Suspense></ErrorBoundary>}
      {activeView === 'onramp' && <OnrampPage />}
      {activeView === 'faucet' && <FaucetPage />}
      {activeView === 'activity' && <ActivityPage />}
      {activeView === 'settings' && <SettingsPage />}
      {activeView === 'help' && <SettingsPage />}
      {activeView === 'gateway' && <GatewayPage />}
      {activeView === 'recurring' && <RecurringPage />}
      {activeView === 'notifications' && <NotificationsPage />}
      {activeView === 'support' && <SupportPage />}
      {activeView === 'faq' && <FAQPage />}
      {activeView === 'about' && <AboutPage />}
      {activeView === 'feedback' && <FeedbackPage />}
      {activeView === 'suggestions' && <SuggestionsPage />}
      {activeView === 'profile' && <ProfilePage />}
      {activeView === 'search' && <SearchPage />}
      {activeView === 'favorites' && <FavoritesPage />}
      {activeView === 'exports' && <ExportsPage />}
      {activeView === 'payment-requests' && <PaymentRequestsPage />}
      {activeView === 'contacts' && <ContactsPage />}
      {activeView === 'nan-name' && <NanNamePage />}
    </AppShell>
  )
}
