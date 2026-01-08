import type { TranslationSettings } from '@shared/translation/types'

export type SettingsServiceDeps = {
  now?: () => Date
  initial?: Partial<TranslationSettings>
}

const defaultSettings = (now: () => Date): TranslationSettings => ({
  systemPrompt: '',
  customPrompt: '',
  targetLanguage: 'en',
  backTranslate: false,
  agentTimeoutMs: 60000,
  updatedAt: now().toISOString(),
})

export const createSettingsService = (deps: SettingsServiceDeps = {}) => {
  const now = deps.now ?? (() => new Date())
  let settings: TranslationSettings = {
    ...defaultSettings(now),
    ...deps.initial,
  }

  const getSettings = () => settings

  const updateSettings = (
    update: Partial<Omit<TranslationSettings, 'updatedAt'>>
  ): TranslationSettings => {
    settings = {
      ...settings,
      ...update,
      updatedAt: now().toISOString(),
    }
    return settings
  }

  return { getSettings, updateSettings }
}
