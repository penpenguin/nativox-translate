import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'packages/main/src/index.ts'),
      },
      rollupOptions: {
        external: ['node-sqlite3-wasm'],
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@core': resolve(__dirname, 'packages/core/src'),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/preload/src/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@core': resolve(__dirname, 'packages/core/src'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'packages/renderer'),
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@core': resolve(__dirname, 'packages/core/src'),
      },
    },
  },
})
