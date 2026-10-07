import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { A2APaymentRecord, A2ATask } from '../lib/agent-network'

// ── NAN session auth ───────────────────────────────────────────────────────
export interface PaywellAuth {
  email: string
  sessionToken?: string
  walletAddress?: string
  walletId?: string
  pendingOtpToken?: string
  pendingOtpExpiry?: number
  userToken?: string
  encryptionKey?: string
  circleWalletAddress?: string
  circleWalletId?: string
  /** Set when the user logged in via Circle Modular Wallet (passkey/WebAuthn) */
  isPasskeyUser?: boolean
}

// ── Recurring Payment Task ─────────────────────────────────────────────────
export type RecurringFrequency = 'manual' | 'daily' | 'weekly' | 'monthly'

export interface RecurringTask {
  id: string
  name: string
  recipient: string
  amount: string
  active: boolean
  frequency: RecurringFrequency
  nextRunAt?: string
  lastRun?: string
  lastTxHash?: string
  runCount: number
  createdAt: string
}

export type ActivityType = 'received' | 'sent' | 'purchase' | 'agent_purchase' | 'request' | 'bridge' | 'swap'

export interface ActivityItem {
  id: string
  type: ActivityType
  description: string
  amount: number
  sign: '+' | '-'
  timestamp: Date
  status: 'confirmed' | 'pending' | 'failed'
  counterparty?: string
  txHash?: string
  agentInitiated?: boolean
  /** Chain name for explorer URL routing (e.g. "Arc Testnet", "Base Sepolia") */
  chain?: string
}

export interface AgentPermissions {
  enabled: boolean
  dailyLimit: number
  perTxLimit: number
  perServiceLimit: number
  allowedCategories: string[]
  requireApproval: boolean
  autoApproveUnder: number
  requireApprovalAbove: number
}

export interface AgentExecutionLog {
  id: string
  taskId: string
  userRequest: string
  serviceId?: string
  serviceName?: string
  status: 'complete' | 'blocked' | 'error' | 'awaiting_approval'
  cost: number
  result?: string
  error?: string
  timestamp: Date
}

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  action?: 'search' | 'purchase_request' | 'purchase_complete' | 'info'
  approved?: boolean
  serviceSource?: string
  nanAction?: Record<string, unknown>
  marketplaceServices?: import('../lib/api').MarketplaceServiceCard[]
}

export interface OnboardingState {
  completed: boolean
  step: number
  useCases: string[]
  agentConfigured: boolean
}

// ── Favorite type ────────────────────────────────────────────────────────────
export interface FavoriteItem {
  id: string
  refId: string
  type: 'faq' | 'page'
  title: string
  subtitle?: string
  href?: string
  savedAt: string
}

// ── User profile ─────────────────────────────────────────────────────────────
export interface UserProfile {
  displayName: string
  bio: string
  avatarUrl: string
  notifPrefs: {
    supportReplies: boolean
    systemUpdates: boolean
    payments: boolean
  }
}

// ── Notification type ─────────────────────────────────────────────────────────
export interface AppNotification {
  id: string
  userEmail: string
  type: 'support' | 'support_reply' | 'system' | 'payment'
  title: string
  body: string
  read: boolean
  createdAt: string
  ticketId?: string
}

export interface AgentWalletState {
  provisioned: boolean
  address?: string
  walletId?: string
  balance_usdc: string
  lastRefreshed?: string
  userToken?: string
  encryptionKey?: string
  blockchain?: string
  accountType?: string
  custodyType?: string
  createDate?: string | null
  walletState?: string
}

export interface AgentSpendEntry {
  id: string
  service_id: string
  service_name: string
  amount_usdc: number
  txId?: string
  paid: boolean
  timestamp: string
}

// Fields that are per-user and must be wiped on logout / account switch.
const USER_DEFAULTS = {
  activity:         [] as ActivityItem[],
  agentMessages:    [] as AgentMessage[],
  agentExecutionLog: [] as AgentExecutionLog[],
  recurringTasks:   [] as RecurringTask[],
  a2aPayments:      [] as A2APaymentRecord[],
  a2aTasks:         [] as A2ATask[],
  agentWallet:      { provisioned: false, balance_usdc: '0' } as AgentWalletState,
  agentSpendLog:    [] as AgentSpendEntry[],
  agentDailyUsed:   0,
  mainWalletBalance: '0',
  mainWalletAddress: '',
  crossChainBalances: {} as Record<string, string>,
  notifications:    [] as AppNotification[],
  unreadCount:      0,
  profile:          { displayName: '', bio: '', avatarUrl: '', notifPrefs: { supportReplies: true, systemUpdates: true, payments: true } } as UserProfile,
  favorites:        [] as FavoriteItem[],
  recentSearches:   [] as string[],
  selectedServiceIds: [] as string[],
}

export interface AppState {
  auth: PaywellAuth | null
  setAuth: (auth: PaywellAuth | null) => void
  setWallet: (walletAddress: string, walletId: string) => void
  /** Full logout: clears auth and all per-user data. */
  logout: () => void

  onboarding: OnboardingState
  setOnboarding: (update: Partial<OnboardingState>) => void

  activity: ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void

  agentPermissions: AgentPermissions
  setAgentPermissions: (update: Partial<AgentPermissions>) => void
  agentDailyUsed: number
  agentMessages: AgentMessage[]
  addAgentMessage: (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  clearAgentMessages: () => void
  approveAgentPurchase: (msgId: string) => void
  rejectAgentPurchase: (msgId: string) => void
  resetDailyUsage: () => void
  agentExecutionLog: AgentExecutionLog[]
  addExecutionLog: (entry: Omit<AgentExecutionLog, 'id' | 'timestamp'>) => void
  clearExecutionLog: () => void

  activeView: string
  setActiveView: (view: string) => void
  previousView: string | null

  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void

  notifications: AppNotification[]
  unreadCount: number
  setNotifications: (n: AppNotification[]) => void
  addLocalNotification: (n: Omit<AppNotification, 'id' | 'userEmail' | 'read' | 'createdAt'>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  fetchNotifications: () => Promise<void>

  favorites: FavoriteItem[]
  addFavorite: (item: Omit<FavoriteItem, 'id' | 'savedAt'>) => void
  removeFavorite: (id: string) => void
  isFavorite: (refId: string) => boolean

  recentSearches: string[]
  addSearch: (query: string) => void
  clearSearches: () => void

  profile: UserProfile
  setProfile: (p: Partial<UserProfile>) => void

  recurringTasks: RecurringTask[]
  addRecurringTask: (task: Omit<RecurringTask, 'id' | 'createdAt' | 'runCount'>) => string
  updateRecurringTask: (id: string, patch: Partial<RecurringTask>) => void
  removeRecurringTask: (id: string) => void
  recordRecurringRun: (id: string, txHash: string) => void

  a2aPayments: A2APaymentRecord[]
  addA2APayment: (record: A2APaymentRecord) => void
  a2aTasks: A2ATask[]
  addA2ATask: (task: A2ATask) => void
  clearA2ATasks: () => void

  agentWallet: AgentWalletState
  setAgentWallet: (w: Partial<AgentWalletState>) => void
  agentSpendLog: AgentSpendEntry[]
  addAgentSpend: (e: AgentSpendEntry) => void

  selectedServiceIds: string[]
  selectService: (id: string) => void
  deselectService: (id: string) => void
  isServiceSelected: (id: string) => boolean

  mainWalletBalance: string
  mainWalletAddress: string
  setMainWalletBalance: (balance: string, address: string) => void

  /** USDC balance on each chain keyed by chain name, e.g. { "Arc Testnet": "12.50", "Base Sepolia": "0.00" } */
  crossChainBalances: Record<string, string>
  setCrossChainBalances: (balances: Record<string, string>) => void

  bridgePrefill: { amount?: string; toChain?: string } | null
  setBridgePrefill: (p: { amount?: string; toChain?: string } | null) => void
  swapPrefill: { fromToken?: string; toToken?: string; amount?: string } | null
  setSwapPrefill: (p: { fromToken?: string; toToken?: string; amount?: string } | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      auth: null,
      setAuth: (auth) => set((s) => {
        // If the incoming wallet address differs from the current one, wipe all
        // per-user data so the new account starts with a clean slate.
        const prevAddr = s.auth?.walletAddress ?? s.auth?.circleWalletAddress ?? ''
        const nextAddr = auth?.walletAddress ?? auth?.circleWalletAddress ?? ''
        const accountChanged = !!auth && !!prevAddr && prevAddr !== nextAddr
        return accountChanged ? { auth, ...USER_DEFAULTS } : { auth }
      }),
      logout: () => set({ auth: null, ...USER_DEFAULTS }),
      setWallet: (walletAddress, walletId) =>
        set((s) => ({ auth: s.auth ? { ...s.auth, walletAddress, walletId } : null })),

      onboarding: { completed: false, step: 0, useCases: [], agentConfigured: false },
      setOnboarding: (update) => set((s) => ({ onboarding: { ...s.onboarding, ...update } })),

      activity: [],
      addActivity: (item) =>
        set((s) => ({
          activity: [
            { ...item, id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date() },
            ...s.activity,
          ],
        })),

      agentPermissions: {
        enabled: true, dailyLimit: 20, perTxLimit: 10, perServiceLimit: 5,
        allowedCategories: ['tech', 'digital', 'home'],
        requireApproval: false, autoApproveUnder: 1, requireApprovalAbove: 5,
      },
      setAgentPermissions: (update) =>
        set((s) => ({ agentPermissions: { ...s.agentPermissions, ...update } })),
      agentDailyUsed: 0,
      agentMessages: [{
        id: 'msg-welcome',
        role: 'agent',
        content: "Hi! I'm NAN — your financial assistant. I can check your balances, send USDC, bridge, swap, set up recurring payments, and manage your spending policy. What would you like to do?",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
      }],
      addAgentMessage: (msg) =>
        set((s) => ({
          agentMessages: [
            ...s.agentMessages,
            { ...msg, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date() },
          ],
        })),
      clearAgentMessages: () =>
        set({
          agentMessages: [{
            id: 'msg-welcome-reset',
            role: 'agent',
            content: "Sure, starting fresh. What would you like to do?",
            timestamp: new Date(),
          }],
        }),
      approveAgentPurchase: (msgId) => {
        const state = get()
        const msg = state.agentMessages.find((m) => m.id === msgId)
        if (!msg) return
        set((s) => ({
          agentMessages: s.agentMessages.map((m) => m.id === msgId ? { ...m, approved: true } : m),
        }))
      },
      rejectAgentPurchase: (msgId) =>
        set((s) => ({
          agentMessages: s.agentMessages.map((m) => m.id === msgId ? { ...m, approved: false } : m),
        })),
      resetDailyUsage: () => set({ agentDailyUsed: 0 }),

      agentExecutionLog: [],
      addExecutionLog: (entry) =>
        set((s) => ({
          agentExecutionLog: [
            { ...entry, id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date() },
            ...s.agentExecutionLog,
          ].slice(0, 100),
        })),
      clearExecutionLog: () => set({ agentExecutionLog: [] }),

      activeView: 'landing',
      setActiveView: (view) => set((s) => ({ previousView: s.activeView, activeView: view })),
      previousView: null,

      theme: 'dark',
      setTheme: (t) => { document.documentElement.setAttribute('data-theme', t); set({ theme: t }) },

      notifications: [],
      unreadCount: 0,
      setNotifications: (notifications) =>
        set({ notifications, unreadCount: notifications.filter(n => !n.read).length }),
      addLocalNotification: (n) =>
        set((s) => {
          const auth = s.auth
          const notification: AppNotification = {
            ...n,
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            userEmail: auth?.email ?? '',
            read: false,
            createdAt: new Date().toISOString(),
          }
          const notifications = [notification, ...s.notifications]
          return { notifications, unreadCount: notifications.filter(x => !x.read).length }
        }),
      markNotificationRead: (id) =>
        set((s) => {
          const notifications = s.notifications.map(n => n.id === id ? { ...n, read: true } : n)
          const auth = s.auth
          if (auth?.sessionToken) {
            fetch('/api/notifications/read', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.sessionToken}` },
              body: JSON.stringify({ id }),
            }).catch(() => {})
          }
          return { notifications, unreadCount: notifications.filter(n => !n.read).length }
        }),
      markAllNotificationsRead: () =>
        set((s) => {
          const notifications = s.notifications.map(n => ({ ...n, read: true }))
          const auth = s.auth
          if (auth?.sessionToken) {
            fetch('/api/notifications/read', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.sessionToken}` },
              body: JSON.stringify({ all: true }),
            }).catch(() => {})
          }
          return { notifications, unreadCount: 0 }
        }),
      fetchNotifications: async () => {
        const auth = get().auth
        if (!auth?.sessionToken) return
        try {
          const res = await fetch('/api/notifications', {
            headers: { authorization: `Bearer ${auth.sessionToken}` },
          })
          if (!res.ok) return
          const data = await res.json() as { notifications: AppNotification[] }
          set({ notifications: data.notifications, unreadCount: data.notifications.filter(n => !n.read).length })
        } catch { /* ignore */ }
      },

      favorites: [],
      addFavorite: (item) =>
        set((s) => {
          if (s.favorites.some(f => f.refId === item.refId)) return s
          return { favorites: [{ ...item, id: `fav-${Date.now()}`, savedAt: new Date().toISOString() }, ...s.favorites] }
        }),
      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter(f => f.id !== id) })),
      isFavorite: (refId) => get().favorites.some(f => f.refId === refId),

      recentSearches: [],
      addSearch: (query) => {
        const q = query.trim()
        if (!q) return
        set((s) => { const filtered = s.recentSearches.filter(r => r !== q); return { recentSearches: [q, ...filtered].slice(0, 10) } })
      },
      clearSearches: () => set({ recentSearches: [] }),

      profile: { displayName: '', bio: '', avatarUrl: '', notifPrefs: { supportReplies: true, systemUpdates: true, payments: true } },
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      recurringTasks: [],
      addRecurringTask: (task) => {
        const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
        set((s) => ({ recurringTasks: [...s.recurringTasks, { ...task, id, runCount: 0, createdAt: new Date().toISOString() }] }))
        return id
      },
      updateRecurringTask: (id, patch) =>
        set((s) => ({ recurringTasks: s.recurringTasks.map(t => t.id === id ? { ...t, ...patch } : t) })),
      removeRecurringTask: (id) =>
        set((s) => ({ recurringTasks: s.recurringTasks.filter(t => t.id !== id) })),
      recordRecurringRun: (id, txHash) =>
        set((s) => {
          const now = new Date()
          return {
            recurringTasks: s.recurringTasks.map(t => {
              if (t.id !== id) return t
              let nextRunAt: string | undefined
              if (t.frequency === 'daily')   nextRunAt = new Date(now.getTime() + 86400000).toISOString()
              if (t.frequency === 'weekly')  nextRunAt = new Date(now.getTime() + 7*86400000).toISOString()
              if (t.frequency === 'monthly') nextRunAt = new Date(now.getFullYear(), now.getMonth()+1, now.getDate()).toISOString()
              return { ...t, lastRun: now.toLocaleString(), lastTxHash: txHash, runCount: t.runCount+1, nextRunAt }
            }),
          }
        }),

      a2aPayments: [],
      addA2APayment: (record) => set((s) => ({ a2aPayments: [record, ...s.a2aPayments].slice(0, 200) })),
      a2aTasks: [],
      addA2ATask: (task) => set((s) => ({ a2aTasks: [task, ...s.a2aTasks].slice(0, 50) })),
      clearA2ATasks: () => set({ a2aTasks: [] }),

      agentWallet: { provisioned: false, balance_usdc: '0' },
      setAgentWallet: (w) => set((s) => ({ agentWallet: { ...s.agentWallet, ...w } })),
      agentSpendLog: [],
      addAgentSpend: (e) => set((s) => ({ agentSpendLog: [e, ...s.agentSpendLog].slice(0, 200) })),

      selectedServiceIds: [],
      selectService: (id) =>
        set((s) => ({ selectedServiceIds: s.selectedServiceIds.includes(id) ? s.selectedServiceIds : [...s.selectedServiceIds, id] })),
      deselectService: (id) =>
        set((s) => ({ selectedServiceIds: s.selectedServiceIds.filter((x) => x !== id) })),
      isServiceSelected: (id) => get().selectedServiceIds.includes(id),

      mainWalletBalance: '0',
      mainWalletAddress: '',
      setMainWalletBalance: (balance, address) => set({ mainWalletBalance: balance, mainWalletAddress: address }),

      crossChainBalances: {},
      setCrossChainBalances: (balances) => set({ crossChainBalances: balances }),

      bridgePrefill: null,
      setBridgePrefill: (p) => set({ bridgePrefill: p }),
      swapPrefill: null,
      setSwapPrefill: (p) => set({ swapPrefill: p }),
    }),
    {
      name: 'paywell-state-v2',
      partialize: (s) => ({
        auth: s.auth, onboarding: s.onboarding,
        agentPermissions: s.agentPermissions,
        agentDailyUsed: s.agentDailyUsed,
        agentMessages: s.agentMessages,
        agentExecutionLog: s.agentExecutionLog,
        activity: s.activity,
        favorites: s.favorites,
        recentSearches: s.recentSearches,
        profile: s.profile,
        recurringTasks: s.recurringTasks,
        a2aPayments: s.a2aPayments,
        a2aTasks: s.a2aTasks,
        agentWallet: s.agentWallet,
        agentSpendLog: s.agentSpendLog,
        selectedServiceIds: s.selectedServiceIds,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>
        // encryptionKey must never survive a page reload (security — it is the
        // W3S PIN-derived key and must only live in memory for the current session).
        // userToken is kept across reloads: it is a valid Circle UCW session token
        // for the full login session. Swap estimation works with userToken alone;
        // swap execution needs encryptionKey too and will prompt re-login if missing.
        if (p.auth) p.auth = { ...p.auth, encryptionKey: undefined }
        // agentWallet.encryptionKey must also never survive a reload
        if (p.agentWallet) p.agentWallet = { ...p.agentWallet, encryptionKey: undefined }
        return {
          ...current,
          ...p,
          activity: (p.activity ?? current.activity).map((a) => ({ ...a, timestamp: new Date(a.timestamp) })),
          agentMessages: (p.agentMessages ?? current.agentMessages).map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
          agentExecutionLog: (p.agentExecutionLog ?? current.agentExecutionLog ?? []).map((e) => ({ ...e, timestamp: new Date(e.timestamp) })),
          favorites: p.favorites ?? current.favorites ?? [],
          recentSearches: p.recentSearches ?? current.recentSearches ?? [],
          profile: p.profile ?? current.profile,
          recurringTasks: p.recurringTasks ?? current.recurringTasks ?? [],
          a2aPayments: p.a2aPayments ?? current.a2aPayments ?? [],
          a2aTasks: p.a2aTasks ?? current.a2aTasks ?? [],
          agentWallet: p.agentWallet ?? current.agentWallet ?? { provisioned: false, balance_usdc: '0' },
          agentSpendLog: p.agentSpendLog ?? current.agentSpendLog ?? [],
          selectedServiceIds: p.selectedServiceIds ?? current.selectedServiceIds ?? [],
        }
      },
    }
  )
)
