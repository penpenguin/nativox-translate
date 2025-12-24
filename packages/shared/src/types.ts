export const CURRENT_FLOW_SCHEMA_VERSION = 1

export interface FlowMeta {
  createdAt?: string
  updatedAt?: string
  baseBranch?: string
  branchPrefix?: string
  concurrencyLimit?: number
  [key: `x-${string}`]: unknown
}

export interface Flow {
  id: string
  name: string
  schemaVersion: number
  nodes: FlowNode[]
  edges: FlowEdge[]
  meta?: FlowMeta
  [key: `x-${string}`]: unknown
}

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: NodeData
  [key: `x-${string}`]: unknown
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  data?: Record<string, unknown>
  [key: `x-${string}`]: unknown
}

export interface NodeData {
  label: string
  agent?: AgentConfig
  promptTemplate?: string
  inputArtifacts?: ArtifactRef[]
  outputArtifacts?: ArtifactDef[]
  contextOverrides?: ContextOverride[]
  [key: `x-${string}`]: unknown
}

export interface AgentConfig {
  type: 'stdio-json'
  command: string
  envAllowlist?: string[]
}

export interface ArtifactRef {
  name: string
  ref: string
  required?: boolean
}

export interface ArtifactDef {
  name: string
  path: string
  schema?: Record<string, unknown>
}

export interface ContextOverride {
  key: string
  value: string | null
}

export interface ValidationIssue {
  path: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export interface FlowLoadResult {
  flow: Flow
  readOnly: boolean
  migrated: boolean
  errors?: ValidationIssue[]
}

export interface LocalOverrides {
  flows?: Record<
    string,
    {
      defaultTimeout?: number
      concurrencyLimit?: number
    }
  >
  agents?: Record<
    string,
    {
      args?: string[]
      adapterCommand?: string
      envDenylist?: string[]
      timeoutSec?: number
    }
  >
  global?: {
    defaultTimeout?: number
    maxConcurrency?: number
  }
}

export type RunState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export type NodeExecutionState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'interrupted'
  | 'timed_out'

export type WorktreeStatus =
  | 'active'
  | 'merged'
  | 'abandoned'
  | 'missing'
  | 'discovered'

export interface RunRecord {
  id: string
  flowId: string
  worktreeId: string
  state: RunState
  createdAt: string
  updatedAt: string
}

export interface NodeStateRecord {
  runId: string
  nodeId: string
  state: NodeExecutionState
  updatedAt: string
  meta?: Record<string, unknown>
}

export interface WorktreeRecord {
  id: string
  path: string
  branch: string
  baseBranch?: string
  runId?: string
  status: WorktreeStatus
  createdAt: string
  updatedAt: string
}

export interface MergeResult {
  worktreeId: string
  branch: string
  baseBranch: string
}

export interface ArtifactRecord {
  id: string
  runId: string
  nodeId: string
  path: string
  hash?: string
  meta?: Record<string, unknown>
  createdAt: string
}

export interface NodeResultSummary {
  nodeId: string
  success: boolean
  summary?: string
}

export interface EventRecord {
  id: number
  runId?: string
  nodeId?: string
  type: string
  payload?: Record<string, unknown>
  createdAt: string
}

export interface ApprovedCommandRecord {
  id: string
  commandPath: string
  argsPattern: string[]
  hash: string
  approvedAt: string
  lastSeenAt: string
}

export interface PendingApproval {
  id: string
  commandPath: string
  args: string[]
  reason: string
}

export interface SessionState {
  projectRoot?: string
  flowId?: string
}

export interface LockResult {
  acquired: boolean
  stale: boolean
  owner?: {
    pid: number
    createdAt: string
    heartbeatAt: string
  }
}
