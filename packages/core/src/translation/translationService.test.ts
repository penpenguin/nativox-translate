import { describe, expect, it } from 'vitest'
import { createTranslationService } from './translationService'
import type {
  AgentAdapter,
  AgentInvocation,
  TranslationRequest,
} from './translationService'
import type { AgentConfig, TranslationSettings } from '@shared/translation/types'

describe('translationService', () => {
  it('returns a success record for a successful translation', async () => {
    const adapter: AgentAdapter = {
      buildInvocation: (input) => ({
        command: input.agentConfig.command,
        args: input.agentConfig.args,
        payload: {
          sourceText: input.request.sourceText,
          targetLanguage: input.request.targetLanguage,
          systemPrompt: input.settings?.systemPrompt,
          customPrompt: input.settings?.customPrompt,
          backTranslate: input.request.backTranslate ?? false,
        },
      }),
      parseResponse: (data) => ({
        translatedText: (data as { translatedText: string }).translatedText,
      }),
    }

    const executeAgent = async (_invocation: AgentInvocation) => ({
      data: { translatedText: 'hola' },
      durationMs: 123,
    })

    const service = createTranslationService({
      adapter,
      executeAgent,
      idFactory: () => 'record-1',
      now: () => new Date('2026-01-07T00:00:00.000Z'),
    })

    const request: TranslationRequest = {
      sourceText: 'hello',
      targetLanguage: 'es',
      backTranslate: false,
    }
    const settings: TranslationSettings = {
      systemPrompt: 'system',
      customPrompt: 'custom',
      targetLanguage: 'es',
      backTranslate: false,
      agentTimeoutMs: 60000,
      updatedAt: '2026-01-07T00:00:00.000Z',
    }
    const agentConfig: AgentConfig = {
      agentId: 'agent-1',
      displayName: 'Local Agent',
      command: 'agent-cli',
      args: ['--fast'],
      isDefault: true,
      updatedAt: '2026-01-07T00:00:00.000Z',
    }

    const record = await service.translate({ request, settings, agentConfig })

    expect(record).toMatchObject({
      id: 'record-1',
      sourceText: 'hello',
      translatedText: 'hola',
      targetLanguage: 'es',
      systemPrompt: 'system',
      customPrompt: 'custom',
      agentCommand: 'agent-cli',
      status: 'success',
    })
    expect(record.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('passes agent timeout from settings to executor', async () => {
    let receivedTimeout: number | undefined

    const service = createTranslationService({
      executeAgent: async (_invocation: AgentInvocation, timeoutMs?: number) => {
        receivedTimeout = timeoutMs
        return {
          data: { translatedText: 'hola' },
          durationMs: 42,
        }
      },
      idFactory: () => 'record-2',
      now: () => new Date('2026-01-07T00:00:00.000Z'),
    })

    const request: TranslationRequest = {
      sourceText: 'hello',
      targetLanguage: 'es',
      backTranslate: false,
    }
    const settings: TranslationSettings = {
      systemPrompt: '',
      customPrompt: '',
      targetLanguage: 'es',
      backTranslate: false,
      agentTimeoutMs: 60000,
      updatedAt: '2026-01-07T00:00:00.000Z',
    }
    const agentConfig: AgentConfig = {
      agentId: 'agent-1',
      displayName: 'Local Agent',
      command: 'agent-cli',
      args: ['--fast'],
      isDefault: true,
      updatedAt: '2026-01-07T00:00:00.000Z',
    }

    await service.translate({ request, settings, agentConfig })

    expect(receivedTimeout).toBe(60000)
  })
})
