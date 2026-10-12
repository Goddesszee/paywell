import { lazy, Suspense, useState, useMemo, useEffect, type ComponentType } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAppStore } from './store/appStore'
import { getCircleCreds, fetchPrimaryWallet } from './lib/circle-session'
import { PaymentRequestPayPage } from './components/pages/PaymentRequestPayPage'
import { PayByNamePage } from './components/pages/PayByNamePage'
import { PayByInvoicePage } from './components/pages/PayByInvoicePage'
import { InvoicePage } from './components/pages/InvoicePage'
import { BatchPayrollPage } from './components/pages/BatchPayrollPage'
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
import { ReferralPage } from './components/pages/ReferralPage'
import { MainnetSetupPage } from './components/pages/MainnetSetupPage'
import { WelcomeBalloon } from './components/WelcomeBalloon'
import { useActivityStream } from './hooks/useActivityStream'
import { usePresence } from './hooks/usePresence'

// Lazy-load Circle App Kit pages — they import @circle-fin/app-kit which
// initialises sub-kit module-level code. Loading them lazily ensures React's
// internal dispatcher is fully set up before any kit code runs.
// If a lazy chunk fails (stale tab after a deploy — old hash no longer exists on CDN),
// reload ONCE per chunk to pick up the new bundle. Each chunk gets its own key so a
// Bridge reload doesn't consume the Swap reload budget.
function lazyWithReload<T extends ComponentType<Record<string, unknown>>>(chunkName: string, factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const KEY = `chunk-reload-${chunkName}`
    try {
      const mod = await factory()
      try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
      return mod
    } catch (err) {
      // Only reload for fetch/network errors (stale CDN hash) — not for JS runtime errors.
      const msg = err instanceof Error ? err.message : String(err)
      const isChunkLoadError = /failed to fetch|loading chunk|load module|dynamically imported|unexpected token/i.test(msg)
      let alreadyReloaded = false
      try { alreadyReloaded = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }
      if (isChunkLoadError && !alreadyReloaded) {
        window.location.reload()
        return new Promise<{ default: T }>(() => { /* page is reloading */ })
      }
      throw err // not a chunk error, or already reloaded — let ErrorBoundary handle it
    }
  })
}

// TradePage wraps both Swap and Bridge in a unified card with tab switching
const TradePage  = lazyWithReload('trade', () => import('./components/pages/TradePage').then(m => ({ default: m.TradePage })))

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
  // Referral links look like nanarc.xyz/join?ref=<nan-name>. Remember the code when someone lands
  // with one, then credit the referrer ONCE (per joined wallet — the server enforces it) after the
  // friend has signed in.
  const joinedWallet = useAppStore(st => st.auth?.circleWalletAddress ?? st.auth?.walletAddress ?? '')
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref')
      if (ref && /^[a-zA-Z0-9-]{2,32}$/.test(ref)) localStorage.setItem('nan_pending_ref', ref)
    } catch { /* storage unavailable */ }
  }, [])
  // When a (referred) user's confirmed outgoing transfer is $100 or more, ask the server to verify it
  // on-chain. The server only credits the referrer if this wallet joined via a link, the transfer is a
  // real USDC transfer made after joining, and it hasn't been used before. Safe to call for anyone.
  useEffect(() => {
    if (!joinedWallet) return
    const SENT_KEY = 'nan_ref_qualify_sent'
    const check = () => {
      let sent: string[] = []
      try { sent = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as string[] } catch { /* ignore */ }
      for (const a of useAppStore.getState().activity) {
        if (!a.txHash || a.sign !== '-' || a.amount < 100 || a.status !== 'confirmed' || sent.includes(a.txHash)) continue
        const hash = a.txHash
        void fetch('/api/referral/qualify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: joinedWallet, txHash: hash }),
        }).then(r => {
          // definitive answers (even "not referred") are remembered; 5xx/429 are retried later
          if (r.status < 500 && r.status !== 429) {
            try {
              const cur = JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]') as string[]
              if (!cur.includes(hash)) localStorage.setItem(SENT_KEY, JSON.stringify([...cur, hash].slice(-50)))
            } catch { /* ignore */ }
          }
        }).catch(() => { /* retry next time */ })
      }
    }
    check()
    return useAppStore.subscribe(check)
  }, [joinedWallet])

  useEffect(() => {
    if (!joinedWallet) return
    let ref: string | null = null
    try { ref = localStorage.getItem('nan_pending_ref') } catch { /* ignore */ }
    if (!ref) return
    void fetch('/api/referral/use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ref, wallet: joinedWallet }),
    }).finally(() => { try { localStorage.removeItem('nan_pending_ref') } catch { /* ignore */ } })
  }, [joinedWallet])

  useEffect(() => {
    // Sessions created by Google login before the fix stored the wallet id only as `walletId`;
    // every Circle transaction path reads `circleWalletId`, so copy it across once.
    const a0 = useAppStore.getState().auth
    if (a0?.userToken && !a0.isPasskeyUser && !a0.circleWalletId && a0.walletId) {
      useAppStore.getState().setAuth({ ...a0, circleWalletId: a0.walletId })
    }
    // Sessions saved before the wallet existed (first-time email login race) have no address —
    // fetch it now so the app doesn't ask the user to "connect a wallet".
    if (a0?.userToken && !a0.isPasskeyUser && !a0.circleWalletAddress) {
      void fetchPrimaryWallet(a0.userToken, { attempts: 4 }).then(w => {
        if (!w) return
        const cur = useAppStore.getState().auth
        if (!cur || cur.userToken !== a0.userToken) return
        useAppStore.getState().setAuth({ ...cur, email: cur.email ?? '', circleWalletAddress: w.address, walletAddress: w.address, circleWalletId: w.id, walletId: w.id })
      })
    }
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

  // Keep signed-in users signed in: auth is persisted, but the current view is not,
  // so every reload used to start on the landing page. Restore the last page instead.
  useEffect(() => {
    const NO_RESTORE = new Set(['landing', 'login', 'onboarding', 'name', 'admin'])
    const st = useAppStore.getState()
    const a = st.auth
    if ((st.activeView === 'landing' || st.activeView === 'login') && (a?.walletAddress || a?.circleWalletAddress || a?.userToken || a?.sessionToken)) {
      let last = ''
      let namePromptShown = false
      try {
        last = localStorage.getItem('nan_last_view') ?? ''
        namePromptShown = localStorage.getItem('nan_name_prompt_shown') === '1'
      } catch { /* ignore */ }
      // Only redirect to the name page on the very first login (never seen it before
      // AND no display name set). Returning users always go to their last view or home.
      const needsName = !st.profile.displayName && !namePromptShown
      if (needsName) {
        try { localStorage.setItem('nan_name_prompt_shown', '1') } catch { /* ignore */ }
      }
      st.setActiveView(needsName ? 'name' : (last && !NO_RESTORE.has(last) ? last : 'home'))
    }
    // remember where the user is (only while signed in)
    return useAppStore.subscribe((s, prev) => {
      if (s.activeView === prev.activeView || !s.auth || NO_RESTORE.has(s.activeView)) return
      try { localStorage.setItem('nan_last_view', s.activeView) } catch { /* ignore */ }
    })
  }, [])
  const [splashDone, setSplashDone] = useState(() => {
    // only show splash on first ever visit per session
    if (sessionStorage.getItem('nan_splash_shown')) return true
    sessionStorage.setItem('nan_splash_shown', '1')
    return false
  })

  // Detect public pay links — ?nanpay=alice, ?pr=<id>, ?pay=<address>&amount=<n>, ?onramp=1
  // These must work for anyone (no NAN account), so intercept before auth/shell.
  const prParams = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const nanpay   = p.get('nanpay') ?? ''
    const invoice  = p.get('invoice') ?? ''
    const pr       = p.get('pr') ?? ''
    const pay      = p.get('pay') ?? ''
    const onramp   = p.get('onramp') ?? ''
    const send     = p.get('send') ?? ''
    const to       = p.get('to') ?? ''
    const amount   = parseFloat(p.get('amount') ?? '0')
    const note     = p.get('note') ?? ''
    const currency = (p.get('currency') ?? 'USDC') as 'USDC' | 'EURC'
    if (nanpay) return { nanpay, invoice: '', pr: '', pay: '', onramp: '', send: '', to: '', amount, note, currency }
    if (invoice) return { nanpay: '', invoice, pr: '', pay: '', onramp: '', send: '', to: '', amount, note, currency }
    if (pr || (pay && amount > 0)) return { nanpay: '', invoice: '', pr, pay, onramp: '', send: '', to: '', amount, note, currency }
    if (onramp) return { nanpay: '', invoice: '', pr: '', pay: '', onramp, send: '', to, amount, note, currency }
    if (send && to) return { nanpay: '', invoice: '', pr: '', pay: '', onramp: '', send, to, amount, note, currency }
    return null
  }, [])

  if (prParams?.nanpay) {
    return <PayByNamePage handle={prParams.nanpay} />
  }

  if (prParams?.invoice) {
    return <PayByInvoicePage invoiceId={prParams.invoice} />
  }

  if (prParams && (prParams.pr || prParams.pay)) {
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

  // ?send=1&to=<address>&amount=<n>&note=<text> — deep-link from invoice NAN tab
  // Store prefill in localStorage, WalletPage reads it on mount to pre-fill the send form.
  if (prParams?.send) {
    try {
      localStorage.setItem('nan_send_prefill', JSON.stringify({
        to: prParams.to,
        amount: prParams.amount > 0 ? String(prParams.amount) : '',
        note: prParams.note,
        currency: prParams.currency,
      }))
    } catch { /* storage unavailable */ }
    useAppStore.getState().setActiveView('send')
    try { window.history.replaceState({}, '', '/') } catch { /* ignore */ }
  }

  // ?onramp=1&to=<address>&amount=<n>&note=<text> — deep-link from invoice/payment pay-with-card
  // Pass the merchant address as destinationAddress so USDC lands on the merchant directly.
  if (prParams?.onramp) {
    const { setOnrampPrefill, setActiveView } = useAppStore.getState()
    setOnrampPrefill({
      ...(prParams.amount > 0 ? { amount: prParams.amount } : {}),
      ...(prParams.to ? { destinationAddress: prParams.to } : {}),
      ...(prParams.note ? { note: prParams.note } : {}),
    })
    setActiveView('onramp')
    // Clear the query string so refreshing doesn't re-trigger
    try { window.history.replaceState({}, '', '/') } catch { /* ignore */ }
  }

  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />

  // Public pages — no shell
  if (activeView === 'landing') return <LandingPage />
  if (activeView === 'login') return <LoginPage />
  if (activeView === 'onboarding') return <OnboardingPage />
  if (activeView === 'name') return <><WelcomeBalloon /><NamePage /></>
  if (activeView === 'admin') return <AdminDashboard />
  if (activeView === 'setup') return <MainnetSetupPage />

  // App pages — inside the shell
  return (
    <>
    <WelcomeBalloon />
    <AppShell>
      {activeView === 'home' && <HomePage />}
      {activeView === 'dashboard' && <DashboardPage />}
      {activeView === 'wallet' && <WalletPage />}
      {activeView === 'send' && <WalletPage initialSubView="send" />}
      {activeView === 'receive' && <WalletPage initialSubView="receive" />}
      {activeView === 'agent' && <AgentPage />}
      {activeView === 'agent-wallet' && <AgentWalletExperience />}
      {activeView === 'bridge' && <ErrorBoundary key="bridge"><Suspense fallback={<PageLoading />}><TradePage initialTab="bridge" /></Suspense></ErrorBoundary>}
      {activeView === 'swap'   && <ErrorBoundary key="swap"><Suspense fallback={<PageLoading />}><TradePage initialTab="swap" /></Suspense></ErrorBoundary>}
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
      {activeView === 'referral' && <ReferralPage />}
      {activeView === 'invoices' && <InvoicePage />}
      {activeView === 'payroll' && <BatchPayrollPage />}
    </AppShell>
    </>

  )
}
