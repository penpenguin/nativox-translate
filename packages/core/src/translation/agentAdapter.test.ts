import { describe, expect, it } from 'vitest'
import { defaultAgentAdapter } from './agentAdapter'
import type {
  AgentConfig,
  PromptSettings,
  TranslationRequest,
} from '@shared/translation/types'

describe('agentAdapter', () => {
  it('builds payload with prompts and command', () => {
    const request: TranslationRequest = {
      sourceText: 'hello',
      targetLanguage: 'ja',
      backTranslate: true,
    }
    const settings: PromptSettings = {
      systemPrompt: 'system',
      customPrompt: 'custom',
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

    const invocation = defaultAgentAdapter.buildInvocation({
      request,
      settings,
      agentConfig,
    })

    expect(invocation.command).toBe('agent-cli')
    expect(invocation.args).toEqual(['--fast'])
    expect(invocation.payload).toEqual({
      sourceText: 'hello',
      targetLanguage: 'ja',
      systemPrompt: 'system',
      customPrompt: 'custom',
      backTranslate: true,
    })
  })
})
