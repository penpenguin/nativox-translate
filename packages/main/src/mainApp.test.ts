import { describe, expect, it, vi } from 'vitest'
import { translationChannels } from '@shared/translation/ipc'
import { createMainApp, DEFAULT_SHORTCUT } from './mainApp'

const createDeps = (overrides: Partial<Parameters<typeof createMainApp>[0]> = {}) => {
  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = []
    static getAllWindows = vi.fn(() => FakeBrowserWindow.instances)

    loadURL = vi.fn()
    loadFile = vi.fn()
    options: unknown

    constructor(options: unknown) {
      this.options = options
      FakeBrowserWindow.instances.push(this)
    }
  }

  const app = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
    getPath: vi.fn().mockReturnValue('/tmp'),
  }

  const deps = {
    app,
    BrowserWindow: FakeBrowserWindow,
    ipcMain: { handle: vi.fn() },
    globalShortcut: { register: vi.fn().mockReturnValue(true), unregister: vi.fn() },
    clipboard: { readText: vi.fn(), writeText: vi.fn() },
    env: {},
    joinPath: (...parts: string[]) => parts.join('/'),
    mainDir: '/app/out/main',
    platform: 'linux',
    ...overrides,
  }

  return { deps, FakeBrowserWindow }
}

const createServices = () => ({
  translate: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listAgentConfigs: vi.fn(),
  updateAgentConfig: vi.fn(),
  listHistory: vi.fn(),
  getHistory: vi.fn(),
  handleShortcut: vi.fn(),
})

describe('createMainApp', () => {
  it('loads renderer URL when provided and registers IPC + shortcut', async () => {
    const { deps, FakeBrowserWindow } = createDeps({
      env: { ELECTRON_RENDERER_URL: 'http://localhost:5174' },
    })
    const services = createServices()

    const app = createMainApp(deps, services)
    await app.start()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(FakeBrowserWindow.instances[0]?.loadURL).toHaveBeenCalledWith(
      'http://localhost:5174'
    )

    const channels = (deps.ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock
      .calls
      .map(([channel]) => channel)
    expect(channels).toContain(translationChannels.translate)
    expect(channels).toContain(translationChannels.settingsGet)
    expect(channels).toContain(translationChannels.settingsUpdate)
    expect(channels).toContain(translationChannels.agentConfigList)
    expect(channels).toContain(translationChannels.agentConfigUpdate)
    expect(channels).toContain(translationChannels.historyList)
    expect(channels).toContain(translationChannels.historyGet)

    expect(deps.globalShortcut.register).toHaveBeenCalledWith(
      DEFAULT_SHORTCUT,
      expect.any(Function)
    )
  })

  it('logs errors from shortcut handling to avoid unhandled rejections', async () => {
    const register = vi.fn().mockReturnValue(true)
    const { deps } = createDeps({
      globalShortcut: { register, unregister: vi.fn() },
    })
    const services = createServices()
    const error = new Error('Agent command is not configured')
    services.handleShortcut.mockRejectedValue(error)

    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const app = createMainApp(deps, services)
    await app.start()

    const shortcutHandler = register.mock.calls[0]?.[1] as (() => void) | undefined
    expect(shortcutHandler).toBeTypeOf('function')

    shortcutHandler?.()

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(logSpy).toHaveBeenCalled()

    logSpy.mockRestore()
  })

  it('provides default agent configs for common CLIs', async () => {
    const { deps } = createDeps()

    const app = createMainApp(deps)
    await app.start()

    const handler = (deps.ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock
      .calls
      .find(([channel]) => channel === translationChannels.agentConfigList)?.[1]

    expect(handler).toBeTypeOf('function')

    const result = await (handler as () => Promise<unknown>)()

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: 'codex',
          displayName: 'Codex',
          command: 'codex',
          args: [
            'exec',
            '--output-schema',
            'packages/shared/src/translation/translationOutput.schema.json',
            '-',
          ],
          isDefault: true,
        }),
        expect.objectContaining({
          agentId: 'claude',
          displayName: 'Claude',
          command: 'claude',
          args: expect.arrayContaining(['-p', '--output-format', 'text']),
          isDefault: false,
        }),
        expect.objectContaining({
          agentId: 'gemini',
          displayName: 'Gemini',
          command: 'gemini',
          args: expect.arrayContaining(['-p', '--output-format', 'text']),
          isDefault: false,
        }),
      ])
    )
  })

  it('falls back to local file when renderer URL is missing', async () => {
    const { deps, FakeBrowserWindow } = createDeps()
    const services = createServices()

    const app = createMainApp(deps, services)
    await app.start()

    expect(FakeBrowserWindow.instances).toHaveLength(1)
    expect(FakeBrowserWindow.instances[0]?.loadFile).toHaveBeenCalledWith(
      '/app/out/main/../renderer/index.html'
    )
  })
})
