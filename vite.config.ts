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
        // Function-based chunking: anything that touches React hooks —
        // including @reown/appkit* and @walletconnect/* which ConnectKit
        // pulls in and which each bundle their own React — goes into
        // vendor-react so there is exactly ONE React module instance.
        manualChunks(id) {
          // w3s-pw-web-sdk: has Node deps, keep isolated
          if (id.includes('@circle-fin/w3s-pw-web-sdk')) return 'vendor-w3s'
          // UI-only libs with no React hooks
          if (id.includes('framer-motion') || id.includes('lucide-react') ||
              id.includes('sonner') || id.includes('qrcode.react')) return 'vendor-ui'
          // Everything else in node_modules goes into one chunk —
          // viem must be co-located with its callers to avoid circular init errors
          if (id.includes('node_modules')) return 'vendor-react'
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
