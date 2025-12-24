import { LumberjackError } from '@shared/errors'
import type {
  Flow,
  FlowNode,
  NodeExecutionState,
  NodeStateRecord,
} from '@shared/types'

export interface NodeExecutionResult {
  success: boolean
  errorMessage?: string
}

export interface NodeExecutor {
  execute: (
    node: FlowNode,
    context: { runId: string; nodeId: string; flowId: string }
  ) => Promise<NodeExecutionResult>
}

export interface RunStateStore {
  updateNodeState: (record: NodeStateRecord) => Promise<void>
  getNodeState: (
    runId: string,
    nodeId: string
  ) => Promise<NodeStateRecord | null>
  listNodeStates: (runId: string) => Promise<NodeStateRecord[]>
}

export interface RunExecutionResult {
  runId: string
  nodeStates: Record<string, NodeExecutionState>
}

type RunMode = 'fresh' | 'resume' | 'rerun'

export class RunEngine {
  private readonly store: RunStateStore
  private readonly executor: NodeExecutor
  private readonly now: () => Date
  private readonly concurrencyLimit: number

  constructor({
    store,
    executor,
    now,
    concurrencyLimit = 2,
  }: {
    store: RunStateStore
    executor: NodeExecutor
    now?: () => Date
    concurrencyLimit?: number
  }) {
    this.store = store
    this.executor = executor
    this.now = now ?? (() => new Date())
    this.concurrencyLimit = Math.max(1, concurrencyLimit)
  }

  async execute(runId: string, flow: Flow): Promise<RunExecutionResult> {
    return this.run({ runId, flow, mode: 'fresh' })
  }

  async resume(runId: string, flow: Flow): Promise<RunExecutionResult> {
    return this.run({ runId, flow, mode: 'resume' })
  }

  async rerun(
    runId: string,
    flow: Flow,
    nodeIds: string[]
  ): Promise<RunExecutionResult> {
    return this.run({ runId, flow, mode: 'rerun', rerunNodeIds: nodeIds })
  }

  private async run({
    runId,
    flow,
    mode,
    rerunNodeIds,
  }: {
    runId: string
    flow: Flow
    mode: RunMode
    rerunNodeIds?: string[]
  }): Promise<RunExecutionResult> {
    ensureAcyclic(flow)
    const nodes = flow.nodes
    const deps = buildDependencies(flow)
    const adjacency = buildAdjacency(flow)

    const nodeStates = new Map<string, NodeExecutionState>()
    const existing = await this.store.listNodeStates(runId)
    const existingMap = new Map(
      existing.map((record) => [record.nodeId, record])
    )

    const rerunTargets =
      mode === 'rerun' && rerunNodeIds
        ? collectDownstream(rerunNodeIds, adjacency)
        : new Set<string>()

    for (const node of nodes) {
      const existingState = existingMap.get(node.id)?.state ?? 'pending'
      let nextState: NodeExecutionState = existingState
      if (mode === 'fresh') {
        nextState = 'pending'
      } else if (mode === 'resume') {
        nextState = existingState === 'completed' ? 'completed' : 'pending'
      } else if (mode === 'rerun') {
        if (rerunTargets.has(node.id)) {
          nextState = 'pending'
        }
      }
      nodeStates.set(node.id, nextState)
      if (existingState !== nextState || !existingMap.has(node.id)) {
        await this.store.updateNodeState({
          runId,
          nodeId: node.id,
          state: nextState,
          updatedAt: this.now().toISOString(),
        })
      }
    }

    const running = new Map<string, Promise<void>>()

    const startNode = async (node: FlowNode) => {
      nodeStates.set(node.id, 'running')
      await this.store.updateNodeState({
        runId,
        nodeId: node.id,
        state: 'running',
        updatedAt: this.now().toISOString(),
      })
      try {
        const result = await this.executor.execute(node, {
          runId,
          nodeId: node.id,
          flowId: flow.id,
        })
        if (result.success) {
          nodeStates.set(node.id, 'completed')
          await this.store.updateNodeState({
            runId,
            nodeId: node.id,
            state: 'completed',
            updatedAt: this.now().toISOString(),
          })
        } else {
          nodeStates.set(node.id, 'failed')
          await this.store.updateNodeState({
            runId,
            nodeId: node.id,
            state: 'failed',
            updatedAt: this.now().toISOString(),
            meta: result.errorMessage
              ? { errorMessage: result.errorMessage }
              : undefined,
          })
          await this.blockDependents(runId, node.id, adjacency, nodeStates)
        }
      } finally {
        running.delete(node.id)
      }
    }

    while (true) {
      const ready = nodes.filter((node) => {
        if (nodeStates.get(node.id) !== 'pending') return false
        const dependencies = deps.get(node.id) ?? []
        return dependencies.every((dep) => nodeStates.get(dep) === 'completed')
      })

      for (const node of ready) {
        if (running.size >= this.concurrencyLimit) break
        const promise = startNode(node)
        running.set(node.id, promise)
      }

      if (running.size === 0) {
        break
      }
      await Promise.race(running.values())
    }

    return {
      runId,
      nodeStates: Object.fromEntries(nodeStates),
    }
  }

  private async blockDependents(
    runId: string,
    failedNodeId: string,
    adjacency: Map<string, string[]>,
    nodeStates: Map<string, NodeExecutionState>
  ): Promise<void> {
    const queue = [failedNodeId]
    const visited = new Set<string>([failedNodeId])
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      const dependents = adjacency.get(current) ?? []
      for (const dependent of dependents) {
        if (visited.has(dependent)) continue
        visited.add(dependent)
        queue.push(dependent)
        const currentState = nodeStates.get(dependent)
        if (currentState === 'completed' || currentState === 'failed') {
          continue
        }
        nodeStates.set(dependent, 'blocked')
        await this.store.updateNodeState({
          runId,
          nodeId: dependent,
          state: 'blocked',
          updatedAt: this.now().toISOString(),
        })
      }
    }
  }
}

const buildDependencies = (flow: Flow): Map<string, string[]> => {
  const deps = new Map<string, string[]>()
  for (const node of flow.nodes) {
    deps.set(node.id, [])
  }
  for (const edge of flow.edges) {
    const list = deps.get(edge.target) ?? []
    list.push(edge.source)
    deps.set(edge.target, list)
  }
  return deps
}

const buildAdjacency = (flow: Flow): Map<string, string[]> => {
  const adjacency = new Map<string, string[]>()
  for (const node of flow.nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of flow.edges) {
    const list = adjacency.get(edge.source) ?? []
    list.push(edge.target)
    adjacency.set(edge.source, list)
  }
  return adjacency
}

const ensureAcyclic = (flow: Flow): void => {
  const adjacency = buildAdjacency(flow)
  const visited = new Set<string>()
  const inStack = new Set<string>()

  const visit = (nodeId: string) => {
    if (inStack.has(nodeId)) {
      throw new LumberjackError(
        'FLOW_CYCLE_DETECTED',
        'Flow contains a cycle',
        { nodeId }
      )
    }
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    inStack.add(nodeId)
    const neighbors = adjacency.get(nodeId) ?? []
    for (const next of neighbors) {
      visit(next)
    }
    inStack.delete(nodeId)
  }

  for (const node of flow.nodes) {
    visit(node.id)
  }
}

const collectDownstream = (
  nodeIds: string[],
  adjacency: Map<string, string[]>
): Set<string> => {
  const result = new Set<string>(nodeIds)
  const queue = [...nodeIds]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    for (const next of adjacency.get(current) ?? []) {
      if (result.has(next)) continue
      result.add(next)
      queue.push(next)
    }
  }
  return result
}
