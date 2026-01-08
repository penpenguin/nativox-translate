import type { IpcMainInvokeEvent } from 'electron'
import {
  translationChannels,
  type TranslateRequestPayload,
  type TranslateResponsePayload,
  type TranslationSettingsRequestPayload,
  type TranslationSettingsResponsePayload,
  type AgentConfigListResponsePayload,
  type AgentConfigRequestPayload,
  type HistoryListRequestPayload,
  type HistoryListResponsePayload,
  type HistoryGetRequestPayload,
  type HistoryGetResponsePayload,
} from '@shared/translation/ipc'

export type TranslationIpcDeps = {
  ipcMain: {
    handle: (
      channel: string,
      listener: (
        event: IpcMainInvokeEvent,
        ...args: unknown[]
      ) => Promise<unknown>
    ) => void
  }
  translate: (payload: TranslateRequestPayload) => Promise<TranslateResponsePayload>
  getSettings?: () => Promise<TranslationSettingsResponsePayload>
  updateSettings?: (
    payload: TranslationSettingsRequestPayload
  ) => Promise<TranslationSettingsResponsePayload>
  listAgentConfigs?: () => Promise<AgentConfigListResponsePayload>
  updateAgentConfig?: (
    payload: AgentConfigRequestPayload
  ) => Promise<AgentConfigRequestPayload>
  listHistory?: (
    payload: HistoryListRequestPayload
  ) => Promise<HistoryListResponsePayload>
  getHistory?: (
    payload: HistoryGetRequestPayload
  ) => Promise<HistoryGetResponsePayload>
}

export const registerTranslationIpcHandlers = (deps: TranslationIpcDeps) => {
  deps.ipcMain.handle(
    translationChannels.translate,
    async (_event, payload: TranslateRequestPayload) =>
      await deps.translate(payload)
  )

  if (deps.getSettings) {
    deps.ipcMain.handle(
      translationChannels.settingsGet,
      async () => await deps.getSettings?.()
    )
  }

  if (deps.updateSettings) {
    deps.ipcMain.handle(
      translationChannels.settingsUpdate,
      async (_event, payload: TranslationSettingsRequestPayload) =>
        await deps.updateSettings?.(payload)
    )
  }

  if (deps.listAgentConfigs) {
    deps.ipcMain.handle(
      translationChannels.agentConfigList,
      async () => await deps.listAgentConfigs?.()
    )
  }

  if (deps.updateAgentConfig) {
    deps.ipcMain.handle(
      translationChannels.agentConfigUpdate,
      async (_event, payload: AgentConfigRequestPayload) =>
        await deps.updateAgentConfig?.(payload)
    )
  }

  if (deps.listHistory) {
    deps.ipcMain.handle(
      translationChannels.historyList,
      async (_event, payload: HistoryListRequestPayload) =>
        await deps.listHistory?.(payload)
    )
  }

  if (deps.getHistory) {
    deps.ipcMain.handle(
      translationChannels.historyGet,
      async (_event, payload: HistoryGetRequestPayload) =>
        await deps.getHistory?.(payload)
    )
  }
}
