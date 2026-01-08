import type {
  AgentConfig,
  TranslationErrorInfo,
  TranslationRecord,
  TranslationRequest,
  TranslationSettings,
} from './types'

export const translationChannels = {
  translate: 'translation:translate',
  historyList: 'translation:history:list',
  historyGet: 'translation:history:get',
  settingsGet: 'translation:settings:get',
  settingsUpdate: 'translation:settings:update',
  agentConfigList: 'translation:agent:list',
  agentConfigUpdate: 'translation:agent:update',
  shortcutResult: 'translation:shortcut:result',
} as const

export type TranslateRequestPayload = TranslationRequest
export type TranslateResponsePayload = TranslationRecord

export type TranslationShortcutResultPayload =
  | {
      status: 'success'
      record: TranslationRecord
      request: TranslateRequestPayload
    }
  | {
      status: 'error'
      error: TranslationErrorInfo
      request?: TranslateRequestPayload
    }

export type HistoryListRequestPayload = {
  limit?: number
  offset?: number
}
export type HistoryListResponsePayload = TranslationRecord[]

export type HistoryGetRequestPayload = {
  id: string
}
export type HistoryGetResponsePayload = TranslationRecord | null

export type TranslationSettingsResponsePayload = TranslationSettings
export type TranslationSettingsRequestPayload = TranslationSettings

export type AgentConfigListResponsePayload = AgentConfig[]
export type AgentConfigRequestPayload = AgentConfig
