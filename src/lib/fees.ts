/**
 * NAN platform fee configuration.
 *
 * All values read from VITE_ env vars so they can be changed without code edits.
 * Fee wallet and percentages are public config — not secrets.
 *
 * Fee schedule:
 *   Onramp (buy USDC)   1%   (VITE_FEE_ONRAMP_BPS = 100)
 *   Marketplace sale    2%   (VITE_FEE_MARKETPLACE_BPS = 200)
 *   Swap                0.3% (VITE_FEE_SWAP_BPS = 30)
 *   Bridge              0.3% (VITE_FEE_BRIDGE_BPS = 30, min VITE_FEE_BRIDGE_MIN_USDC)
 *   Send / receive      Free
 *
 * Industry reference (Oct 2026):
 *   Coinbase onramp 1.49–3.99% · Uniswap swap 0.3% · Across bridge 0.04–0.12% base
 *   Rainbow/Zerion wallet apps charge 0.85–1% bridge, 0.875% swap
 */

/** Platform fee wallet — receives all USDC fees. */
export const FEE_WALLET: `0x${string}` =
  (import.meta.env.VITE_FEE_WALLET as `0x${string}`) ??
  '0xcf81a5b4d6b205b6ba805b418388e388513ef9c2'

/** Onramp (buy USDC) platform fee in basis points (100 = 1%). */
export const ONRAMP_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_ONRAMP_BPS ?? 100)

/** Marketplace escrow fee in basis points (200 = 2%). */
export const MARKETPLACE_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_MARKETPLACE_BPS ?? 200)

/** Swap platform fee in basis points (30 = 0.3%). */
export const SWAP_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_SWAP_BPS ?? 30)

/** Bridge platform fee in basis points (30 = 0.3%). */
export const BRIDGE_FEE_BPS: number =
  Number(import.meta.env.VITE_FEE_BRIDGE_BPS ?? 30)

/** Minimum bridge fee in USDC (protects against dust). */
export const BRIDGE_FEE_MIN_USDC: number =
  Number(import.meta.env.VITE_FEE_BRIDGE_MIN_USDC ?? 0.10)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the fee amount in USDC for a given amount and bps. */
export function calcFee(amountUsdc: number, bps: number): number {
  return Math.round(amountUsdc * bps) / 10000
}

/** Returns the onramp fee amount in USDC (1% of purchase). */
export function onrampFee(amountUsdc: number): number {
  return calcFee(amountUsdc, ONRAMP_FEE_BPS)
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
