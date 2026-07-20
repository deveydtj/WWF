import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: '/',
  define: {
    __WORD_SQUAD_DEVELOPMENT__: JSON.stringify(command === 'serve')
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        game: 'game.html'
      }
    }
  }
}))
