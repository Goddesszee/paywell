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
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':          ['react', 'react-dom', 'react/jsx-runtime'],
          'vendor-wagmi':          ['wagmi', 'viem', '@tanstack/react-query'],
          'vendor-connectkit':     ['connectkit'],
          'vendor-circle':         [
            '@circle-fin/app-kit',
            '@circle-fin/adapter-viem-v2',
            '@circle-fin/modular-wallets-core',
          ],
          'vendor-circle-wallets': [
            '@circle-fin/user-controlled-wallets',
            '@circle-fin/w3s-pw-web-sdk',
          ],
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
