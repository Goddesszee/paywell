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
      // Replace node-stdlib-browser's warning helper with a no-op so
      // vite-plugin-node-polyfills never emits the circular-dependency warning
      // that Vercel's Vite/Rollup pipeline promotes to a fatal build error.
      'node-stdlib-browser/helpers/rollup/plugin': path.resolve(__dirname, './scripts/noop-warn.js'),
    },
    dedupe: ['react', 'react-dom'],
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
