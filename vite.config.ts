import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// vite-plugin-node-polyfills removed: @circle-fin/app-kit >=1.11.0 is
// browser-safe and ships its own shims. Adding Node polyfills causes
// module-resolution conflicts (React error #185).

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // Single React instance — every package resolves to the same copy.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi', 'wagmi/chains', 'wagmi/connectors',
      'viem', 'viem/chains',
      'connectkit',
      'framer-motion', 'lucide-react', 'sonner', 'clsx', 'tailwind-merge',
      'zustand',
      '@circle-fin/app-kit',
      '@circle-fin/adapter-viem-v2',
    ],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── All React-hook-using packages land in ONE chunk ──────────────
          // This is the only rule that matters for error #185: every package
          // that calls useContext/useState/etc must share the same React copy,
          // so they must all be in the same Rollup chunk (or in chunks that
          // all import from the same shared react chunk below).
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/wagmi/') ||
            id.includes('node_modules/@wagmi/') ||
            id.includes('node_modules/connectkit/') ||
            id.includes('node_modules/@tanstack/') ||
            id.includes('node_modules/zustand/') ||
            id.includes('node_modules/@circle-fin/app-kit/') ||
            id.includes('node_modules/@circle-fin/adapter-viem-v2/') ||
            id.includes('node_modules/@circle-fin/modular-wallets-core/') ||
            id.includes('node_modules/@circle-fin/user-controlled-wallets/') ||
            id.includes('node_modules/@circle-fin/w3s-pw-web-sdk/')
          ) {
            return 'vendor-core'
          }
          // ── viem / abitype: no React, safe to split ──────────────────────
          if (
            id.includes('node_modules/viem/') ||
            id.includes('node_modules/abitype/') ||
            id.includes('node_modules/@noble/')
          ) {
            return 'vendor-viem'
          }
          // ── UI utils: no React hooks, safe to split ──────────────────────
          if (
            id.includes('node_modules/framer-motion/') ||
            id.includes('node_modules/lucide-react/') ||
            id.includes('node_modules/sonner/') ||
            id.includes('node_modules/qrcode.react/')
          ) {
            return 'vendor-ui'
          }
        },
      },
    },
  },
  server: {
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
