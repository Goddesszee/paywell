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

// ── Payment Request ───────────────────────────────────────────────────────────
export type PaymentRequestStatus = 'pending' | 'viewed' | 'paid' | 'expired' | 'cancelled'

export interface PaymentRequest {
  id: string
  refNumber: string
  title: string
  description?: string
  recipientName?: string
  recipientContact?: string
  amount: number
  currency: string
  note?: string
  paymentInstructions?: string
  reference?: string
  dueDate?: string
  createdAt: string
  status: PaymentRequestStatus
  paidAt?: string
  paidTxHash?: string
  paidAmount?: number
  activityId?: string
  creatorAddress?: string
  creatorName?: string
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

// ── Invoice system ────────────────────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface InvoiceLineItem {
  id: string
  name: string
  description?: string
  quantity: number
  unitPrice: number
  discount?: number   // percentage 0-100
  tax?: number        // percentage 0-100
}

export interface InvoicePayment {
  id: string
  date: string        // ISO
  amount: number
  txHash?: string
  note?: string
}

export interface Invoice {
  id: string
  number: string      // e.g. "INV-0001"
  status: InvoiceStatus
  // Business (sender)
  businessName: string
  businessAddress?: string
  businessEmail?: string
  businessPhone?: string
  logoUrl?: string
  // Customer (recipient)
  customerName: string
  customerEmail?: string
  customerPhone?: string
  customerAddress?: string
  // Invoice meta
  issueDate: string   // ISO date string
  dueDate: string
  currency: string    // 'USDC' | 'EURC' | 'USD' etc.
  notes?: string
  paymentInstructions?: string
  // Items
  items: InvoiceLineItem[]
  // Totals (computed, stored for display)
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  // Payments received
  payments: InvoicePayment[]
  amountPaid: number
  amountDue: number
  // Wallet address to receive payment on-chain
  payToAddress?: string
  // Optional link to a PaymentRequest
  paymentRequestId?: string
  createdAt: string
  updatedAt: string
}

// ── Per-user defaults ─────────────────────────────────────────────────────────
const USER_DEFAULTS = {
  activity:         [] as ActivityItem[],
  agentMessages:    [] as AgentMessage[],
  agentExecutionLog: [] as AgentExecutionLog[],
  recurringTasks:   [] as RecurringTask[],
  paymentRequests:  [] as PaymentRequest[],
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
  invoices:           [] as Invoice[],
  invoiceSeq:         1,
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

  paymentRequests: PaymentRequest[]
  addPaymentRequest: (req: Omit<PaymentRequest, 'id' | 'createdAt' | 'refNumber'>) => string
  updatePaymentRequest: (id: string, patch: Partial<PaymentRequest>) => void
  removePaymentRequest: (id: string) => void
  markPaymentRequestPaid: (id: string, txHash: string, amount: number, activityId?: string) => void

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

  /**
   * Silently refresh a Circle UCW userToken using the backend refresh-session
   * endpoint. Updates auth.userToken in the store and returns the new token,
   * or returns undefined if the refresh failed (caller should force re-login).
   */
  refreshCircleToken: () => Promise<string | undefined>

  /** USDC balance on each chain keyed by chain name, e.g. { "Arc Testnet": "12.50", "Base Sepolia": "0.00" } */
  crossChainBalances: Record<string, string>
  setCrossChainBalances: (balances: Record<string, string>) => void

  bridgePrefill: { amount?: string; toChain?: string } | null
  setBridgePrefill: (p: { amount?: string; toChain?: string } | null) => void
  swapPrefill: { fromToken?: string; toToken?: string; amount?: string } | null
  setSwapPrefill: (p: { fromToken?: string; toToken?: string; amount?: string } | null) => void

  // ── Invoice ──────────────────────────────────────────────────────────────────
  invoices: Invoice[]
  invoiceSeq: number
  addInvoice: (inv: Omit<Invoice, 'id' | 'number' | 'createdAt' | 'updatedAt'>) => Invoice
  updateInvoice: (id: string, patch: Partial<Invoice>) => void
  removeInvoice: (id: string) => void
  recordInvoicePayment: (invoiceId: string, payment: Omit<InvoicePayment, 'id'>) => void
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
      addActivity: (item) => {
        set((s) => ({
          activity: [
            {
              ...item,
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: (item as Partial<ActivityItem>).timestamp ?? new Date(),
            },
            ...s.activity,
          ],
        }))
        // Report to server ledger (fire-and-forget — never block the UI)
        const state = get()
        const token = state.auth?.sessionToken
        fetch('/api/tx-track', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            walletType: 'main',
            walletAddress: state.auth?.walletAddress ?? state.mainWalletAddress ?? '',
            type: item.type,
            amount: item.amount,
            description: item.description,
            counterparty: item.counterparty,
            txHash: (item as Partial<ActivityItem>).txHash,
            chain: (item as Partial<ActivityItem>).chain ?? 'Arc Testnet',
          }),
        }).catch(() => {})
      },

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
          // Merge server notifications with local ones (e.g. payment notifications
          // generated client-side). Keep local-only entries that aren't on the server,
          // and use server state for everything else so read-status is authoritative.
          set((s) => {
            const serverIds = new Set(data.notifications.map(n => n.id))
            const localOnly = s.notifications.filter(n => n.id.startsWith('local-') && !serverIds.has(n.id))
            const merged = [...localOnly, ...data.notifications]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            return { notifications: merged, unreadCount: merged.filter(n => !n.read).length }
          })
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

      paymentRequests: [],
      addPaymentRequest: (req) => {
        const id  = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const seq = (get().paymentRequests.length + 1).toString().padStart(4, '0')
        const refNumber = `NAN-PR-${seq}`
        const pr: PaymentRequest = { ...req, id, refNumber, createdAt: new Date().toISOString() }
        set((s) => ({ paymentRequests: [pr, ...s.paymentRequests] }))
        return id
      },
      updatePaymentRequest: (id, patch) =>
        set((s) => ({ paymentRequests: s.paymentRequests.map(r => r.id === id ? { ...r, ...patch } : r) })),
      removePaymentRequest: (id) =>
        set((s) => ({ paymentRequests: s.paymentRequests.filter(r => r.id !== id) })),
      markPaymentRequestPaid: (id, txHash, amount, activityId) =>
        set((s) => ({ paymentRequests: s.paymentRequests.map(r => r.id === id
          ? { ...r, status: 'paid', paidAt: new Date().toISOString(), paidTxHash: txHash, paidAmount: amount, activityId }
          : r
        )})),

      a2aPayments: [],
      addA2APayment: (record) => set((s) => ({ a2aPayments: [record, ...s.a2aPayments].slice(0, 200) })),
      a2aTasks: [],
      addA2ATask: (task) => set((s) => ({ a2aTasks: [task, ...s.a2aTasks].slice(0, 50) })),
      clearA2ATasks: () => set({ a2aTasks: [] }),

      agentWallet: { provisioned: false, balance_usdc: '0' },
      setAgentWallet: (w) => set((s) => ({ agentWallet: { ...s.agentWallet, ...w } })),
      agentSpendLog: [],
      addAgentSpend: (e) => {
        set((s) => ({ agentSpendLog: [e, ...s.agentSpendLog].slice(0, 200) }))
        // Report to server ledger (fire-and-forget)
        const state = get()
        const token = state.auth?.sessionToken
        fetch('/api/tx-track', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            walletType: 'agent',
            walletAddress: state.agentWallet?.address ?? '',
            userEmail: state.auth?.email ?? 'anonymous',
            type: 'agent_spend',
            amount: e.amount_usdc,
            description: e.service_name,
            txHash: e.txId,
            chain: 'Arc Testnet',
          }),
        }).catch(() => {})
      },

      selectedServiceIds: [],
      selectService: (id) =>
        set((s) => ({ selectedServiceIds: s.selectedServiceIds.includes(id) ? s.selectedServiceIds : [...s.selectedServiceIds, id] })),
      deselectService: (id) =>
        set((s) => ({ selectedServiceIds: s.selectedServiceIds.filter((x) => x !== id) })),
      isServiceSelected: (id) => get().selectedServiceIds.includes(id),

      mainWalletBalance: '0',
      mainWalletAddress: '',
      setMainWalletBalance: (balance, address) => set({ mainWalletBalance: balance, mainWalletAddress: address }),

      refreshCircleToken: async () => {
        const auth = get().auth
        const oldToken = auth?.userToken
        if (!oldToken) return undefined
        try {
          const resp = await fetch('/api/wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'refresh-session', userToken: oldToken }),
          })
          const data = await resp.json() as { userToken?: string; encryptionKey?: string; error?: string }
          if (!resp.ok || !data.userToken) return undefined
          // Update the store with the fresh token (keep encryptionKey if the server returns one)
          set((s) => ({
            auth: s.auth
              ? { ...s.auth, userToken: data.userToken!, sessionToken: data.userToken!, ...(data.encryptionKey ? { encryptionKey: data.encryptionKey } : {}) }
              : s.auth,
          }))
          return data.userToken
        } catch {
          return undefined
        }
      },

      crossChainBalances: {},
      setCrossChainBalances: (balances) => set({ crossChainBalances: balances }),

      bridgePrefill: null,
      setBridgePrefill: (p) => set({ bridgePrefill: p }),
      swapPrefill: null,
      setSwapPrefill: (p) => set({ swapPrefill: p }),

      // ── Invoice ────────────────────────────────────────────────────────────
      invoices: [],
      invoiceSeq: 1,
      addInvoice: (inv) => {
        const seq   = get().invoiceSeq
        const num   = `INV-${String(seq).padStart(4, '0')}`
        const now   = new Date().toISOString()
        const full: Invoice = {
          ...inv,
          id:        `inv-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          number:    num,
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({ invoices: [full, ...s.invoices], invoiceSeq: s.invoiceSeq + 1 }))
        return full
      },
      updateInvoice: (id, patch) =>
        set(s => ({
          invoices: s.invoices.map(inv =>
            inv.id === id ? { ...inv, ...patch, updatedAt: new Date().toISOString() } : inv
          ),
        })),
      removeInvoice: (id) =>
        set(s => ({ invoices: s.invoices.filter(inv => inv.id !== id) })),
      recordInvoicePayment: (invoiceId, payment) =>
        set(s => {
          const entry: InvoicePayment = {
            ...payment,
            id: `pmt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          }
          return {
            invoices: s.invoices.map(inv => {
              if (inv.id !== invoiceId) return inv
              const payments   = [...inv.payments, entry]
              const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0)
              const amountDue  = Math.max(0, inv.total - amountPaid)
              const status: InvoiceStatus =
                amountDue <= 0 ? 'paid'
                  : amountPaid > 0 ? 'partially_paid'
                    : inv.status
              return { ...inv, payments, amountPaid, amountDue, status, updatedAt: new Date().toISOString() }
            }),
          }
        }),
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
        paymentRequests: s.paymentRequests,
        a2aPayments: s.a2aPayments,
        a2aTasks: s.a2aTasks,
        agentWallet: s.agentWallet,
        agentSpendLog: s.agentSpendLog,
        selectedServiceIds: s.selectedServiceIds,
        invoices: s.invoices,
        invoiceSeq: s.invoiceSeq,
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
          paymentRequests: p.paymentRequests ?? current.paymentRequests ?? [],
          a2aPayments: p.a2aPayments ?? current.a2aPayments ?? [],
          a2aTasks: p.a2aTasks ?? current.a2aTasks ?? [],
          agentWallet: p.agentWallet ?? current.agentWallet ?? { provisioned: false, balance_usdc: '0' },
          agentSpendLog: p.agentSpendLog ?? current.agentSpendLog ?? [],
          selectedServiceIds: p.selectedServiceIds ?? current.selectedServiceIds ?? [],
          invoices:           p.invoices           ?? current.invoices           ?? [],
          invoiceSeq:         p.invoiceSeq          ?? current.invoiceSeq          ?? 1,
        }
      },
    }
  )
)
