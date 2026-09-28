import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '../data/products'

// ── Paywell session auth ───────────────────────────────────────────────────────
export interface PaywellAuth {
  email: string
  sessionToken?: string
  walletAddress?: string
  walletId?: string
  pendingOtpToken?: string
  pendingOtpExpiry?: number
  // Circle user-controlled wallet fields
  userToken?: string
  circleWalletAddress?: string
}

// ── Paywell Protected Purchase ────────────────────────────────────────────────

export type DeliveryStage =
  | 'payment_secured'
  | 'preparing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'buyer_confirmation'
  | 'payment_released'

export type OrderStatus =
  | 'active'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled'

export type DisputeReason =
  | 'item_not_received'
  | 'item_differs'
  | 'damaged'
  | 'wrong_item'
  | 'other'

export type DisputeStatus = 'opened' | 'under_review' | 'resolved'

export type RefundStatus =
  | 'requested'
  | 'approved'
  | 'processing'
  | 'completed'

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired'

export interface OfferEntry {
  by: 'buyer' | 'seller'
  amount: number
  at: string // ISO date
}

export interface ProtectedOrder {
  id: string               // PW10291 style
  productId: string
  productName: string
  productImageUrl?: string
  seller: string           // merchant name
  sellerWallet: string
  buyerWallet: string
  amount: number           // USDC
  deliveryStage: DeliveryStage
  status: OrderStatus
  createdAt: string        // ISO
  updatedAt: string        // ISO
  txHash?: string          // escrow createOrder tx
  confirmTxHash?: string   // confirmOrder tx
  onchainOrderId?: number  // from PaywellEscrow
  disputeStatus?: DisputeStatus
  disputeReason?: DisputeReason
  disputeNote?: string
  refundStatus?: RefundStatus
  quantity: number
  location?: string
}

export interface OfferNegotiation {
  id: string
  productId: string
  productName: string
  seller: string
  listedAmount: number
  history: OfferEntry[]
  status: OfferStatus
  agreedAmount?: number
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

export type KycStatus = 'none' | 'submitted' | 'approved' | 'rejected'

export interface PendingListing {
  id: string
  name: string
  description: string
  price: number
  category: string
  imageBase64?: string
  imageUrl?: string
  merchantWallet: string
  merchantEmail?: string
  kycStatus: KycStatus
  kycFullName?: string
  kycIdType?: string
  kycIdNumber?: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: Date
}

export interface OnboardingState {
  completed: boolean
  step: number
  useCases: string[]
  agentConfigured: boolean
}

interface AppState {
  auth: PaywellAuth | null
  setAuth: (auth: PaywellAuth | null) => void
  setWallet: (walletAddress: string, walletId: string) => void

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

  cart: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void

  pendingListings: PendingListing[]
  submitListing: (listing: Omit<PendingListing, 'id' | 'submittedAt'>) => void
  approveListing: (id: string) => void
  rejectListing: (id: string) => void

  // Protected Purchase orders
  orders: ProtectedOrder[]
  addOrder: (order: Omit<ProtectedOrder, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateOrderStage: (id: string, stage: DeliveryStage) => void
  confirmOrderDelivery: (id: string, confirmTxHash?: string) => void
  openDispute: (id: string, reason: DisputeReason, note?: string) => void
  requestRefund: (id: string) => void

  // Offer negotiations
  offers: OfferNegotiation[]
  createOffer: (offer: Omit<OfferNegotiation, 'id' | 'createdAt'>) => string
  respondToOffer: (id: string, response: 'accept' | 'reject' | 'counter', counterAmount?: number) => void

  activeView: string
  setActiveView: (view: string) => void
  previousView: string | null
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      auth: null,
      setAuth: (auth) => set({ auth }),
      setWallet: (walletAddress, walletId) =>
        set((s) => ({
          auth: s.auth ? { ...s.auth, walletAddress, walletId } : null,
        })),

      onboarding: {
        completed: false,
        step: 0,
        useCases: [],
        agentConfigured: false,
      },
      setOnboarding: (update) =>
        set((s) => ({ onboarding: { ...s.onboarding, ...update } })),

      activity: [],
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
      agentDailyUsed: 0,
      agentMessages: [
        {
          id: 'msg-welcome',
          role: 'agent',
          content: 'Hi! I\'m your Paywell Shopping Agent. I can help you find products and make purchases within your spending limits. What are you looking for today?',
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
              content: 'Hi! I\'m your Paywell Shopping Agent. I can help you find products and make purchases within your spending limits. What are you looking for today?',
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

      pendingListings: [],
      submitListing: (listing) =>
        set((s) => ({
          pendingListings: [
            ...s.pendingListings,
            { ...listing, id: `lst-${Date.now()}`, submittedAt: new Date() },
          ],
        })),
      approveListing: (id) =>
        set((s) => ({
          pendingListings: s.pendingListings.map((l) =>
            l.id === id ? { ...l, status: 'approved' as const } : l
          ),
        })),
      rejectListing: (id) =>
        set((s) => ({
          pendingListings: s.pendingListings.map((l) =>
            l.id === id ? { ...l, status: 'rejected' as const } : l
          ),
        })),

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

      // ── Protected Purchase orders ──────────────────────────────────────────
      orders: [],
      addOrder: (order) => {
        const id = `PW${Date.now().toString().slice(-7)}`
        const now = new Date().toISOString()
        set((s) => ({
          orders: [
            { ...order, id, createdAt: now, updatedAt: now },
            ...s.orders,
          ],
        }))
        return id
      },
      updateOrderStage: (id, stage) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, deliveryStage: stage, updatedAt: new Date().toISOString() } : o
          ),
        })),
      confirmOrderDelivery: (id, confirmTxHash) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  deliveryStage: 'payment_released',
                  status: 'completed',
                  confirmTxHash,
                  updatedAt: new Date().toISOString(),
                }
              : o
          ),
        })),
      openDispute: (id, reason, note) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  status: 'disputed',
                  disputeStatus: 'opened',
                  disputeReason: reason,
                  disputeNote: note,
                  updatedAt: new Date().toISOString(),
                }
              : o
          ),
        })),
      requestRefund: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id
              ? {
                  ...o,
                  refundStatus: 'requested',
                  updatedAt: new Date().toISOString(),
                }
              : o
          ),
        })),

      // ── Offer negotiations ─────────────────────────────────────────────────
      offers: [],
      createOffer: (offer) => {
        const id = `OFF${Date.now().toString().slice(-7)}`
        set((s) => ({
          offers: [
            { ...offer, id, createdAt: new Date().toISOString() },
            ...s.offers,
          ],
        }))
        return id
      },
      respondToOffer: (id, response, counterAmount) =>
        set((s) => ({
          offers: s.offers.map((o) => {
            if (o.id !== id) return o
            if (response === 'accept') {
              const last = o.history[o.history.length - 1]
              return { ...o, status: 'accepted', agreedAmount: last?.amount }
            }
            if (response === 'reject') return { ...o, status: 'rejected' }
            if (response === 'counter' && counterAmount !== undefined) {
              return {
                ...o,
                status: 'countered',
                history: [
                  ...o.history,
                  { by: 'seller' as const, amount: counterAmount, at: new Date().toISOString() },
                ],
              }
            }
            return o
          }),
        })),

      activeView: 'landing',
      setActiveView: (view) =>
        set((s) => ({ previousView: s.activeView, activeView: view })),
      previousView: null,
    }),
    {
      name: 'paywell-state-v2',
      partialize: (s) => ({
        auth: s.auth,
        onboarding: s.onboarding,
        agentPermissions: s.agentPermissions,
        agentDailyUsed: s.agentDailyUsed,
        agentMessages: s.agentMessages,
        activity: s.activity,
        cart: s.cart,
        pendingListings: s.pendingListings,
        orders: s.orders,
        offers: s.offers,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>
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
          pendingListings: (p.pendingListings ?? current.pendingListings).map((l) => ({
            ...l,
            submittedAt: new Date(l.submittedAt),
          })),
          orders: p.orders ?? current.orders ?? [],
          offers: p.offers ?? current.offers ?? [],
        }
      },
    }
  )
)


