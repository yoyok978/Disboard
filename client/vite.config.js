import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Important for Discord Embedded apps (to resolve assets with relative paths depending on proxy configuration)
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@tldraw/assets/fonts',
          dest: 'tldraw-assets'
        },
        {
          src: 'node_modules/@tldraw/assets/icons',
          dest: 'tldraw-assets'
        },
        {
          src: 'node_modules/@tldraw/assets/translations',
          dest: 'tldraw-assets'
        },
        {
          src: 'node_modules/@tldraw/assets/embed-icons',
          dest: 'tldraw-assets'
        }
      ]
    })
  ],
  server: {
    host: '0.0.0.0', // Important for Discord SDK local development mapping sometimes
    allowedHosts: true, // Allow dynamic Cloudflare tunnel URLs to connect
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:1234',
        ws: true,
      }
    }
  }
})
