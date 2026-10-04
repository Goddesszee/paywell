/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, sepolia, baseSepolia, arbitrumSepolia, optimismSepolia, polygonAmoy, avalancheFuji } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

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
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
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
    [arcTestnet.id]:        http(),
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
