import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target:      'http://localhost:8000',
        changeOrigin: true,
        rewrite:     (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
  // Fix pour plotly.js-dist-min sur Windows
  optimizeDeps: {
    include: ['plotly.js-dist-min'],
  },
  resolve: {
    alias: {
      // Evite les erreurs de modules Node dans le browser
      buffer: 'buffer/',
    },
  },
})