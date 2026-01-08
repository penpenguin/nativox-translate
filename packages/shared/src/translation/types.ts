export type TranslationStatus = 'success' | 'error'

export type TranslationErrorInfo = {
  title: string
  cause: string
}

export type TranslationRequest = {
  sourceText: string
  targetLanguage: string
  systemPrompt?: string
  customPrompt?: string
  backTranslate?: boolean
  agentCommand?: string
}

export type TranslationRecord = {
  id: string
  createdAt: string
  sourceText: string
  translatedText?: string
  backTranslatedText?: string
  targetLanguage: string
  systemPrompt?: string
  customPrompt?: string
  agentCommand?: string
  durationMs?: number
  status: TranslationStatus
  errorMessage?: string
}

export type PromptSettings = {
  systemPrompt?: string
  customPrompt?: string
  updatedAt: string
}

export type TranslationSettings = PromptSettings & {
  targetLanguage: string
  backTranslate: boolean
  agentTimeoutMs: number
}

export type AgentConfig = {
  agentId: string
  displayName: string
  command: string
  args?: string[]
  isDefault?: boolean
  updatedAt: string
}
