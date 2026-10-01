/** Full marketplace category set — used by ShopPage, SellForm, and filters. */

export interface ShopCategory {
  id: string
  label: string
  icon: string   // lucide icon name
  description?: string
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: 'all',         label: 'All',           icon: 'LayoutGrid' },
  { id: 'electronics', label: 'Electronics',   icon: 'Cpu' },
  { id: 'phones',      label: 'Phones',        icon: 'Smartphone' },
  { id: 'computers',   label: 'Computers',     icon: 'Monitor' },
  { id: 'fashion',     label: 'Fashion',       icon: 'Shirt' },
  { id: 'home',        label: 'Home',          icon: 'Home' },
  { id: 'appliances',  label: 'Appliances',    icon: 'Zap' },
  { id: 'vehicles',    label: 'Cars & Vehicles', icon: 'Car' },
  { id: 'gaming',      label: 'Gaming',        icon: 'Gamepad2' },
  { id: 'beauty',      label: 'Beauty',        icon: 'Sparkles' },
  { id: 'furniture',   label: 'Furniture',     icon: 'Sofa' },
  { id: 'tools',       label: 'Tools',         icon: 'Wrench' },
  { id: 'digital',     label: 'Digital',       icon: 'Download' },
  { id: 'services',    label: 'Services',      icon: 'Briefcase' },
  { id: 'other',       label: 'Other',         icon: 'MoreHorizontal' },
]

/** Map legacy 4-category products to the new category set */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  tech:     'electronics',
  home:     'home',
  fashion:  'fashion',
  digital:  'digital',
  services: 'services',
  food:     'other',
}

export function mapLegacyCategory(cat: string): string {
  return LEGACY_CATEGORY_MAP[cat] ?? cat
}
