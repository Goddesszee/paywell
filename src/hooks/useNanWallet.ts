/**
 * useNanWallet — resolves the active wallet for all four NAN login paths:
 *
 *   1. wagmi (ConnectKit / browser wallet)  → wagmi connector → EIP-1193 provider → viem adapter
 *   2. Email OTP (Circle UCW)               → userToken + walletId in appStore auth
 *   3. Google (Circle UCW)                  → userToken + walletId in appStore auth
 *   4. Passkey (Circle Modular Wallets)     → isPasskeyUser flag + localStorage credential
 *
 * Returns a unified descriptor so feature pages (Send, Swap, Bridge, Gateway)
 * can fork their signing strategy in one place without duplicating detection logic.
 *
 * IMPORTANT: this hook only detects wallet state — it never signs or broadcasts.
 * Signing happens inside each feature page after the user triggers an action.
 */

import { useAccount } from 'wagmi'
import { useAppStore } from '../store/appStore'

export type NanWalletType = 'wagmi' | 'ucw' | 'passkey' | 'none'

export interface NanWalletInfo {
  /** Which login path is active */
  type: NanWalletType

  /** The user-visible wallet address (0x-prefixed) — undefined when not connected */
  address: string | undefined

  /** wagmi-connected only: the wallet's chain ID */
  chainId: number | undefined

  // ── UCW fields (email / Google) ─────────────────────────────────────────────
  /** Circle UCW user token — present for ucw path only */
  userToken: string | undefined
  /** Circle UCW wallet ID — present for ucw path only */
  walletId: string | undefined
  /** Circle UCW encryption key — present for ucw path after PIN entry */
  encryptionKey: string | undefined

  // ── Passkey fields ──────────────────────────────────────────────────────────
  /** true when the user logged in via passkey (Circle Modular Wallet) */
  isPasskeyUser: boolean

  // ── Convenience flags ───────────────────────────────────────────────────────
  isConnected: boolean
  /** true when a wagmi wallet is connected */
  isWagmi: boolean
  /** true when a Circle UCW session is active (email or Google) */
  isUcw: boolean
}

/**
 * Returns a stable NanWalletInfo descriptor.
 * Safe to call from any component inside the React tree.
 */
export function useNanWallet(): NanWalletInfo {
  const { address: wagmiAddress, chainId: wagmiChainId, isConnected: wagmiConnected } = useAccount()
  const auth = useAppStore((s) => s.auth)

  // ── Priority order: wagmi > passkey > UCW > none ───────────────────────────
  // wagmi: ConnectKit has a live connection
  if (wagmiConnected && wagmiAddress) {
    return {
      type: 'wagmi',
      address: wagmiAddress,
      chainId: wagmiChainId,
      userToken: undefined,
      walletId: undefined,
      encryptionKey: undefined,
      isPasskeyUser: false,
      isConnected: true,
      isWagmi: true,
      isUcw: false,
    }
  }

  // passkey: Circle Modular Wallet (no server session, credential in localStorage)
  if (auth?.isPasskeyUser && auth.walletAddress) {
    return {
      type: 'passkey',
      address: auth.walletAddress,
      chainId: 5042002, // Arc Testnet — only chain supported by Circle Modular Wallets
      userToken: undefined,
      walletId: undefined,
      encryptionKey: undefined,
      isPasskeyUser: true,
      isConnected: true,
      isWagmi: false,
      isUcw: false,
    }
  }

  // UCW: email OTP or Google — needs userToken + walletId from appStore
  if (auth?.userToken && (auth.circleWalletAddress || auth.walletAddress)) {
    return {
      type: 'ucw',
      address: auth.circleWalletAddress ?? auth.walletAddress,
      chainId: 5042002, // Arc Testnet
      userToken: auth.userToken,
      walletId: auth.circleWalletId ?? auth.walletId,
      encryptionKey: auth.encryptionKey,
      isPasskeyUser: false,
      isConnected: true,
      isWagmi: false,
      isUcw: true,
    }
  }

  // none: not logged in at all
  return {
    type: 'none',
    address: undefined,
    chainId: undefined,
    userToken: undefined,
    walletId: undefined,
    encryptionKey: undefined,
    isPasskeyUser: false,
    isConnected: false,
    isWagmi: false,
    isUcw: false,
  }
}
