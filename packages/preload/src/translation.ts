import {
  translationChannels,
  type TranslateRequestPayload,
  type TranslateResponsePayload,
  type HistoryListRequestPayload,
  type HistoryListResponsePayload,
  type HistoryGetRequestPayload,
  type HistoryGetResponsePayload,
  type TranslationSettingsRequestPayload,
  type TranslationSettingsResponsePayload,
  type TranslationShortcutResultPayload,
  type AgentConfigListResponsePayload,
  type AgentConfigRequestPayload,
} from '@shared/translation/ipc'
import type { IpcRenderer } from 'electron'

export type TranslationBridge = {
  translate: (payload: TranslateRequestPayload) => Promise<TranslateResponsePayload>
  listHistory: (payload?: HistoryListRequestPayload) => Promise<HistoryListResponsePayload>
  getHistory: (payload: HistoryGetRequestPayload) => Promise<HistoryGetResponsePayload>
  getPromptSettings: () => Promise<TranslationSettingsResponsePayload>
  updatePromptSettings: (
    payload: TranslationSettingsRequestPayload
  ) => Promise<TranslationSettingsResponsePayload>
  listAgentConfigs: () => Promise<AgentConfigListResponsePayload>
  updateAgentConfig: (
    payload: AgentConfigRequestPayload
  ) => Promise<AgentConfigRequestPayload>
  onShortcutResult: (
    listener: (payload: TranslationShortcutResultPayload) => void
  ) => () => void
}

export const createTranslationBridge = (
  ipcRenderer: Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>
): TranslationBridge => ({
  translate: (payload) =>
    ipcRenderer.invoke(translationChannels.translate, payload),
  listHistory: (payload) =>
    ipcRenderer.invoke(translationChannels.historyList, payload),
  getHistory: (payload) => ipcRenderer.invoke(translationChannels.historyGet, payload),
  getPromptSettings: () => ipcRenderer.invoke(translationChannels.settingsGet),
  updatePromptSettings: (payload) =>
    ipcRenderer.invoke(translationChannels.settingsUpdate, payload),
  listAgentConfigs: () => ipcRenderer.invoke(translationChannels.agentConfigList),
  updateAgentConfig: (payload) =>
    ipcRenderer.invoke(translationChannels.agentConfigUpdate, payload),
  onShortcutResult: (listener) => {
    const wrapped = (_event: unknown, payload: TranslationShortcutResultPayload) => {
      listener(payload)
    }
    ipcRenderer.on(translationChannels.shortcutResult, wrapped)
    return () => {
      ipcRenderer.removeListener(translationChannels.shortcutResult, wrapped)
    }
  },
})
