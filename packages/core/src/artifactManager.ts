import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LumberjackError } from '@shared/errors'
import type {
  ArtifactDef,
  ArtifactRecord,
  ArtifactRef,
  ContextOverride,
  NodeResultSummary,
} from '@shared/types'
import {
  hashFile,
  resolveArtifactPath,
  toRelativeArtifactPath,
} from './stateDb'

export interface ArtifactStore {
  registerArtifact: (record: ArtifactRecord) => Promise<void>
  getArtifact: (artifactId: string) => Promise<ArtifactRecord | null>
  getArtifactsByNode: (
    runId: string,
    nodeId: string
  ) => Promise<ArtifactRecord[]>
  registerArtifactLineage: (
    artifactId: string,
    sourceArtifactId: string
  ) => Promise<void>
}

export const buildArtifactId = (runId: string, nodeId: string, name: string) =>
  `${runId}:${nodeId}:${name}`

export const resolveInputArtifacts = async ({
  runId,
  projectRoot,
  inputs,
  store,
}: {
  runId: string
  projectRoot: string
  inputs?: ArtifactRef[]
  store: ArtifactStore
}): Promise<{
  artifacts: Record<string, string>
  inputRecords: ArtifactRecord[]
}> => {
  const artifacts: Record<string, string> = {}
  const inputRecords: ArtifactRecord[] = []
  for (const input of inputs ?? []) {
    const parsed = parseArtifactRef(input.ref)
    const artifactId = buildArtifactId(runId, parsed.nodeId, parsed.name)
    const record = await store.getArtifact(artifactId)
    if (!record) {
      if (input.required === false) continue
      throw new LumberjackError(
        'ARTIFACT_NOT_FOUND',
        'Required input artifact missing',
        { ref: input.ref }
      )
    }
    const absolute = resolveArtifactPath(projectRoot, record.path)
    artifacts[input.name] = absolute
    inputRecords.push(record)
  }
  return { artifacts, inputRecords }
}

export const registerOutputArtifacts = async ({
  runId,
  nodeId,
  outputs,
  inputArtifacts,
  projectRoot,
  worktreePath,
  store,
}: {
  runId: string
  nodeId: string
  outputs?: ArtifactDef[]
  inputArtifacts: ArtifactRecord[]
  projectRoot: string
  worktreePath: string
  store: ArtifactStore
}): Promise<ArtifactRecord[]> => {
  const records: ArtifactRecord[] = []
  const lineageSources = [...inputArtifacts]
  for (const output of outputs ?? []) {
    if (!output.path) {
      throw new LumberjackError(
        'ARTIFACT_INVALID',
        'Output artifact path is required',
        { name: output.name }
      )
    }
    const absolutePath = join(worktreePath, output.path)
    try {
      await access(absolutePath)
    } catch {
      throw new LumberjackError(
        'ARTIFACT_NOT_FOUND',
        'Output artifact not found',
        { path: absolutePath }
      )
    }
    if (output.schema) {
      await validateArtifactSchema(absolutePath)
    }
    const relativePath = toRelativeArtifactPath(projectRoot, absolutePath)
    const record: ArtifactRecord = {
      id: buildArtifactId(runId, nodeId, output.name),
      runId,
      nodeId,
      path: relativePath,
      hash: await hashFile(absolutePath),
      meta: output.schema ? { schema: output.schema } : undefined,
      createdAt: new Date().toISOString(),
    }
    await store.registerArtifact(record)
    records.push(record)
    for (const input of lineageSources) {
      if (input.id === record.id) continue
      await store.registerArtifactLineage(record.id, input.id)
    }
  }
  return records
}

export const buildContextPayload = (
  previousResults: NodeResultSummary[] = [],
  overrides: ContextOverride[] = []
): Record<string, string> => {
  const payload: Record<string, string> = {}
  if (previousResults.length > 0) {
    payload.previousSummaries = previousResults
      .map((result) => {
        const summary =
          result.summary ?? (result.success ? 'completed' : 'failed')
        return `[${result.nodeId}] ${summary}`
      })
      .join('\\n')
  }
  for (const override of overrides) {
    if (override.value === null) {
      delete payload[override.key]
    } else {
      payload[override.key] = override.value
    }
  }
  return payload
}

const parseArtifactRef = (ref: string): { nodeId: string; name: string } => {
  const trimmed = ref.trim()
  if (!trimmed.startsWith('@node:')) {
    throw new LumberjackError(
      'ARTIFACT_REFERENCE_ERROR',
      'Invalid artifact reference',
      { ref: trimmed }
    )
  }
  const body = trimmed.slice('@node:'.length)
  const segments = body.split('.')
  if (segments.length >= 3 && segments[1] === 'output') {
    return { nodeId: segments[0] ?? '', name: segments.slice(2).join('.') }
  }
  if (segments.length >= 2) {
    return { nodeId: segments[0] ?? '', name: segments.slice(1).join('.') }
  }
  throw new LumberjackError(
    'ARTIFACT_REFERENCE_ERROR',
    'Invalid artifact reference',
    { ref: trimmed }
  )
}

const validateArtifactSchema = async (path: string): Promise<void> => {
  try {
    const raw = await readFile(path, 'utf-8')
    JSON.parse(raw)
  } catch (error) {
    throw new LumberjackError(
      'ARTIFACT_INVALID',
      'Artifact schema validation failed',
      { reason: error instanceof Error ? error.message : String(error) }
    )
  }
}
