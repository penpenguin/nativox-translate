/* @vitest-environment node */
import { describe, expect, it } from 'vitest'
import config from '../../../electron.vite.config'

describe('electron.vite.config', () => {
  it('keeps node-sqlite3-wasm external for the main bundle', () => {
    const main = (config as { main?: { build?: { rollupOptions?: { external?: string[] } } } })
      .main
    const external = main?.build?.rollupOptions?.external ?? []

    expect(external).toContain('node-sqlite3-wasm')
  })

  it('builds the renderer into out/renderer for preview loadFile', () => {
    const renderer = (config as { renderer?: { build?: { outDir?: string } } })
      .renderer
    const outDir = renderer?.build?.outDir ?? ''
    const normalized = outDir.replace(/\\\\/g, '/')

    expect(normalized.endsWith('/out/renderer')).toBe(true)
  })
})
