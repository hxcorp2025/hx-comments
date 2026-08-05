import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/hx-comments/' porque serve em hxcorp2025.github.io/hx-comments/ (sem custom domain por ora)
export default defineConfig({
  plugins: [react()],
  base: '/hx-comments/',
})
