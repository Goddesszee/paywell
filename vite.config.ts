import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Only polyfill what is actually needed; exclude heavy globals that
      // trigger circular-dependency warnings in node-stdlib-browser.
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
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
        // Suppress all warnings from vite-plugin-node-polyfills /
        // node-stdlib-browser — circular deps and THIS_IS_UNDEFINED are safe
        // to ignore and must not be promoted to build errors on Vercel.
        const msg = warning.message ?? ''
        const id  = (warning as { id?: string }).id ?? ''
        if (
          warning.code === 'CIRCULAR_DEPENDENCY' ||
          warning.code === 'THIS_IS_UNDEFINED' ||
          msg.includes('node-stdlib-browser') ||
          msg.includes('vite-plugin-node-polyfills') ||
          msg.includes('build.rollupOptions.external') ||
          id.includes('node-stdlib-browser') ||
          id.includes('node_modules/node-stdlib-browser')
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
