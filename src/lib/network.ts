/**
 * network.ts — single source of truth for testnet vs mainnet switching.
 *
 * Set VITE_NETWORK=mainnet in your Vercel environment variables to go live.
 * Everything else in the app imports from here — no scattered hardcoded values.
 */

export const IS_MAINNET = (import.meta.env.VITE_NETWORK as string | undefined) === 'mainnet'

// ── Arc chain IDs ──────────────────────────────────────────────────────────────
export const ARC_CHAIN_ID = IS_MAINNET ? 5042 : 5042002

// ── Circle blockchain enum values (SCP / UCW SDK) ─────────────────────────────
export const ARC_BLOCKCHAIN  = IS_MAINNET ? 'ARC'      : 'ARC-TESTNET'
export const BASE_BLOCKCHAIN = IS_MAINNET ? 'BASE'     : 'BASE-SEPOLIA'
export const ETH_BLOCKCHAIN  = IS_MAINNET ? 'ETH'      : 'ETH-SEPOLIA'
export const ARB_BLOCKCHAIN  = IS_MAINNET ? 'ARB'      : 'ARB-SEPOLIA'

// ── RPC endpoints ─────────────────────────────────────────────────────────────
export const ARC_RPC_URL = IS_MAINNET
  ? 'https://rpc.mainnet.arc.io'
  : 'https://rpc.testnet.arc.io'

// ── Explorer base URLs ────────────────────────────────────────────────────────
export const ARC_EXPLORER_URL = IS_MAINNET
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

// ── Circle Gateway REST API ───────────────────────────────────────────────────
export const GATEWAY_API_URL = IS_MAINNET
  ? 'https://gateway-api.circle.com/v1'
  : 'https://gateway-api-testnet.circle.com/v1'

// ── Circle Gateway contract addresses ─────────────────────────────────────────
// Testnet: same addresses used across all testnets
// Mainnet: different addresses (Arc mainnet)
export const GATEWAY_WALLET_ADDRESS = (IS_MAINNET
  ? '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE'
  : '0x0077777d7EBA4688BDeF3E311b846F25870A19B9') as `0x${string}`

export const GATEWAY_MINTER_ADDRESS = (IS_MAINNET
  ? '0x2222222d7164433c4C09B0b0D809a9b52C04C205'
  : '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B') as `0x${string}`

// ── Circle Modular Wallets SDK transport slug ─────────────────────────────────
// The modular SDK uses chain-specific slugs in its URLs.
export const MODULAR_CHAIN_SLUG = IS_MAINNET ? 'arc' : 'arcTestnet'

// ── Circle Onramp (env-var driven on the server, but the widget origin matters
//    on the client for postMessage security) ───────────────────────────────────
export const ONRAMP_WIDGET_ORIGIN = IS_MAINNET
  ? 'https://onramp.arc.io'
  : 'https://onramp-sandbox.arc.io'

// ── CCTP domain IDs ───────────────────────────────────────────────────────────
// Mainnet and testnet use the same Arc domain (26) but other chains differ.
export const ARC_CCTP_DOMAIN = 26

// Domain map: chainId → CCTP domain
// Testnet
const TESTNET_DOMAIN_MAP: Record<number, number> = {
  11155111: 0,  // Ethereum Sepolia
  43113:    1,  // Avalanche Fuji
  11155420: 2,  // OP Sepolia
  421614:   3,  // Arbitrum Sepolia
  84532:    6,  // Base Sepolia
  80002:    7,  // Polygon Amoy
  1301:     10, // Unichain Sepolia
  5042002:  26, // Arc Testnet
}
// Mainnet
const MAINNET_DOMAIN_MAP: Record<number, number> = {
  1:      0,  // Ethereum
  43114:  1,  // Avalanche
  10:     2,  // OP Mainnet
  42161:  3,  // Arbitrum One
  8453:   6,  // Base
  137:    7,  // Polygon PoS
  5042:   26, // Arc Mainnet
}
export const CCTP_DOMAIN_MAP: Record<number, number> = IS_MAINNET ? MAINNET_DOMAIN_MAP : TESTNET_DOMAIN_MAP

// ── UI labels ─────────────────────────────────────────────────────────────────
export const NETWORK_LABEL = IS_MAINNET ? 'Arc Mainnet' : 'Arc Testnet'
export const GATEWAY_NETWORK_LABEL = IS_MAINNET ? 'Circle Gateway' : 'Circle Gateway Testnet'
