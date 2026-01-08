import { describe, expect, it } from 'vitest'
import { createAgentConfigRepository } from './agentConfigRepository'

describe('agentConfigRepository', () => {
  it('selects the most recently updated default config', () => {
    const repo = createAgentConfigRepository()

    repo.saveConfig({
      agentId: 'agent-1',
      displayName: 'Agent One',
      command: 'agent-one',
      isDefault: true,
      updatedAt: '2026-01-07T00:00:00.000Z',
    })

    repo.saveConfig({
      agentId: 'agent-2',
      displayName: 'Agent Two',
      command: 'agent-two',
      isDefault: true,
      updatedAt: '2026-01-08T00:00:00.000Z',
    })

    expect(repo.getDefaultConfig()?.agentId).toBe('agent-2')
  })
})
