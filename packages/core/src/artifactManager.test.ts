import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildContextPayload,
  buildArtifactId,
  registerOutputArtifacts,
  resolveInputArtifacts,
  type ArtifactStore,
} from './artifactManager'
import type { ArtifactDef, ArtifactRecord, ArtifactRef } from '@shared/types'

const createStore = (artifacts: ArtifactRecord[] = []) => {
  const lineage: Array<{ artifactId: string; sourceArtifactId: string }> = []
  const store: ArtifactStore = {
    registerArtifact: async (record) => {
      artifacts.push(record)
    },
    getArtifact: async (artifactId) =>
      artifacts.find((record) => record.id === artifactId) ?? null,
    getArtifactsByNode: async (runId, nodeId) =>
      artifacts.filter(
        (record) => record.runId === runId && record.nodeId === nodeId
      ),
    registerArtifactLineage: async (artifactId, sourceArtifactId) => {
      lineage.push({ artifactId, sourceArtifactId })
    },
  }
  return { store, artifacts, lineage }
}

describe('ArtifactManager', () => {
  it('resolves input artifact references and respects optional inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumberjack-artifact-'))
    const runId = 'run-1'
    const upstreamId = buildArtifactId(runId, 'requirements', 'spec')
    const record: ArtifactRecord = {
      id: upstreamId,
      runId,
      nodeId: 'requirements',
      path: 'specs/output.json',
      hash: 'hash',
      createdAt: new Date().toISOString(),
    }
    const { store } = createStore([record])

    const inputs: ArtifactRef[] = [
      { name: 'spec', ref: '@node:requirements.output.spec' },
      { name: 'optional', ref: '@node:missing.output.none', required: false },
    ]

    const resolved = await resolveInputArtifacts({
      runId,
      projectRoot: root,
      inputs,
      store,
    })

    expect(resolved.artifacts.spec).toBe(join(root, 'specs/output.json'))
    expect(resolved.artifacts.optional).toBeUndefined()
  })

  it('registers output artifacts and lineage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumberjack-artifact-'))
    const worktree = join(root, 'worktrees', 'run-1')
    await mkdir(join(worktree, 'out'), { recursive: true })
    await writeFile(
      join(worktree, 'out', 'report.json'),
      '{"ok":true}',
      'utf-8'
    )

    const { store, artifacts, lineage } = createStore([
      {
        id: buildArtifactId('run-1', 'requirements', 'spec'),
        runId: 'run-1',
        nodeId: 'requirements',
        path: 'specs/output.json',
        hash: 'hash',
        createdAt: new Date().toISOString(),
      },
    ])

    const outputs: ArtifactDef[] = [
      { name: 'report', path: 'out/report.json', schema: { type: 'object' } },
    ]

    await registerOutputArtifacts({
      runId: 'run-1',
      nodeId: 'implementation',
      outputs,
      inputArtifacts: artifacts,
      projectRoot: root,
      worktreePath: worktree,
      store,
    })

    expect(artifacts.some((record) => record.nodeId === 'implementation')).toBe(
      true
    )
    expect(lineage).toEqual([
      {
        artifactId: buildArtifactId('run-1', 'implementation', 'report'),
        sourceArtifactId: buildArtifactId('run-1', 'requirements', 'spec'),
      },
    ])
  })
})

describe('Context payload', () => {
  it('builds summaries and applies overrides', () => {
    const payload = buildContextPayload(
      [
        { nodeId: 'n1', success: true, summary: 'done' },
        { nodeId: 'n2', success: false },
      ],
      [
        { key: 'note', value: 'custom' },
        { key: 'previousSummaries', value: null },
      ]
    )

    expect(payload.note).toBe('custom')
    expect(payload.previousSummaries).toBeUndefined()
  })
})
