import { lazy, Suspense, useState, useMemo } from 'react'
import { useAppStore } from './store/appStore'
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

// Lazy-load Circle App Kit pages — they import @circle-fin/app-kit which
// initialises sub-kit module-level code. Loading them lazily ensures React's
// internal dispatcher is fully set up before any kit code runs.
const BridgePage = lazy(() => import('./components/pages/BridgePage').then(m => ({ default: m.BridgePage })))
const SwapPage   = lazy(() => import('./components/pages/SwapPage').then(m => ({ default: m.SwapPage })))
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

export default function App() {
  const { activeView } = useAppStore()
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
      {activeView === 'bridge' && <Suspense fallback={null}><BridgePage /></Suspense>}
      {activeView === 'swap'   && <Suspense fallback={null}><SwapPage /></Suspense>}
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
    </AppShell>
  )
}
