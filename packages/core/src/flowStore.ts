import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  CURRENT_FLOW_SCHEMA_VERSION,
  type Flow,
  type FlowNode,
  type FlowLoadResult,
  type LocalOverrides,
  type ValidationIssue,
  type ValidationResult,
} from '@shared/types'
import { LumberjackError } from '@shared/errors'

const agentSchema = z
  .object({
    type: z.literal('stdio-json'),
    command: z.string().min(1),
    envAllowlist: z.array(z.string()).optional(),
  })
  .passthrough()

const artifactRefSchema = z
  .object({
    name: z.string().min(1),
    ref: z.string().min(1),
    required: z.boolean().optional(),
  })
  .passthrough()

const artifactDefSchema = z
  .object({
    name: z.string().min(1),
    path: z.string().min(1),
    schema: z.record(z.unknown()).optional(),
  })
  .passthrough()

const contextOverrideSchema = z
  .object({
    key: z.string().min(1),
    value: z.string().nullable(),
  })
  .passthrough()

const nodeDataSchema = z
  .object({
    label: z.string().min(1),
    agent: agentSchema.optional(),
    promptTemplate: z.string().optional(),
    inputArtifacts: z.array(artifactRefSchema).optional(),
    outputArtifacts: z.array(artifactDefSchema).optional(),
    contextOverrides: z.array(contextOverrideSchema).optional(),
  })
  .passthrough()

const nodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    position: z.object({ x: z.number(), y: z.number() }),
    data: nodeDataSchema,
  })
  .passthrough()

const edgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    type: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  })
  .passthrough()

const flowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    schemaVersion: z.number().int().nonnegative(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough()

const overridesSchema = z
  .object({
    flows: z
      .record(
        z.object({
          defaultTimeout: z.number().optional(),
          concurrencyLimit: z.number().optional(),
        })
      )
      .optional(),
    agents: z
      .record(
        z.object({
          args: z.array(z.string()).optional(),
          adapterCommand: z.string().optional(),
          envDenylist: z.array(z.string()).optional(),
          timeoutSec: z.number().optional(),
        })
      )
      .optional(),
    global: z
      .object({
        defaultTimeout: z.number().optional(),
        maxConcurrency: z.number().optional(),
      })
      .optional(),
  })
  .passthrough()

export interface FlowStoreOptions {
  projectRoot: string
}

export class FlowStore {
  private readonly flowsDir: string
  private readonly overridesPath: string

  constructor(options: FlowStoreOptions) {
    this.flowsDir = join(options.projectRoot, '.lumberjack', 'flows')
    this.overridesPath = join(
      options.projectRoot,
      '.lumberjack',
      'local',
      'overrides.json'
    )
  }

  async loadAll(): Promise<FlowLoadResult[]> {
    try {
      const files = await readdir(this.flowsDir)
      const results: FlowLoadResult[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const flowId = file.replace(/\.json$/, '')
        results.push(await this.load(flowId))
      }
      return results
    } catch (error) {
      if (isMissingPath(error)) {
        return []
      }
      throw error
    }
  }

  async load(flowId: string): Promise<FlowLoadResult> {
    const filePath = join(this.flowsDir, `${flowId}.json`)
    const raw = await readFile(filePath, 'utf-8')
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (error) {
      throw new LumberjackError(
        'FLOW_JSON_PARSE_FAILED',
        'Flow JSON parse failed',
        {
          flowId,
          reason: error instanceof Error ? error.message : String(error),
        }
      )
    }

    const normalized = normalizeFlow(json)
    const { flow, issues } = this.parseFlow(normalized)
    const readOnly = flow.schemaVersion > CURRENT_FLOW_SCHEMA_VERSION
    const { migrated, migratedFlow } = migrateSchema(flow)

    return {
      flow: migrated ? migratedFlow : flow,
      readOnly,
      migrated,
      errors: issues.length ? issues : undefined,
    }
  }

  async save(flow: Flow): Promise<void> {
    const validation = this.validateSchema(flow)
    if (!validation.ok) {
      throw new LumberjackError('FLOW_SCHEMA_INVALID', 'Flow schema invalid', {
        issues: validation.issues,
      })
    }
    const { migratedFlow } = migrateSchema(flow)
    await mkdir(this.flowsDir, { recursive: true })
    const filePath = join(this.flowsDir, `${flow.id}.json`)
    await writeFile(filePath, JSON.stringify(migratedFlow, null, 2), 'utf-8')
  }

  async delete(flowId: string): Promise<void> {
    const filePath = join(this.flowsDir, `${flowId}.json`)
    await rm(filePath)
  }

  validateSchema(json: unknown): ValidationResult {
    const result = flowSchema.safeParse(json)
    if (result.success) {
      return { ok: true, issues: [] }
    }
    return {
      ok: false,
      issues: result.error.issues.map(mapZodIssue),
    }
  }

  async loadOverrides(): Promise<LocalOverrides> {
    try {
      const raw = await readFile(this.overridesPath, 'utf-8')
      const json = JSON.parse(raw)
      const result = overridesSchema.safeParse(json)
      if (!result.success) {
        throw new LumberjackError(
          'OVERRIDES_SCHEMA_INVALID',
          'Overrides schema invalid',
          {
            issues: result.error.issues.map(mapZodIssue),
          }
        )
      }
      return result.data
    } catch (error) {
      if (isMissingPath(error)) {
        return {}
      }
      throw error
    }
  }

  async saveOverrides(overrides: LocalOverrides): Promise<void> {
    const validation = overridesSchema.safeParse(overrides)
    if (!validation.success) {
      throw new LumberjackError(
        'OVERRIDES_SCHEMA_INVALID',
        'Overrides schema invalid',
        { issues: validation.error.issues.map(mapZodIssue) }
      )
    }
    await mkdir(dirname(this.overridesPath), { recursive: true })
    await writeFile(
      this.overridesPath,
      JSON.stringify(overrides, null, 2),
      'utf-8'
    )
  }

  private parseFlow(json: unknown): { flow: Flow; issues: ValidationIssue[] } {
    const result = flowSchema.safeParse(json)
    if (result.success) {
      return { flow: result.data, issues: [] }
    }
    const issues = result.error.issues.map(mapZodIssue)
    throw new LumberjackError('FLOW_SCHEMA_INVALID', 'Flow schema invalid', {
      issues,
    })
  }
}

const migrateSchema = (
  flow: Flow
): { migrated: boolean; migratedFlow: Flow } => {
  if (flow.schemaVersion >= CURRENT_FLOW_SCHEMA_VERSION) {
    return { migrated: false, migratedFlow: flow }
  }
  const migratedFlow: Flow = {
    ...flow,
    schemaVersion: CURRENT_FLOW_SCHEMA_VERSION,
  }
  return { migrated: true, migratedFlow }
}

const normalizeFlow = (raw: unknown): unknown => {
  if (!raw || typeof raw !== 'object') return raw
  const flow = raw as Flow
  if (!Array.isArray(flow.nodes)) return raw
  const nodes = flow.nodes.map((node) => {
    if (!node || typeof node !== 'object') return node
    const data = (node as FlowNode).data
    if (!data || typeof data !== 'object') return node
    const inputArtifacts = Array.isArray(data.inputArtifacts)
      ? data.inputArtifacts.map((item) => {
          if (!item || typeof item !== 'object') return item
          const legacy = item as Record<string, unknown>
          const name = (legacy.name as string) ?? (legacy.id as string)
          const required =
            typeof legacy.required === 'boolean'
              ? legacy.required
              : typeof legacy.optional === 'boolean'
                ? !legacy.optional
                : undefined
          return {
            ...legacy,
            name,
            required,
          }
        })
      : data.inputArtifacts
    const outputArtifacts = Array.isArray(data.outputArtifacts)
      ? data.outputArtifacts.map((item) => {
          if (!item || typeof item !== 'object') return item
          const legacy = item as Record<string, unknown>
          const name = (legacy.name as string) ?? (legacy.id as string)
          return {
            ...legacy,
            name,
          }
        })
      : data.outputArtifacts
    const contextOverrides = Array.isArray(data.contextOverrides)
      ? data.contextOverrides.map((item) => {
          if (!item || typeof item !== 'object') return item
          const legacy = item as Record<string, unknown>
          const key = (legacy.key as string) ?? (legacy.source as string)
          const value =
            legacy.value === undefined ? null : (legacy.value as string | null)
          return {
            ...legacy,
            key,
            value,
          }
        })
      : data.contextOverrides
    return {
      ...node,
      data: {
        ...data,
        inputArtifacts,
        outputArtifacts,
        contextOverrides,
      },
    }
  })
  return { ...flow, nodes }
}

const mapZodIssue = (issue: z.ZodIssue): ValidationIssue => ({
  path: issue.path.join('.'),
  message: issue.message,
})

const isMissingPath = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === 'ENOENT'
  }
  return false
}

export const resolveOverrides = <T extends Record<string, unknown>>(
  defaults: T,
  globalOverride: Partial<T> | undefined,
  flowOverride: Partial<T> | undefined,
  agentOverride: Partial<T> | undefined
): T => ({
  ...defaults,
  ...(globalOverride ?? {}),
  ...(flowOverride ?? {}),
  ...(agentOverride ?? {}),
})
