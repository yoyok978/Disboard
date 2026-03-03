import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
