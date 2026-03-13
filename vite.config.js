import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/sebi-web/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/supabase-proxy': {
        target: 'https://supabase.pauserdistribucionessac.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase-proxy/, ''),
        secure: true,
      },
    },
  },
})
