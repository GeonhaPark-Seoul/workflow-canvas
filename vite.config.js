import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { assertPrivacyReleaseGate } from './shared/privacyCapabilities.js'

assertPrivacyReleaseGate(process.env)

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'canvas-vendor': ['@xyflow/react'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // The review engine carries generated discovery evidence and is loaded only when review opens.
        globIgnores: ['**/workflowSystemTwinAdapter-*.js'],
      },
      manifest: {
        name: 'Workflow Canvas',
        short_name: 'Canvas',
        description: '워크플로우 캔버스 — 노드 기반 다이어그램 도구',
        theme_color: '#0f0f13',
        background_color: '#0f0f13',
        display: 'standalone',
        id: '/',
        scope: '/',
        orientation: 'landscape',
        start_url: '/',
        launch_handler: { client_mode: 'navigate-existing' },
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
