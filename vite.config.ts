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
      // Alias jsx-runtime explicitly — zustand and some Circle kits resolve it
      // separately from 'react' and end up with a second copy if this is missing.
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'zustand'],
  },
  optimizeDeps: {
    exclude: ['web-push'],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
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
      'zustand/middleware',
      'zustand/react',
      // Circle App Kit + adapters — pre-bundle so they share the same React instance
      // as the rest of the app (prevents "Invalid hook call" on lazy-loaded pages).
      '@circle-fin/app-kit',
      '@circle-fin/app-kit/chains',
      '@circle-fin/adapter-viem-v2',
      '@circle-fin/adapter-circle-wallets',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // web-push is a server-only package — never bundle it for the browser
      external: ['web-push'],
      output: {
        // Function-based chunking: anything that touches React hooks —
        // including @reown/appkit* and @walletconnect/* which ConnectKit
        // pulls in and which each bundle their own React — goes into
        // vendor-react so there is exactly ONE React module instance.
        manualChunks(id) {
          // w3s-pw-web-sdk: Node deps (firebase/dotenv/jsonwebtoken), no React — safe to isolate
          if (id.includes('@circle-fin/w3s-pw-web-sdk')) return 'vendor-w3s'
          // Every other node_module (React, viem, wagmi, connectkit, framer-motion,
          // @reown/*, @walletconnect/*, Circle kits, zustand, sonner, lucide-react…)
          // goes into ONE chunk so there is exactly one module instance of everything.
          if (id.includes('node_modules')) return 'vendor-react'
        },
      },
    },
  },
  server: {
    allowedHosts: true,
    cors: true,
    // Fix HMR WebSocket in Arc Studio preview (proxied over HTTPS/WSS).
    hmr: {
      host: 'ihublobrkoc0g9m4jf2kd.preview.studio.arc.io',
      clientPort: 443,
      protocol: 'wss',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
