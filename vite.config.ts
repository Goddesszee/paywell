import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
      onwarn(warning, warn) {
        // vite-plugin-node-polyfills emits circular dependency warnings for
        // node-stdlib-browser internals — these are safe to ignore and must
        // not be treated as errors on Vercel.
        if (
          warning.code === 'CIRCULAR_DEPENDENCY' ||
          warning.code === 'THIS_IS_UNDEFINED' ||
          (warning.message && warning.message.includes('node-stdlib-browser'))
        ) return
        warn(warning)
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],
          'vendor-wagmi': ['wagmi', 'viem', '@tanstack/react-query'],
          'vendor-connectkit': ['connectkit'],
          'vendor-circle': [
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
