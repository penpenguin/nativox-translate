import { describe, expect, it } from 'vitest'
import { StartupRecovery } from './startupRecovery'
import type { FlowLoadResult, NodeStateRecord, RunRecord } from '@shared/types'

const createRun = (id: string, state: RunRecord['state']): RunRecord => ({
  id,
  flowId: 'flow-1',
  worktreeId: 'wt-1',
  state,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

describe('StartupRecovery', () => {
  it('opens DB, loads flows, reconciles worktrees, and interrupts running runs', async () => {
    const opened: string[] = []
    const runUpdates: Array<{ id: string; state: RunRecord['state'] }> = []
    const nodeUpdates: NodeStateRecord[] = []

    const stateDb = {
      open: async (dbPath: string) => {
        opened.push(dbPath)
      },
      listRuns: async () => [
        createRun('run-1', 'running'),
        createRun('run-2', 'completed'),
      ],
      updateRunState: async (runId: string, state: RunRecord['state']) => {
        runUpdates.push({ id: runId, state })
      },
      listNodeStates: async (runId: string) => {
        if (runId !== 'run-1') return []
        return [
          {
            runId,
            nodeId: 'node-1',
            state: 'running',
            updatedAt: new Date().toISOString(),
          },
          {
            runId,
            nodeId: 'node-2',
            state: 'completed',
            updatedAt: new Date().toISOString(),
          },
        ]
      },
      updateNodeState: async (record: NodeStateRecord) => {
        nodeUpdates.push(record)
      },
    }

    const flows: FlowLoadResult[] = [
      {
        flow: {
          id: 'flow-1',
          name: 'Flow',
          schemaVersion: 1,
          nodes: [],
          edges: [],
        },
        readOnly: false,
        migrated: false,
      },
    ]
    const flowStore = {
      loadAll: async () => flows,
    }

    const worktreeManager = {
      reconcileWithDb: async () => ({
        missing: [],
        discovered: [],
        unchanged: [],
      }),
    }

    const sessionStore = {
      loadLastSession: async () => ({ projectRoot: '/repo', flowId: 'flow-1' }),
    }

    const recovery = new StartupRecovery({
      projectRoot: '/repo',
      stateDb,
      flowStore,
      worktreeManager,
      sessionStore,
      dbPathResolver: async () => '/repo/.git/lumberjack/state.db',
    })

    const result = await recovery.recover()

    expect(opened).toEqual(['/repo/.git/lumberjack/state.db'])
    expect(runUpdates).toEqual([{ id: 'run-1', state: 'interrupted' }])
    expect(nodeUpdates).toEqual([
      expect.objectContaining({ nodeId: 'node-1', state: 'interrupted' }),
    ])
    expect(result.flows).toEqual(flows)
    expect(result.lastSession).toEqual({
      projectRoot: '/repo',
      flowId: 'flow-1',
    })
  })
})
