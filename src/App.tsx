import { useAppStore } from './store/appStore'
import { AppShell } from './components/layout/AppShell'
import { LandingPage } from './components/pages/LandingPage'
import { LoginPage } from './components/pages/LoginPage'
import { OnboardingPage } from './components/pages/OnboardingPage'
import { HomePage } from './components/pages/HomePage'
import { WalletPage } from './components/pages/WalletPage'
import { ShopPage } from './components/pages/ShopPage'
import { AgentPage } from './components/pages/AgentPage'
import { ActivityPage } from './components/pages/ActivityPage'
import { SettingsPage } from './components/pages/SettingsPage'
import { BridgePage } from './components/pages/BridgePage'
import { SwapPage } from './components/pages/SwapPage'
import { OnrampPage } from './components/pages/OnrampPage'

export default function App() {
  const { activeView } = useAppStore()

  // Public pages — no shell
  if (activeView === 'landing') return <LandingPage />
  if (activeView === 'login') return <LoginPage />
  if (activeView === 'onboarding') return <OnboardingPage />

  // App pages — inside the shell
  return (
    <AppShell>
      {activeView === 'home' && <HomePage />}
      {activeView === 'wallet' && <WalletPage />}
      {activeView === 'send' && <WalletPage initialSubView="send" />}
      {activeView === 'receive' && <WalletPage initialSubView="receive" />}
      {activeView === 'shop' && <ShopPage />}
      {activeView === 'agent' && <AgentPage />}
      {activeView === 'bridge' && <BridgePage />}
      {activeView === 'swap'   && <SwapPage />}
      {activeView === 'onramp' && <OnrampPage />}
      {activeView === 'activity' && <ActivityPage />}
      {activeView === 'settings' && <SettingsPage />}
      {activeView === 'help' && <SettingsPage />}
    </AppShell>
  )
}
