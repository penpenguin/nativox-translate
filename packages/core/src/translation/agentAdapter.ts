import type {
  AgentConfig,
  PromptSettings,
  TranslationRequest,
} from '@shared/translation/types'

export type AgentPayload = {
  sourceText: string
  targetLanguage: string
  systemPrompt?: string
  customPrompt?: string
  backTranslate: boolean
}

export type AgentInvocation = {
  command: string
  args?: string[]
  payload: AgentPayload
}

export type AgentTranslationResult = {
  translatedText: string
  backTranslatedText?: string
}

export type AgentAdapter = {
  buildInvocation: (input: {
    request: TranslationRequest
    settings?: PromptSettings
    agentConfig: AgentConfig
  }) => AgentInvocation
  parseResponse: (data: unknown) => AgentTranslationResult
}

export const defaultAgentAdapter: AgentAdapter = {
  buildInvocation: ({ request, settings, agentConfig }) => ({
    command: agentConfig.command,
    args: agentConfig.args,
    payload: {
      sourceText: request.sourceText,
      targetLanguage: request.targetLanguage,
      systemPrompt: settings?.systemPrompt,
      customPrompt: settings?.customPrompt,
      backTranslate: request.backTranslate ?? false,
    },
  }),
  parseResponse: (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Agent response is not an object')
    }
    const result = data as { translatedText?: unknown; backTranslatedText?: unknown }
    if (typeof result.translatedText !== 'string' || result.translatedText.length === 0) {
      throw new Error('Agent response missing translatedText')
    }
    return {
      translatedText: result.translatedText,
      backTranslatedText:
        typeof result.backTranslatedText === 'string'
          ? result.backTranslatedText
          : undefined,
    }
  },
}
