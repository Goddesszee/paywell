import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '../data/products'

// ── Nan session (replaces browser-wallet auth) ────────────────────────────────
export interface NanAuth {
  email: string
  sessionToken: string   // HMAC token from Nan's /api/otp verify
  walletAddress: string  // Circle developer-controlled wallet address
  walletId: string       // Circle wallet ID (for SDK calls)
  // OTP handshake state (cleared after verify succeeds)
  pendingOtpToken?: string
  pendingOtpExpiry?: number
}

export type ActivityType = 'received' | 'sent' | 'purchase' | 'agent_purchase' | 'request'

export interface ActivityItem {
  id: string
  type: ActivityType
  description: string
  amount: number
  sign: '+' | '-'
  timestamp: Date
  status: 'confirmed' | 'pending' | 'failed'
  counterparty?: string
  productId?: string
  txHash?: string
  agentInitiated?: boolean
}

export interface AgentPermissions {
  enabled: boolean
  dailyLimit: number
  perTxLimit: number
  allowedCategories: string[]
  requireApproval: boolean
  autoApproveUnder: number
}

export interface AgentMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  products?: Product[]
  action?: 'search' | 'purchase_request' | 'purchase_complete' | 'info'
  purchaseProductId?: string
  purchaseAmount?: number
  approved?: boolean
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface OnboardingState {
  completed: boolean
  step: number
  useCases: string[]
  agentConfigured: boolean
}

interface Zee2State {
  // Nan auth — replaces ConnectKit browser wallet
  nanAuth: NanAuth | null
  setNanAuth: (auth: NanAuth | null) => void
  setNanWallet: (walletAddress: string, walletId: string) => void

  // Onboarding
  onboarding: OnboardingState
  setOnboarding: (update: Partial<OnboardingState>) => void

  // Activity
  activity: ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void

  // Agent
  agentPermissions: AgentPermissions
  setAgentPermissions: (update: Partial<AgentPermissions>) => void
  agentDailyUsed: number
  agentMessages: AgentMessage[]
  addAgentMessage: (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => void
  clearAgentMessages: () => void
  approveAgentPurchase: (msgId: string) => void
  rejectAgentPurchase: (msgId: string) => void
  resetDailyUsage: () => void

  // Cart
  cart: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void

  // UI State
  activeView: string
  setActiveView: (view: string) => void
  previousView: string | null
}

export const useZee2Store = create<Zee2State>()(
  persist(
    (set, get) => ({
      // Nan auth
      nanAuth: null,
      setNanAuth: (auth) => set({ nanAuth: auth }),
      setNanWallet: (walletAddress, walletId) =>
        set((s) => ({
          nanAuth: s.nanAuth ? { ...s.nanAuth, walletAddress, walletId } : null,
        })),

      onboarding: {
        completed: false,
        step: 0,
        useCases: [],
        agentConfigured: false,
      },
      setOnboarding: (update) =>
        set((s) => ({ onboarding: { ...s.onboarding, ...update } })),

      activity: [
        {
          id: 'act-seed-1',
          type: 'received',
          description: 'Received USDC',
          amount: 50,
          sign: '+',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          status: 'confirmed',
          counterparty: '0x4F3a...8B21',
        },
        {
          id: 'act-seed-2',
          type: 'agent_purchase',
          description: 'Coffee Blend Pack',
          amount: 8,
          sign: '-',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
          status: 'confirmed',
          agentInitiated: true,
          counterparty: 'PixelShop',
        },
        {
          id: 'act-seed-3',
          type: 'purchase',
          description: 'Wireless Mechanical Keyboard',
          amount: 24,
          sign: '-',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
          status: 'confirmed',
          counterparty: 'TechFlow',
          productId: 'wm-keyboard-01',
        },
        {
          id: 'act-seed-4',
          type: 'received',
          description: 'Payment received',
          amount: 100,
          sign: '+',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
          status: 'confirmed',
          counterparty: '0x9C2e...F41A',
        },
      ],
      addActivity: (item) =>
        set((s) => ({
          activity: [
            {
              ...item,
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date(),
            },
            ...s.activity,
          ],
        })),

      agentPermissions: {
        enabled: true,
        dailyLimit: 20,
        perTxLimit: 10,
        allowedCategories: ['tech', 'digital', 'home'],
        requireApproval: false,
        autoApproveUnder: 10,
      },
      setAgentPermissions: (update) =>
        set((s) => ({ agentPermissions: { ...s.agentPermissions, ...update } })),
      agentDailyUsed: 8,
      agentMessages: [
        {
          id: 'msg-welcome',
          role: 'agent',
          content: 'Hi! I\'m your Zee² Shopping Agent. I can help you find products and make purchases within your spending limits. What are you looking for today?',
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
        },
      ],
      addAgentMessage: (msg) =>
        set((s) => ({
          agentMessages: [
            ...s.agentMessages,
            {
              ...msg,
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: new Date(),
            },
          ],
        })),
      clearAgentMessages: () =>
        set({
          agentMessages: [
            {
              id: 'msg-welcome-reset',
              role: 'agent',
              content: 'Hi! I\'m your Zee² Shopping Agent. I can help you find products and make purchases within your spending limits. What are you looking for today?',
              timestamp: new Date(),
            },
          ],
        }),
      approveAgentPurchase: (msgId) => {
        const state = get()
        const msg = state.agentMessages.find((m) => m.id === msgId)
        if (!msg || !msg.purchaseAmount) return
        set((s) => ({
          agentDailyUsed: s.agentDailyUsed + (msg.purchaseAmount ?? 0),
          agentMessages: s.agentMessages.map((m) =>
            m.id === msgId ? { ...m, approved: true } : m
          ),
          activity: [
            {
              id: `act-agent-${Date.now()}`,
              type: 'agent_purchase',
              description: msg.products?.[0]?.name ?? 'Agent purchase',
              amount: msg.purchaseAmount ?? 0,
              sign: '-' as const,
              timestamp: new Date(),
              status: 'confirmed' as const,
              agentInitiated: true,
              counterparty: msg.products?.[0]?.merchant,
              productId: msg.purchaseProductId,
            },
            ...s.activity,
          ],
        }))
      },
      rejectAgentPurchase: (msgId) =>
        set((s) => ({
          agentMessages: s.agentMessages.map((m) =>
            m.id === msgId ? { ...m, approved: false } : m
          ),
        })),
      resetDailyUsage: () => set({ agentDailyUsed: 0 }),

      cart: [],
      addToCart: (product) =>
        set((s) => {
          const existing = s.cart.find((c) => c.product.id === product.id)
          if (existing) {
            return {
              cart: s.cart.map((c) =>
                c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c
              ),
            }
          }
          return { cart: [...s.cart, { product, quantity: 1 }] }
        }),
      removeFromCart: (productId) =>
        set((s) => ({ cart: s.cart.filter((c) => c.product.id !== productId) })),
      clearCart: () => set({ cart: [] }),

      activeView: 'landing',
      setActiveView: (view) =>
        set((s) => ({ previousView: s.activeView, activeView: view })),
      previousView: null,
    }),
    {
      name: 'zee2-state',
      partialize: (s) => ({
        nanAuth: s.nanAuth,
        onboarding: s.onboarding,
        agentPermissions: s.agentPermissions,
        agentDailyUsed: s.agentDailyUsed,
        agentMessages: s.agentMessages,
        activity: s.activity,
        cart: s.cart,
      }),
      // Re-hydrate Date strings back to Date objects after restoring from localStorage
      merge: (persisted, current) => {
        const p = persisted as Partial<Zee2State>
        return {
          ...current,
          ...p,
          activity: (p.activity ?? current.activity).map((a) => ({
            ...a,
            timestamp: new Date(a.timestamp),
          })),
          agentMessages: (p.agentMessages ?? current.agentMessages).map((m) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        }
      },
    }
  )
)
