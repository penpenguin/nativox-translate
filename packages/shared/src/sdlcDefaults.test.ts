import { describe, expect, it } from 'vitest'
import { applySdlcDefaults, getSdlcDefaults } from './sdlcDefaults'
import type { FlowNode } from './types'

const createNode = (): FlowNode => ({
  id: 'node-1',
  type: 'requirements',
  position: { x: 0, y: 0 },
  data: { label: '' },
})

describe('SDLC defaults', () => {
  it('returns defaults for known phases', () => {
    const defaults = getSdlcDefaults('requirements')
    expect(defaults?.label).toBe('Requirements')
  })

  it('applies defaults to nodes', () => {
    const node = createNode()
    const updated = applySdlcDefaults(node)
    expect(updated.data.promptTemplate).toBeDefined()
    expect(updated.data.outputArtifacts?.length).toBeGreaterThan(0)
  })
})
