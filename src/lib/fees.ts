/**
 * Paywell platform fee configuration.
 *
 * All values read from VITE_ env vars so they can be changed without code edits.
 * Fee wallet and percentages are public config — not secrets.
 *
 * Fee schedule:
 *   Marketplace sale    2%   (VITE_FEE_MARKETPLACE_BPS = 200)
 *   Swap                0.3% (VITE_FEE_SWAP_BPS = 30)
 *   Bridge              0.1% (VITE_FEE_BRIDGE_BPS = 10, min VITE_FEE_BRIDGE_MIN_USDC)
 *   Send / receive      Free
 *   Onramp              No Paywell fee
 */

/** Platform fee wallet — receives all USDC fees. */
export const FEE_WALLET: `0x${string}` =
  (import.meta.env.VITE_FEE_WALLET as `0x${string}`) ??
  '0xcf81a5b4d6b205b6ba805b418388e388513ef9c2'

/** Marketplace escrow fee in basis points (200 = 2%). */
export const MARKETPLACE_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_MARKETPLACE_BPS ?? 200)

/** Swap platform fee in basis points (30 = 0.3%). */
export const SWAP_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_SWAP_BPS ?? 30)

/** Bridge platform fee in basis points (10 = 0.1%). */
export const BRIDGE_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_BRIDGE_BPS ?? 10)

/** Minimum bridge fee in USDC (protects against dust). */
export const BRIDGE_FEE_MIN_USDC: number =
  Number(import.meta.env.VITE_FEE_BRIDGE_MIN_USDC ?? 0.10)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the fee amount in USDC for a given amount and bps. */
export function calcFee(amountUsdc: number, bps: number): number {
  return Math.round(amountUsdc * bps) / 10000
}

/** Returns the marketplace fee amount in USDC. */
export function marketplaceFee(amountUsdc: number): number {
  return calcFee(amountUsdc, MARKETPLACE_FEE_BPS)
}

/** Returns the swap fee amount in USDC. */
export function swapFee(amountUsdc: number): number {
  return calcFee(amountUsdc, SWAP_FEE_BPS)
}

/** Returns the bridge fee in USDC (min floor applied). */
export function bridgeFee(amountUsdc: number): number {
  const fee = calcFee(amountUsdc, BRIDGE_FEE_BPS)
  return Math.max(fee, BRIDGE_FEE_MIN_USDC)
}

/** Returns the net amount a seller receives after marketplace fee. */
export function sellerNetAmount(grossUsdc: number): number {
  return grossUsdc - marketplaceFee(grossUsdc)
}

/** Human-readable percentage string. */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`
}
