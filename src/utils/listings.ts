import type { Product } from '../data/products'
import type { PendingListing } from '../store/appStore'

// Categories the storefront actually filters by. A user-submitted listing's
// category is free text (see the "List a product" form), so anything outside
// this set is normalized to the closest bucket rather than silently hidden
// under a category tab that never matches it.
const CATEGORY_MAP: Record<string, Product['category']> = {
  tech: 'tech',
  electronics: 'tech',
  home: 'home',
  fashion: 'fashion',
  digital: 'digital',
  services: 'digital',
  food: 'home',
}

function normalizeCategory(category: string): Product['category'] {
  return CATEGORY_MAP[category] ?? 'digital'
}

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop&auto=format'

/**
 * Converts an approved, KYC'd seller listing into the Product shape the
 * catalog, product detail page, cart and AI agent already know how to render.
 * Only ever call this with listings that are actually verified — callers are
 * expected to filter by `status === 'approved'` before mapping.
 */
export function listingToProduct(listing: PendingListing): Product {
  return {
    id: listing.id,
    name: listing.name,
    description: listing.description || 'No description provided.',
    price: listing.price,
    merchant: listing.kycFullName ?? 'Verified Seller',
    merchantId: listing.id,
    merchantWallet: listing.merchantWallet,
    category: normalizeCategory(listing.category),
    rating: 5,
    reviewCount: 0,
    imageUrl: listing.imageBase64 || listing.imageUrl || PLACEHOLDER_IMAGE,
    inStock: true,
    tags: ['verified'],
  }
}

export function getVerifiedProducts(pendingListings: PendingListing[]): Product[] {
  return pendingListings
    .filter((l) => l.status === 'approved')
    .map(listingToProduct)
}
