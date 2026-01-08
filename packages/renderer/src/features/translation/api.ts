import type {
  TranslateRequestPayload,
  TranslateResponsePayload,
  HistoryListRequestPayload,
  HistoryListResponsePayload,
  HistoryGetRequestPayload,
  HistoryGetResponsePayload,
  TranslationSettingsRequestPayload,
  TranslationSettingsResponsePayload,
  TranslationShortcutResultPayload,
  AgentConfigListResponsePayload,
  AgentConfigRequestPayload,
} from '@shared/translation/ipc'

export type TranslationApi = {
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
  onShortcutResult?: (
    listener: (payload: TranslationShortcutResultPayload) => void
  ) => () => void
}

declare global {
  interface Window {
    translationApi?: TranslationApi
  }
}

const getTranslationApi = (): TranslationApi => {
  if (!window.translationApi) {
    throw new Error('Translation API is not available')
  }
  return window.translationApi
}

export const translationApi = {
  translate: (payload: TranslateRequestPayload) => getTranslationApi().translate(payload),
  listHistory: (payload?: HistoryListRequestPayload) =>
    getTranslationApi().listHistory(payload),
  getHistory: (payload: HistoryGetRequestPayload) => getTranslationApi().getHistory(payload),
  getPromptSettings: () => getTranslationApi().getPromptSettings(),
  updatePromptSettings: (payload: TranslationSettingsRequestPayload) =>
    getTranslationApi().updatePromptSettings(payload),
  listAgentConfigs: () => getTranslationApi().listAgentConfigs(),
  updateAgentConfig: (payload: AgentConfigRequestPayload) =>
    getTranslationApi().updateAgentConfig(payload),
  onShortcutResult: (listener: (payload: TranslationShortcutResultPayload) => void) =>
    getTranslationApi().onShortcutResult?.(listener),
}
