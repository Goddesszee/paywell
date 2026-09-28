/**
 * Paywell Shop — marketplace store
 * Extends appStore with modular commerce entities:
 * Order, Offer, Favorite, Dispute, Review, Delivery
 *
 * Architecture is designed for future AI-agent integration:
 * agents use the same Product/Order/Payment entities as humans.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Enums ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_payment'
  | 'payment_protected'   // USDC locked in escrow
  | 'confirmed'           // seller confirmed, awaiting delivery
  | 'shipped'
  | 'delivered'
  | 'completed'           // buyer confirmed receipt → payment released
  | 'disputed'
  | 'refunded'
  | 'cancelled'

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'countered'
export type DisputeReason = 'not_received' | 'not_as_described' | 'damaged' | 'seller_unresponsive' | 'other'
export type DisputeStatus = 'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'closed'
export type DeliveryMethod = 'standard' | 'express' | 'pickup' | 'digital' | 'agent_drop'
export type ConditionLabel = 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts'

// ── Core entities ─────────────────────────────────────────────────────────────

export interface ShopProduct {
  id: string
  name: string
  description: string
  price: number               // USDC
  priceLocal?: number         // optional local currency equivalent
  localCurrency?: string      // e.g. 'NGN'
  merchant: string            // display name
  merchantId: string
  merchantWallet: string      // EVM address — receives USDC
  merchantVerified: boolean
  merchantRating: number
  merchantCompletedTx: number
  merchantJoined?: string
  merchantResponseRate?: number // 0–100
  merchantLocation?: string
  category: string
  condition: ConditionLabel
  images: string[]            // first is primary
  rating: number
  reviewCount: number
  inStock: boolean
  quantity: number
  tags: string[]
  location?: string
  deliveryOptions: DeliveryMethod[]
  deliveryDays?: number
  isVerifiedListing: boolean
  listedAt: string            // ISO
  // Agent-ready metadata
  agentSearchable: boolean
  agentKeywords?: string[]
}

export interface ShopOrder {
  id: string
  productId: string
  productName: string
  productImage: string
  buyerAddress: string
  sellerAddress: string
  sellerName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  status: OrderStatus
  escrowTxHash?: string
  confirmTxHash?: string
  disputeTxHash?: string
  onchainOrderId?: number
  createdAt: string
  updatedAt: string
  deliveryMethod: DeliveryMethod
  deliveryTracking?: string
  estimatedDelivery?: string
  dispute?: ShopDispute
  review?: ShopReview
  offerAccepted?: boolean
  offeredPrice?: number
  // Agent metadata
  agentInitiated?: boolean
  agentApproved?: boolean
}

export interface ShopOffer {
  id: string
  productId: string
  productName: string
  productPrice: number
  offerPrice: number
  buyerAddress: string
  sellerAddress: string
  message?: string
  status: OfferStatus
  counterPrice?: number
  expiresAt: string
  createdAt: string
}

export interface ShopDispute {
  id: string
  orderId: string
  reason: DisputeReason
  description: string
  evidence?: string
  status: DisputeStatus
  createdAt: string
  resolvedAt?: string
  resolution?: string
}

export interface ShopReview {
  id: string
  orderId: string
  productId: string
  reviewerAddress: string
  reviewerName?: string
  rating: number              // 1–5
  title?: string
  body: string
  sellerResponse?: string
  createdAt: string
}

export interface ShopFilter {
  category: string
  priceMin?: number
  priceMax?: number
  condition?: ConditionLabel
  location?: string
  minRating?: number
  verifiedOnly: boolean
  deliveryMethod?: DeliveryMethod
  sortBy: 'recommended' | 'newest' | 'price_asc' | 'price_desc' | 'rating'
}

// ── Seller dashboard snapshot ─────────────────────────────────────────────────

export interface SellerStats {
  activeListings: number
  pendingOrders: number
  completedSales: number
  totalRevenue: number         // USDC
  pendingBalance: number       // USDC in escrow
  availableBalance: number     // USDC released
  averageRating: number
  responseRate: number
}

// ── Agent recommendation (ready for AI integration) ───────────────────────────

export interface AgentProductRecommendation {
  id: string
  query: string
  products: ShopProduct[]
  reasoning?: string           // AI model output — only set when AI is live
  createdAt: string
  approved?: boolean           // user approved agent purchase
  purchaseOrderId?: string
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ShopState {
  // Catalog
  shopProducts: ShopProduct[]
  addShopProduct: (p: Omit<ShopProduct, 'id' | 'listedAt'>) => string
  updateShopProduct: (id: string, update: Partial<ShopProduct>) => void
  removeShopProduct: (id: string) => void

  // Orders
  orders: ShopOrder[]
  addOrder: (o: Omit<ShopOrder, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateOrder: (id: string, update: Partial<ShopOrder>) => void

  // Offers
  offers: ShopOffer[]
  addOffer: (o: Omit<ShopOffer, 'id' | 'createdAt'>) => string
  updateOffer: (id: string, update: Partial<ShopOffer>) => void

  // Favorites
  favorites: string[]          // product ids
  toggleFavorite: (productId: string) => void
  isFavorite: (productId: string) => boolean

  // Disputes
  addDispute: (d: Omit<ShopDispute, 'id' | 'createdAt'>) => string
  updateDispute: (id: string, update: Partial<ShopDispute>) => void

  // Reviews
  reviews: ShopReview[]
  addReview: (r: Omit<ShopReview, 'id' | 'createdAt'>) => string

  // Filters (persistent UI state)
  filter: ShopFilter
  setFilter: (update: Partial<ShopFilter>) => void
  resetFilter: () => void

  // Agent recommendations
  agentRecommendations: AgentProductRecommendation[]
  addAgentRecommendation: (r: Omit<AgentProductRecommendation, 'id' | 'createdAt'>) => string
  approveAgentRecommendation: (id: string, orderId: string) => void
}

const DEFAULT_FILTER: ShopFilter = {
  category: 'all',
  verifiedOnly: false,
  sortBy: 'recommended',
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      shopProducts: [],
      addShopProduct: (p) => {
        const id = `sp-${uid()}`
        set((s) => ({
          shopProducts: [
            {
              ...p,
              id,
              listedAt: new Date().toISOString(),
            },
            ...s.shopProducts,
          ],
        }))
        return id
      },
      updateShopProduct: (id, update) =>
        set((s) => ({
          shopProducts: s.shopProducts.map((p) => (p.id === id ? { ...p, ...update } : p)),
        })),
      removeShopProduct: (id) =>
        set((s) => ({ shopProducts: s.shopProducts.filter((p) => p.id !== id) })),

      orders: [],
      addOrder: (o) => {
        const id = `ord-${uid()}`
        const now = new Date().toISOString()
        set((s) => ({
          orders: [{ ...o, id, createdAt: now, updatedAt: now }, ...s.orders],
        }))
        return id
      },
      updateOrder: (id, update) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id ? { ...o, ...update, updatedAt: new Date().toISOString() } : o
          ),
        })),

      offers: [],
      addOffer: (o) => {
        const id = `off-${uid()}`
        set((s) => ({
          offers: [{ ...o, id, createdAt: new Date().toISOString() }, ...s.offers],
        }))
        return id
      },
      updateOffer: (id, update) =>
        set((s) => ({
          offers: s.offers.map((o) => (o.id === id ? { ...o, ...update } : o)),
        })),

      favorites: [],
      toggleFavorite: (productId) =>
        set((s) => ({
          favorites: s.favorites.includes(productId)
            ? s.favorites.filter((f) => f !== productId)
            : [...s.favorites, productId],
        })),
      isFavorite: (productId) => get().favorites.includes(productId),

      addDispute: (d) => {
        const id = `dsp-${uid()}`
        const dispute: ShopDispute = { ...d, id, createdAt: new Date().toISOString() }
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === d.orderId ? { ...o, dispute, status: 'disputed', updatedAt: new Date().toISOString() } : o
          ),
        }))
        return id
      },
      updateDispute: (id, update) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.dispute?.id === id
              ? { ...o, dispute: { ...o.dispute, ...update }, updatedAt: new Date().toISOString() }
              : o
          ),
        })),

      reviews: [],
      addReview: (r) => {
        const id = `rev-${uid()}`
        set((s) => ({
          reviews: [{ ...r, id, createdAt: new Date().toISOString() }, ...s.reviews],
          orders: s.orders.map((o) =>
            o.id === r.orderId
              ? { ...o, review: { ...r, id, createdAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }
              : o
          ),
        }))
        return id
      },

      filter: DEFAULT_FILTER,
      setFilter: (update) =>
        set((s) => ({ filter: { ...s.filter, ...update } })),
      resetFilter: () => set({ filter: DEFAULT_FILTER }),

      agentRecommendations: [],
      addAgentRecommendation: (r) => {
        const id = `arec-${uid()}`
        set((s) => ({
          agentRecommendations: [
            { ...r, id, createdAt: new Date().toISOString() },
            ...s.agentRecommendations,
          ],
        }))
        return id
      },
      approveAgentRecommendation: (id, orderId) =>
        set((s) => ({
          agentRecommendations: s.agentRecommendations.map((r) =>
            r.id === id ? { ...r, approved: true, purchaseOrderId: orderId } : r
          ),
        })),
    }),
    {
      name: 'paywell-shop-v1',
      partialize: (s) => ({
        orders: s.orders,
        offers: s.offers,
        favorites: s.favorites,
        reviews: s.reviews,
        filter: s.filter,
        agentRecommendations: s.agentRecommendations,
        // shopProducts from user-submitted listings are in appStore.pendingListings
        // We persist agent-added/featured shop products here
        shopProducts: s.shopProducts,
      }),
    }
  )
)
