import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Publish the license and self-contained promo alongside the application.
const licenseFile = {
  name: 'license-file',
  apply: 'build',
  generateBundle () {
    this.emitFile({
      type: 'asset',
      fileName: 'LICENSE.txt',
      source: readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')
    })
    this.emitFile({
      type: 'asset',
      fileName: 'promo.html',
      source: readFileSync(new URL('../promo/wordsquad.html', import.meta.url), 'utf8')
    })
  }
}

export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [licenseFile],
  define: {
    __WORD_SQUAD_DEVELOPMENT__: JSON.stringify(command === 'serve')
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        game: 'game.html',
        ageCheck: 'age-check.html',
        join: 'join.html',
        invite: 'invite.html',
        // Shown by CloudFront while the game server is asleep.
        waking: 'waking.html'
      }
    }
  }
}))
