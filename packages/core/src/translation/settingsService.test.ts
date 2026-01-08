import { describe, expect, it } from 'vitest'
import { createSettingsService } from './settingsService'

describe('settingsService', () => {
  it('applies updates to prompt and language settings', () => {
    const service = createSettingsService({
      now: () => new Date('2026-01-07T00:00:00.000Z'),
    })

    const updated = service.updateSettings({
      systemPrompt: 'system',
      customPrompt: 'custom',
      targetLanguage: 'fr',
      backTranslate: true,
    })

    expect(updated).toEqual({
      systemPrompt: 'system',
      customPrompt: 'custom',
      targetLanguage: 'fr',
      backTranslate: true,
      agentTimeoutMs: 60000,
      updatedAt: '2026-01-07T00:00:00.000Z',
    })

    expect(service.getSettings()).toEqual(updated)
  })
})
