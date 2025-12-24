import type {
  Flow,
  FlowLoadResult,
  MergeResult,
  PendingApproval,
  SessionState,
  RunRecord,
  WorktreeRecord,
} from './types'
import type { StructuredError } from './errors'

export const IPC_CHANNELS = {
  flowsList: 'lumberjack:flows:list',
  flowsGet: 'lumberjack:flows:get',
  flowsSave: 'lumberjack:flows:save',
  flowsDelete: 'lumberjack:flows:delete',
  runsCreate: 'lumberjack:runs:create',
  runsGet: 'lumberjack:runs:get',
  runsList: 'lumberjack:runs:list',
  worktreesGet: 'lumberjack:worktrees:get',
  worktreesList: 'lumberjack:worktrees:list',
  worktreesMerge: 'lumberjack:worktrees:merge',
  worktreesRemove: 'lumberjack:worktrees:remove',
  statusGet: 'lumberjack:status:get',
  migrationsGet: 'lumberjack:migrations:get',
  events: 'lumberjack:events',
  eventsEmit: 'lumberjack:events:emit',
  approvalsList: 'lumberjack:approvals:list',
  approvalsApprove: 'lumberjack:approvals:approve',
  approvalsReject: 'lumberjack:approvals:reject',
  sessionGet: 'lumberjack:session:get',
  sessionSave: 'lumberjack:session:save',
} as const

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: StructuredError }

export interface AppStatus {
  appVersion: string
  platform: string
  pid: number
  startedAt: string
}

export interface MigrationStatus {
  schemaVersion: number
  applied: number[]
  error?: StructuredError
}

export type LumberjackEvent = {
  type: string
  payload?: Record<string, unknown>
}

export interface LumberjackIpcApi {
  flows: {
    list: () => Promise<IpcResult<FlowLoadResult[]>>
    get: (flowId: string) => Promise<IpcResult<FlowLoadResult>>
    save: (flow: Flow) => Promise<IpcResult<void>>
    delete: (flowId: string) => Promise<IpcResult<void>>
  }
  runs: {
    create: (
      flowId: string,
      worktreeId: string
    ) => Promise<IpcResult<RunRecord>>
    get: (runId: string) => Promise<IpcResult<RunRecord | null>>
    list: (flowId?: string) => Promise<IpcResult<RunRecord[]>>
  }
  worktrees: {
    get: (worktreeId: string) => Promise<IpcResult<WorktreeRecord | null>>
    list: () => Promise<IpcResult<WorktreeRecord[]>>
    merge: (worktreeId: string) => Promise<IpcResult<MergeResult>>
    remove: (worktreeId: string) => Promise<IpcResult<void>>
  }
  status: {
    get: () => Promise<IpcResult<AppStatus>>
  }
  migrations: {
    get: () => Promise<IpcResult<MigrationStatus>>
  }
  events: {
    subscribe: (handler: (event: LumberjackEvent) => void) => () => void
  }
  approval: {
    list: () => Promise<IpcResult<PendingApproval[]>>
    approve: (approvalId: string) => Promise<IpcResult<void>>
    reject: (approvalId: string) => Promise<IpcResult<void>>
  }
  session: {
    get: () => Promise<IpcResult<SessionState | null>>
    save: (flowId: string | null) => Promise<IpcResult<void>>
  }
}
