import { SWAP_FEE_BPS, BRIDGE_FEE_BPS } from './fees'

/**
 * Collects NAN's platform fee through Circle App Kit's built-in customFee (single transaction;
 * Circle keeps 10% of the fee, 90% goes to your wallet). It is OPT-IN: nothing is charged unless
 * VITE_FEE_WALLET is set to a valid 0x address in Vercel, so a missing/wrong value can never
 * send money to an address you don't control.
 */
function feeRecipient(): string | null {
  const raw = ((import.meta.env.VITE_FEE_WALLET as string | undefined) ?? '').trim().replace(/^["']|["']$/g, '').trim()
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : null
}

export function swapCustomFee(): { customFee?: { percentageBps: number; recipientAddress: string } } {
  const to = feeRecipient()
  return to && SWAP_FEE_BPS > 0 ? { customFee: { percentageBps: SWAP_FEE_BPS, recipientAddress: to } } : {}
}

/** Bridge fee — same percentageBps format as swap (the only format App Kit bridge accepts). */
export function bridgeCustomFee(_amountUsdc: number): { customFee?: { percentageBps: number; recipientAddress: string } } {
  const to = feeRecipient()
  return to && BRIDGE_FEE_BPS > 0 ? { customFee: { percentageBps: BRIDGE_FEE_BPS, recipientAddress: to } } : {}
}
