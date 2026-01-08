import { defineConfig } from 'vitest/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src'),
      '@core': resolve(__dirname, 'packages/core/src'),
    },
  },
})
