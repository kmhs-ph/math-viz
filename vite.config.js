import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { globSync } from 'glob'

const __dirname = dirname(fileURLToPath(import.meta.url))

const conceptInputs = Object.fromEntries(
  globSync('concepts/*/index.html').map(f => [
    f.replace('concepts/', '').replace('/index.html', ''),
    resolve(__dirname, f)
  ])
)

export default {
  base: '/math-viz/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...conceptInputs,
      },
    },
  },
}
