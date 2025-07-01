import { defineConfig } from 'vite'

export default defineConfig({
  base: '',
  server: {
    proxy: {
      '/lobby': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
})
