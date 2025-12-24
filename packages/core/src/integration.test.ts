import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StateDB } from './stateDb'
import { RunEngine, type RunStateStore } from './runEngine'
import type { Flow } from '@shared/types'

const createFlow = (): Flow => ({
  id: 'flow-1',
  name: 'Integration Flow',
  schemaVersion: 1,
  nodes: [
    {
      id: 'A',
      type: 'requirements',
      position: { x: 0, y: 0 },
      data: { label: 'A' },
    },
    {
      id: 'B',
      type: 'design',
      position: { x: 120, y: 0 },
      data: { label: 'B' },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'A',
      target: 'B',
    },
  ],
})

describe('Integration', () => {
  it('executes a flow and persists node states', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-int-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const store: RunStateStore = {
      updateNodeState: db.updateNodeState.bind(db),
      getNodeState: db.getNodeState.bind(db),
      listNodeStates: db.listNodeStates.bind(db),
    }

    const engine = new RunEngine({
      store,
      executor: {
        execute: async () => ({ success: true }),
      },
      concurrencyLimit: 1,
    })

    const flow = createFlow()
    await engine.execute('run-1', flow)
    const states = await db.listNodeStates('run-1')

    expect(states.map((record) => record.state)).toEqual([
      'completed',
      'completed',
    ])

    await db.close()
  })
})
