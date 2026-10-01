import { useAppStore } from './store/appStore'
import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LandingPage } from './components/pages/LandingPage'
import { LoginPage } from './components/pages/LoginPage'
import { OnboardingPage } from './components/pages/OnboardingPage'
import { HomePage } from './components/pages/HomePage'
import { WalletPage } from './components/pages/WalletPage'
import { AgentPage } from './components/pages/AgentPage'
import { ActivityPage } from './components/pages/ActivityPage'
import { SettingsPage } from './components/pages/SettingsPage'
import { BridgePage } from './components/pages/BridgePage'
import { SwapPage } from './components/pages/SwapPage'
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

export default function App() {
  const { activeView } = useAppStore()

  // Public pages — no shell
  if (activeView === 'landing') return <LandingPage />
  if (activeView === 'login') return <LoginPage />
  if (activeView === 'onboarding') return <OnboardingPage />
  if (activeView === 'name') return <NamePage />
  if (activeView === 'admin') return <AdminDashboard />

  // App pages — inside the shell
  return (
    <AppShell>
      <ErrorBoundary>
      {activeView === 'home' && <HomePage />}
      {activeView === 'dashboard' && <DashboardPage />}
      {activeView === 'wallet' && <WalletPage />}
      {activeView === 'send' && <WalletPage initialSubView="send" />}
      {activeView === 'receive' && <WalletPage initialSubView="receive" />}
      {activeView === 'agent' && <AgentPage />}
      {activeView === 'bridge' && <BridgePage />}
      {activeView === 'swap'   && <SwapPage />}
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
      </ErrorBoundary>
    </AppShell>
  )
}
