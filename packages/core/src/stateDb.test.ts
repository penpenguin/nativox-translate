import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveArtifactPath, toRelativeArtifactPath } from './stateDb'
import { StateDB } from './stateDb'

const root = '/tmp/lumberjack'

describe('StateDB path helpers', () => {
  it('converts absolute paths to relative', () => {
    const absolute = '/tmp/lumberjack/artifacts/output.txt'
    expect(toRelativeArtifactPath(root, absolute)).toBe('artifacts/output.txt')
  })

  it('resolves relative paths to absolute', () => {
    const relative = 'artifacts/output.txt'
    expect(resolveArtifactPath(root, relative)).toBe(
      '/tmp/lumberjack/artifacts/output.txt'
    )
  })
})

describe('StateDB events', () => {
  it('records and lists events', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-db-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const now = new Date().toISOString()
    await db.recordEvent({
      runId: 'run-1',
      nodeId: 'node-1',
      type: 'audit',
      payload: { ok: true },
      createdAt: now,
    })
    await db.recordEvent({
      runId: 'run-2',
      type: 'audit',
      createdAt: now,
    })

    const all = await db.listEvents()
    expect(all).toHaveLength(2)

    const filtered = await db.listEvents({ runId: 'run-1' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.runId).toBe('run-1')

    await db.close()
  })
})

describe('StateDB node states', () => {
  it('lists node states for a run', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-db-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const now = new Date().toISOString()
    await db.updateNodeState({
      runId: 'run-1',
      nodeId: 'node-1',
      state: 'running',
      updatedAt: now,
    })
    await db.updateNodeState({
      runId: 'run-2',
      nodeId: 'node-2',
      state: 'completed',
      updatedAt: now,
    })

    const run1 = await db.listNodeStates('run-1')
    expect(run1).toHaveLength(1)
    expect(run1[0]?.runId).toBe('run-1')

    await db.close()
  })
})

describe('StateDB migrations', () => {
  it('reports migration status after open', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-db-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const status = db.getMigrationStatus()
    expect(status.schemaVersion).toBeGreaterThan(0)
    expect(status.applied.length).toBeGreaterThan(0)

    await db.close()
  })
})

describe('StateDB worktrees', () => {
  it('stores base branch and runId', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-db-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const now = new Date().toISOString()
    await db.createWorktree({
      id: 'wt-1',
      path: '/repo/.lumberjack/worktrees/run-1',
      branch: 'run/run-1',
      baseBranch: 'main',
      runId: 'run-1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const stored = await db.getWorktree('wt-1')
    expect(stored?.baseBranch).toBe('main')
    expect(stored?.runId).toBe('run-1')

    await db.close()
  })
})

describe('StateDB artifact lineage', () => {
  it('registers and lists lineage', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'lumberjack-db-'))
    const dbPath = join(baseDir, 'state.db')
    const db = new StateDB()
    await db.open(dbPath)

    const now = new Date().toISOString()
    await db.registerArtifact({
      id: 'artifact-1',
      runId: 'run-1',
      nodeId: 'node-1',
      path: 'out/a.json',
      hash: 'hash-a',
      createdAt: now,
    })
    await db.registerArtifact({
      id: 'artifact-2',
      runId: 'run-1',
      nodeId: 'node-2',
      path: 'out/b.json',
      hash: 'hash-b',
      createdAt: now,
    })

    await db.registerArtifactLineage('artifact-2', 'artifact-1')
    const lineage = await db.listArtifactLineage('artifact-2')

    expect(lineage).toEqual(['artifact-1'])

    await db.close()
  })
})
