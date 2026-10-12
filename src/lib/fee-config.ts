import { SWAP_FEE_BPS, BRIDGE_FEE_BPS, bridgeFee } from './fees'

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

/** True when a valid VITE_FEE_WALLET is set, i.e. a platform fee will really be charged. */
export function feeCollectionActive(): boolean {
  return feeRecipient() !== null
}

/**
 * Bridge fee — App Kit's bridge accepts ONLY `{ value, recipientAddress }` (an absolute USDC amount);
 * `percentageBps` is swap-only and makes the bridge fail with "Unrecognized key(s) … 'percentageBps'".
 * The fee is ADDED ON TOP of the amount (the wallet pays amount + fee). Uses the same bridgeFee()
 * (incl. the minimum) as the on-screen summary so what the user sees is what is charged.
 */
export function bridgeCustomFee(amountUsdc: number): { customFee?: { value: string; recipientAddress: string } } {
  const to = feeRecipient()
  if (!to || !(BRIDGE_FEE_BPS > 0) || !(amountUsdc > 0)) return {}
  return { customFee: { value: bridgeFee(amountUsdc).toFixed(6), recipientAddress: to } }
}

/**
 * Run an App Kit call with the platform fee; if the SDK rejects the request because of the fee
 * (validation happens before anything is submitted on-chain), retry once without it so the user's
 * bridge/swap is never blocked by fee configuration. Other errors are re-thrown unchanged.
 */
export async function withFeeFallback<T>(run: (withFee: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(true)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/custom ?fee|fee ?recipient|INPUT_VALIDATION|invalid.*fee|fee.*invalid/i.test(m)) {
      console.warn('[fees] customFee rejected, retrying without platform fee:', m)
      return run(false)
    }
    throw e
  }
}
