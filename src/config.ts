/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, base, arbitrum, optimism, polygon, avalanche, zkSync } from 'wagmi/chains'
import { arc as arcBase } from 'viem/chains'
import { defineChain } from 'viem'
import { injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Arc Mainnet — override nativeCurrency to reflect USDC-as-gas correctly.
// viem/chains exports arc with ETH as native which confuses wallets into asking for ETH.
// On Arc, the native gas token IS USDC (18 decimals in the native view, same pool as ERC-20).
const arc = defineChain({
  ...arcBase,
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
})

// Unichain Mainnet (chainId 130)
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.unichain.org'] } },
  blockExplorers: { default: { name: 'Uniscan', url: 'https://uniscan.xyz' } },
} as const

// Linea Mainnet (chainId 59144)
const linea = {
  id: 59144,
  name: 'Linea',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.linea.build'] } },
  blockExplorers: { default: { name: 'LineaScan', url: 'https://lineascan.build' } },
} as const

// Sei Mainnet (chainId 1329)
const sei = {
  id: 1329,
  name: 'Sei',
  nativeCurrency: { name: 'Sei', symbol: 'SEI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evm-rpc.sei-apis.com'] } },
  blockExplorers: { default: { name: 'SeiStream', url: 'https://seistream.app' } },
} as const

// World Chain Mainnet (chainId 480)
const worldChain = {
  id: 480,
  name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] } },
  blockExplorers: { default: { name: 'World Chain Explorer', url: 'https://worldscan.org' } },
} as const

// Pre-register Arc Mainnet RPC URL so trace events show correct chain names immediately
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

// WalletConnect lets phones connect a wallet app (MetaMask, Trust, Rainbow, …) from any browser.
// Free project ID: cloud.reown.com → create project → add nanarc.xyz as an allowed domain.
// Without VITE_WALLETCONNECT_PROJECT_ID only injected wallets (extensions / in-wallet browsers) work.
const WC_PROJECT_ID = ((import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '').trim()

export const config = createConfig({
  chains: [
    arc,
    mainnet,      // ENS resolution + USDC/EURC
    base,
    arbitrum,
    optimism,
    polygon,
    avalanche,
    unichain,
    linea,
    sei,
    worldChain,
    zkSync,
  ],
  connectors: [
    injected(),
    ...(WC_PROJECT_ID ? [walletConnect({
      projectId: WC_PROJECT_ID,
      showQrModal: false, // ConnectKit draws its own QR / wallet list
      metadata: { name: 'NAN', description: 'The Intelligent Payment Network', url: 'https://nanarc.xyz', icons: ['https://nanarc.xyz/favicon.ico'] },
    })] : []),
  ],
  transports: {
    [arc.id]:         http('https://rpc.mainnet.arc.io'),
    [mainnet.id]:     http(),
    [base.id]:        http(),
    [arbitrum.id]:    http(),
    [optimism.id]:    http(),
    [polygon.id]:     http(),
    [avalanche.id]:   http(),
    [unichain.id]:    http(),
    [linea.id]:       http(),
    [sei.id]:         http(),
    [worldChain.id]:  http(),
    [zkSync.id]:      http(),
  },
})
