import { describe, expect, it, vi, afterEach } from 'vitest'
import { RunEngine, type NodeExecutor, type RunStateStore } from './runEngine'
import type { Flow, FlowNode, NodeStateRecord } from '@shared/types'

const createNode = (id: string): FlowNode => ({
  id,
  type: 'task',
  position: { x: 0, y: 0 },
  data: { label: id },
})

const createFlow = (nodes: string[], edges: Array<[string, string]>): Flow => ({
  id: 'flow-1',
  name: 'Flow',
  schemaVersion: 1,
  nodes: nodes.map(createNode),
  edges: edges.map(([source, target], index) => ({
    id: `edge-${index}`,
    source,
    target,
  })),
})

const fixedNow = () => new Date('2024-01-01T00:00:00.000Z')

const createStateStore = (initial: NodeStateRecord[] = []) => {
  const map = new Map<string, NodeStateRecord>()
  for (const record of initial) {
    map.set(record.nodeId, record)
  }
  const updates: NodeStateRecord[] = []
  const store: RunStateStore = {
    listNodeStates: async (runId) =>
      [...map.values()].filter((record) => record.runId === runId),
    getNodeState: async (runId, nodeId) => {
      const record = map.get(nodeId)
      if (record?.runId === runId) return record
      return null
    },
    updateNodeState: async (record) => {
      updates.push(record)
      map.set(record.nodeId, record)
    },
  }
  return { store, updates, map }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RunEngine', () => {
  it('detects cycles before execution', async () => {
    const flow = createFlow(
      ['A', 'B'],
      [
        ['A', 'B'],
        ['B', 'A'],
      ]
    )
    const { store } = createStateStore()
    const executor: NodeExecutor = {
      execute: vi.fn(async () => ({ success: true })),
    }
    const engine = new RunEngine({ store, executor, now: fixedNow })

    await expect(engine.execute('run-1', flow)).rejects.toEqual(
      expect.objectContaining({ code: 'FLOW_CYCLE_DETECTED' })
    )
  })

  it('respects concurrency limits while executing nodes', async () => {
    vi.useFakeTimers()
    const flow = createFlow(['A', 'B', 'C'], [])
    const { store } = createStateStore()
    let active = 0
    let maxActive = 0
    const executor: NodeExecutor = {
      execute: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
        return { success: true }
      },
    }
    const engine = new RunEngine({
      store,
      executor,
      now: fixedNow,
      concurrencyLimit: 2,
    })

    const run = engine.execute('run-1', flow)
    await vi.runAllTimersAsync()
    await run

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('blocks dependent nodes when a node fails', async () => {
    const flow = createFlow(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ]
    )
    const { store } = createStateStore()
    const executor: NodeExecutor = {
      execute: async (node) => ({ success: node.id !== 'B' }),
    }
    const engine = new RunEngine({ store, executor, now: fixedNow })

    const result = await engine.execute('run-1', flow)

    expect(result.nodeStates.B).toBe('failed')
    expect(result.nodeStates.C).toBe('blocked')
  })

  it('resumes by rerunning non-completed nodes', async () => {
    const flow = createFlow(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ]
    )
    const initial: NodeStateRecord[] = [
      {
        runId: 'run-1',
        nodeId: 'A',
        state: 'completed',
        updatedAt: fixedNow().toISOString(),
      },
      {
        runId: 'run-1',
        nodeId: 'B',
        state: 'running',
        updatedAt: fixedNow().toISOString(),
      },
      {
        runId: 'run-1',
        nodeId: 'C',
        state: 'pending',
        updatedAt: fixedNow().toISOString(),
      },
    ]
    const { store } = createStateStore(initial)
    const executed: string[] = []
    const executor: NodeExecutor = {
      execute: async (node) => {
        executed.push(node.id)
        return { success: true }
      },
    }
    const engine = new RunEngine({ store, executor, now: fixedNow })

    const result = await engine.resume('run-1', flow)

    expect(executed).toEqual(['B', 'C'])
    expect(result.nodeStates.A).toBe('completed')
    expect(result.nodeStates.B).toBe('completed')
    expect(result.nodeStates.C).toBe('completed')
  })

  it('reruns selected nodes and downstream dependencies', async () => {
    const flow = createFlow(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
      ]
    )
    const initial: NodeStateRecord[] = ['A', 'B', 'C'].map((nodeId) => ({
      runId: 'run-1',
      nodeId,
      state: 'completed',
      updatedAt: fixedNow().toISOString(),
    }))
    const { store } = createStateStore(initial)
    const executed: string[] = []
    const executor: NodeExecutor = {
      execute: async (node) => {
        executed.push(node.id)
        return { success: true }
      },
    }
    const engine = new RunEngine({ store, executor, now: fixedNow })

    await engine.rerun('run-1', flow, ['B'])

    expect(executed).toEqual(['B', 'C'])
  })
})
