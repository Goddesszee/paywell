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
      // Force ALL packages to resolve to the exact same React instance.
      // This prevents React error #185 ("Invalid hook call") caused by
      // @circle-fin/app-kit, @circle-fin/w3s-pw-web-sdk, and similar
      // packages that bundle their own React copy.
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'zustand'],
  },
  optimizeDeps: {
    // Pre-bundle everything against the single React instance so Rollup
    // never sees a second copy at build time.
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
      // Circle kits — pre-bundle so they share the same React singleton
      '@circle-fin/app-kit',
      '@circle-fin/adapter-viem-v2',
      '@circle-fin/modular-wallets-core',
    ],
    // w3s-pw-web-sdk bundles its own React and must NOT be pre-bundled;
    // the alias above still forces it to the correct instance at runtime.
    exclude: ['@circle-fin/w3s-pw-web-sdk'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep React, react-dom AND all Circle kits that use hooks in the
          // same chunk so Rollup never splits them across separate bundles.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) return 'vendor-react'

          if (
            id.includes('@circle-fin/app-kit') ||
            id.includes('@circle-fin/adapter-viem-v2') ||
            id.includes('@circle-fin/modular-wallets-core')
          ) return 'vendor-circle'

          if (
            id.includes('@circle-fin/user-controlled-wallets') ||
            id.includes('@circle-fin/w3s-pw-web-sdk')
          ) return 'vendor-circle-wallets'

          if (
            id.includes('node_modules/wagmi') ||
            id.includes('node_modules/viem') ||
            id.includes('@tanstack/react-query')
          ) return 'vendor-wagmi'

          if (id.includes('node_modules/connectkit')) return 'vendor-connectkit'

          if (
            id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/sonner') ||
            id.includes('node_modules/qrcode.react')
          ) return 'vendor-ui'
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
