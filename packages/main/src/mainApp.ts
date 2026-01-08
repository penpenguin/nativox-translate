import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AgentConfigListResponsePayload,
  AgentConfigRequestPayload,
  HistoryGetRequestPayload,
  HistoryGetResponsePayload,
  HistoryListRequestPayload,
  HistoryListResponsePayload,
  TranslateRequestPayload,
  TranslateResponsePayload,
  TranslationShortcutResultPayload,
  TranslationSettingsRequestPayload,
  TranslationSettingsResponsePayload,
} from '@shared/translation/ipc'
import type { TranslationRecord } from '@shared/translation/types'
import {
  createAgentConfigRepository,
  createHistoryRepository,
  createSettingsService,
  createTranslationService,
  mapTranslationError,
} from '@core/translation'
import {
  agentExec,
  captureSelection,
  createSystemCopyShortcut,
  createTranslationController,
  registerTranslationIpcHandlers,
  registerTranslationShortcut,
  type ShortcutTranslationResult,
} from './translation'
import { translationChannels } from '@shared/translation/ipc'

export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+T'

const defaultMainDir = dirname(fileURLToPath(import.meta.url))

type BrowserWindowLike = {
  loadURL: (url: string) => void | Promise<void>
  loadFile: (path: string) => void | Promise<void>
  webContents?: {
    copy?: () => void
    send?: (channel: string, payload: TranslationShortcutResultPayload) => void
  }
}

type BrowserWindowConstructor = {
  new (options: Record<string, unknown>): BrowserWindowLike
  getAllWindows: () => BrowserWindowLike[]
  getFocusedWindow?: () => BrowserWindowLike | null
}

type AppLike = {
  whenReady: () => Promise<void>
  on: (event: string, listener: () => void) => void
  quit: () => void
  getPath: (name: string) => string
}

type IpcMainLike = {
  handle: (
    channel: string,
    listener: (...args: unknown[]) => Promise<unknown>
  ) => void
}

type GlobalShortcutLike = {
  register: (accelerator: string, callback: () => void) => boolean
  unregister: (accelerator: string) => void
}

type ClipboardLike = {
  readText: () => string
  writeText: (text: string) => void
}

export type MainAppDeps = {
  app: AppLike
  BrowserWindow: BrowserWindowConstructor
  ipcMain: IpcMainLike
  globalShortcut: GlobalShortcutLike
  clipboard: ClipboardLike
  env: NodeJS.ProcessEnv
  joinPath: (...parts: string[]) => string
  mainDir?: string
  platform?: NodeJS.Platform
  now?: () => Date
}

export type MainAppServices = {
  translate: (payload: TranslateRequestPayload) => Promise<TranslateResponsePayload>
  getSettings: () => Promise<TranslationSettingsResponsePayload>
  updateSettings: (
    payload: TranslationSettingsRequestPayload
  ) => Promise<TranslationSettingsResponsePayload>
  listAgentConfigs: () => Promise<AgentConfigListResponsePayload>
  updateAgentConfig: (
    payload: AgentConfigRequestPayload
  ) => Promise<AgentConfigRequestPayload>
  listHistory: (payload?: HistoryListRequestPayload) => Promise<HistoryListResponsePayload>
  getHistory: (
    payload: HistoryGetRequestPayload
  ) => Promise<HistoryGetResponsePayload>
  handleShortcut: () => Promise<ShortcutTranslationResult | void>
  dispose?: () => void
}

const translationOutputSchemaPath =
  'packages/shared/src/translation/translationOutput.schema.json'
const translationJsonPrompt =
  'Input is JSON on stdin with keys sourceText, targetLanguage, systemPrompt, customPrompt, backTranslate. Translate sourceText to targetLanguage. If backTranslate is true, include backTranslatedText. Respond with JSON only with keys translatedText and backTranslatedText.'

const createDefaultAgentConfigs = (
  now: () => Date
): AgentConfigRequestPayload[] => [
  {
    agentId: 'codex',
    displayName: 'Codex',
    command: 'codex',
    args: ['exec', '--output-schema', translationOutputSchemaPath, '-'],
    isDefault: true,
    updatedAt: now().toISOString(),
  },
  {
    agentId: 'claude',
    displayName: 'Claude',
    command: 'claude',
    args: ['-p', translationJsonPrompt, '--output-format', 'text'],
    isDefault: false,
    updatedAt: now().toISOString(),
  },
  {
    agentId: 'gemini',
    displayName: 'Gemini',
    command: 'gemini',
    args: ['-p', translationJsonPrompt, '--output-format', 'text'],
    isDefault: false,
    updatedAt: now().toISOString(),
  },
]

const getShortcutRequest = (error: unknown) => {
  if (!error || typeof error !== 'object') return undefined
  if (!('request' in error)) return undefined
  return (error as { request?: TranslateRequestPayload }).request
}

const buildDefaultServices = (deps: MainAppDeps): MainAppServices => {
  const now = deps.now ?? (() => new Date())
  const settingsService = createSettingsService({ now })
  const agentConfigRepository = createAgentConfigRepository({
    now,
    initial: createDefaultAgentConfigs(now),
  })
  const historyRepository = createHistoryRepository({
    dbPath: deps.joinPath(deps.app.getPath('userData'), 'translation-history.db'),
  })
  const translationService = createTranslationService({
    executeAgent: async (invocation, timeoutMs) => {
      const result = await agentExec({
        command: invocation.command,
        args: invocation.args,
        payload: invocation.payload,
        timeoutMs,
      })
      return { data: result.data, durationMs: result.durationMs }
    },
    now,
    historyRepository,
  })

  const getAgentConfig = () =>
    agentConfigRepository.getDefaultConfig() ??
    agentConfigRepository.listConfigs()[0] ??
    null

  const translate = async (payload: TranslateRequestPayload) => {
    const agentConfig = getAgentConfig()
    if (!agentConfig || !agentConfig.command.trim()) {
      throw new Error('Agent command is not configured')
    }

    const settings = settingsService.getSettings()
    return await translationService.translate({ request: payload, settings, agentConfig })
  }

  const sendCopyShortcut = createSystemCopyShortcut({
    platform: deps.platform ?? process.platform,
  })

  const handleShortcut = async () => {
    const controller = createTranslationController({
      captureSelection: async () => {
        const selection = await captureSelection({
          clipboard: deps.clipboard,
          sendCopyShortcut: async () => {
            await sendCopyShortcut()
          },
          settleDelayMs: 50,
        })
        return { text: selection.text }
      },
      buildRequest: (sourceText) => {
        const settings = settingsService.getSettings()
        return {
          sourceText,
          targetLanguage: settings.targetLanguage,
          systemPrompt: settings.systemPrompt,
          customPrompt: settings.customPrompt,
          backTranslate: settings.backTranslate,
        }
      },
      translate,
    })

    return await controller.handleShortcut()
  }

  const listHistory = async (payload?: HistoryListRequestPayload) =>
    historyRepository.listRecords(payload?.limit, payload?.offset)

  const getHistory = async (payload: HistoryGetRequestPayload) =>
    historyRepository.getRecord(payload.id)

  return {
    translate,
    getSettings: async () => settingsService.getSettings(),
    updateSettings: async (payload) => settingsService.updateSettings(payload),
    listAgentConfigs: async () => agentConfigRepository.listConfigs(),
    updateAgentConfig: async (payload) => agentConfigRepository.saveConfig(payload),
    listHistory,
    getHistory,
    handleShortcut,
    dispose: () => historyRepository.close(),
  }
}

export const createMainApp = (deps: MainAppDeps, services?: MainAppServices) => {
  const mainDir = deps.mainDir ?? defaultMainDir
  let activeServices = services

  const createWindow = () => {
    const window = new deps.BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: deps.joinPath(mainDir, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    const rendererUrl = deps.env.ELECTRON_RENDERER_URL
    if (rendererUrl) {
      void window.loadURL(rendererUrl)
    } else {
      void window.loadFile(deps.joinPath(mainDir, '../renderer/index.html'))
    }

    return window
  }

  const start = async () => {
    await deps.app.whenReady()

    const runtime = activeServices ?? buildDefaultServices(deps)
    activeServices = runtime

    registerTranslationIpcHandlers({
      ipcMain: deps.ipcMain,
      translate: runtime.translate,
      getSettings: runtime.getSettings,
      updateSettings: runtime.updateSettings,
      listAgentConfigs: runtime.listAgentConfigs,
      updateAgentConfig: runtime.updateAgentConfig,
      listHistory: runtime.listHistory,
      getHistory: runtime.getHistory,
    })

    const notifyShortcutResult = (payload: TranslationShortcutResultPayload) => {
      deps
        .BrowserWindow
        .getAllWindows()
        .forEach((window) => window.webContents?.send?.(translationChannels.shortcutResult, payload))
    }

    const unregisterShortcut = registerTranslationShortcut({
      globalShortcut: deps.globalShortcut,
      accelerator: DEFAULT_SHORTCUT,
      onTriggered: () => {
        void runtime
          .handleShortcut()
          .then((result) => {
            if (!result) return
            notifyShortcutResult({
              status: 'success',
              record: result.record,
              request: result.request,
            })
          })
          .catch((error) => {
            notifyShortcutResult({
              status: 'error',
              error: mapTranslationError(error),
              request: getShortcutRequest(error),
            })
            console.error('Translation shortcut failed', error)
          })
      },
    })

    createWindow()

    deps.app.on('activate', () => {
      if (deps.BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })

    deps.app.on('window-all-closed', () => {
      const platform = deps.platform ?? process.platform
      if (platform !== 'darwin') {
        deps.app.quit()
      }
    })

    deps.app.on('will-quit', () => {
      unregisterShortcut()
      runtime.dispose?.()
    })
  }

  return { start, createWindow }
}

export type { TranslationRecord }
