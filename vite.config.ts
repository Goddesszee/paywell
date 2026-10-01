import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force ALL packages (including @circle-fin/w3s-pw-web-sdk which bundles its own React)
      // to use the exact same React instance — prevents "Invalid hook call" / duplicate React crash
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'zustand',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // ALL React-hook-using packages in ONE chunk.
          // ConnectKit, wagmi, zustand, and @tanstack/react-query all call
          // React hooks — splitting any of them into a separate chunk gives
          // Rollup two React module nodes = error #185 (invalid hook call).
          'vendor-react': [
            'react', 'react-dom', 'react/jsx-runtime',
            'connectkit',
            'wagmi', '@tanstack/react-query',
            'zustand',
            '@circle-fin/app-kit',
            '@circle-fin/adapter-viem-v2',
            '@circle-fin/modular-wallets-core',
            '@circle-fin/user-controlled-wallets',
          ],
          // viem has no React hooks — safe to split.
          'vendor-viem': ['viem'],
          // w3s-pw-web-sdk has Node deps (dotenv, firebase, jsonwebtoken) —
          // keep isolated so its prototype chains don't mix with the React chunk.
          'vendor-w3s': ['@circle-fin/w3s-pw-web-sdk'],
          'vendor-ui': ['framer-motion', 'lucide-react', 'sonner', 'qrcode.react'],
        },
      },
    },
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
