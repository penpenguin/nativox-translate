import { randomUUID } from 'node:crypto'
import type {
  AgentConfig,
  TranslationRecord,
  TranslationRequest,
  TranslationSettings,
} from '@shared/translation/types'
import {
  type AgentAdapter,
  type AgentInvocation,
  defaultAgentAdapter,
} from './agentAdapter'

export type AgentExecOutcome = {
  data: unknown
  durationMs: number
}

export type AgentExecutor = (
  invocation: AgentInvocation,
  timeoutMs?: number
) => Promise<AgentExecOutcome>

export type TranslationServiceDeps = {
  adapter?: AgentAdapter
  executeAgent: AgentExecutor
  idFactory?: () => string
  now?: () => Date
  historyRepository?: {
    addRecord: (record: TranslationRecord) => void
  }
}

export type TranslationInput = {
  request: TranslationRequest
  settings?: TranslationSettings
  agentConfig: AgentConfig
}

export const createTranslationService = (deps: TranslationServiceDeps) => {
  const adapter = deps.adapter ?? defaultAgentAdapter
  const now = deps.now ?? (() => new Date())
  const idFactory = deps.idFactory ?? (() => randomUUID())

  const translate = async (input: TranslationInput): Promise<TranslationRecord> => {
    const mergedRequest: TranslationRequest = {
      sourceText: input.request.sourceText,
      targetLanguage:
        input.request.targetLanguage || input.settings?.targetLanguage || '',
      systemPrompt: input.request.systemPrompt ?? input.settings?.systemPrompt,
      customPrompt: input.request.customPrompt ?? input.settings?.customPrompt,
      backTranslate:
        input.request.backTranslate ?? input.settings?.backTranslate ?? false,
      agentCommand: input.request.agentCommand,
    }

    if (!mergedRequest.sourceText.trim()) {
      throw new Error('sourceText is required')
    }
    if (!mergedRequest.targetLanguage.trim()) {
      throw new Error('targetLanguage is required')
    }

    const invocation = adapter.buildInvocation({
      request: mergedRequest,
      settings: input.settings,
      agentConfig: input.agentConfig,
    })
    const startedAt = now().getTime()
    const outcome = await deps.executeAgent(
      invocation,
      input.settings?.agentTimeoutMs
    )
    const parsed = adapter.parseResponse(outcome.data)
    const durationMs = now().getTime() - startedAt

    const record: TranslationRecord = {
      id: idFactory(),
      createdAt: now().toISOString(),
      sourceText: mergedRequest.sourceText,
      translatedText: parsed.translatedText,
      backTranslatedText: parsed.backTranslatedText,
      targetLanguage: mergedRequest.targetLanguage,
      systemPrompt: mergedRequest.systemPrompt,
      customPrompt: mergedRequest.customPrompt,
      agentCommand: invocation.command,
      durationMs,
      status: 'success',
    }

    try {
      deps.historyRepository?.addRecord(record)
    } catch {
      // History persistence failures should not block the translation result.
    }

    return record
  }

  return { translate }
}

export type { AgentAdapter, AgentInvocation }
