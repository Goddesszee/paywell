/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, polygon, polygonAmoy, avalanche, avalancheFuji } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { IS_MAINNET, ARC_RPC_URL } from './lib/network'

// Arc Mainnet chain definition (not yet in wagmi/chains)
const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
} as const

// Unichain Sepolia (chainId 1301) and Linea Sepolia (59141) are not in wagmi/chains yet —
// define them manually so switchChain works for bridge flows.
const unichainSepolia = {
  id: 1301,
  name: 'Unichain Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia.unichain.org'] } },
  blockExplorers: { default: { name: 'Uniscan', url: 'https://sepolia.uniscan.xyz' } },
  testnet: true,
} as const

const lineaSepolia = {
  id: 59141,
  name: 'Linea Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.linea.build'] } },
  blockExplorers: { default: { name: 'LineaScan', url: 'https://sepolia.lineascan.build' } },
  testnet: true,
} as const

const seiTestnet = {
  id: 1328,
  name: 'Sei Testnet',
  nativeCurrency: { name: 'Sei', symbol: 'SEI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evm-rpc-testnet.sei-apis.com'] } },
  blockExplorers: { default: { name: 'SeiStream', url: 'https://seistream.app' } },
  testnet: true,
} as const

const worldChainSepolia = {
  id: 4801,
  name: 'World Chain Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://worldchain-sepolia.g.alchemy.com/public'] } },
  blockExplorers: { default: { name: 'World Chain Explorer', url: 'https://worldchain-sepolia.explorer.alchemy.com' } },
  testnet: true,
} as const

// Pre-register chain RPC URLs so trace events show correct chain names immediately
const arcChain = IS_MAINNET ? arcMainnet : arcTestnet
registerChain(arcChain.id, ARC_RPC_URL)

export const config = IS_MAINNET
  ? createConfig({
      chains: [
        arcMainnet,
        mainnet,
        base,
        arbitrum,
        optimism,
        polygon,
        avalanche,
      ],
      connectors: [injected()],
      transports: {
        [arcMainnet.id]:    http('https://rpc.mainnet.arc.io'),
        [mainnet.id]:       http(),
        [base.id]:          http(),
        [arbitrum.id]:      http(),
        [optimism.id]:      http(),
        [polygon.id]:       http(),
        [avalanche.id]:     http(),
      },
    })
  : createConfig({
      chains: [
        arcTestnet,
        mainnet,       // ENS resolution
        sepolia,
        baseSepolia,
        arbitrumSepolia,
        optimismSepolia,
        polygonAmoy,
        avalancheFuji,
        unichainSepolia,
        lineaSepolia,
        seiTestnet,
        worldChainSepolia,
      ],
      connectors: [injected()],
      transports: {
        [arcTestnet.id]:        http('https://rpc.testnet.arc.io'),
        [mainnet.id]:           http(),
        [sepolia.id]:           http(),
        [baseSepolia.id]:       http(),
        [arbitrumSepolia.id]:   http(),
        [optimismSepolia.id]:   http(),
        [polygonAmoy.id]:       http(),
        [avalancheFuji.id]:     http(),
        [unichainSepolia.id]:   http(),
        [lineaSepolia.id]:      http(),
        [seiTestnet.id]:        http(),
        [worldChainSepolia.id]: http(),
      },
    })
