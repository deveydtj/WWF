import { defineConfig } from 'vite'

const apiUrl = process.env.VITE_API_URL

export default defineConfig({
  base: '',
  server: {
    proxy: {
      '/lobby': {
        target: apiUrl,
        changeOrigin: true
      }
    }
  }
})
