import { LumberjackError } from '@shared/errors'
import { spawn } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import type {
  FlowLoadResult,
  NodeStateRecord,
  RunRecord,
  SessionState,
} from '@shared/types'

export interface SessionStore {
  loadLastSession: () => Promise<SessionState | null>
  saveSession?: (state: SessionState) => Promise<void>
}

export interface StartupRecoveryDeps {
  projectRoot: string
  stateDb: {
    open: (dbPath: string) => Promise<void>
    listRuns: () => Promise<RunRecord[]>
    updateRunState: (runId: string, state: RunRecord['state']) => Promise<void>
    listNodeStates: (runId: string) => Promise<NodeStateRecord[]>
    updateNodeState: (record: NodeStateRecord) => Promise<void>
  }
  flowStore: {
    loadAll: () => Promise<FlowLoadResult[]>
  }
  worktreeManager: {
    reconcileWithDb: () => Promise<{
      missing: string[]
      discovered: string[]
      unchanged: string[]
    }>
  }
  sessionStore?: SessionStore
  dbPathResolver?: (projectRoot: string) => Promise<string>
}

export class StartupRecovery {
  private readonly projectRoot: string
  private readonly stateDb: StartupRecoveryDeps['stateDb']
  private readonly flowStore: StartupRecoveryDeps['flowStore']
  private readonly worktreeManager: StartupRecoveryDeps['worktreeManager']
  private readonly sessionStore?: SessionStore
  private readonly dbPathResolver: (projectRoot: string) => Promise<string>

  constructor(deps: StartupRecoveryDeps) {
    this.projectRoot = deps.projectRoot
    this.stateDb = deps.stateDb
    this.flowStore = deps.flowStore
    this.worktreeManager = deps.worktreeManager
    this.sessionStore = deps.sessionStore
    this.dbPathResolver = deps.dbPathResolver ?? resolveStateDbPath
  }

  async recover(): Promise<{
    flows: FlowLoadResult[]
    worktrees: { missing: string[]; discovered: string[]; unchanged: string[] }
    interruptedRuns: string[]
    lastSession: SessionState | null
  }> {
    const dbPath = await this.dbPathResolver(this.projectRoot)
    await this.stateDb.open(dbPath)

    const flows = await this.flowStore.loadAll()
    const worktrees = await this.worktreeManager.reconcileWithDb()

    const interruptedRuns: string[] = []
    const runs = await this.stateDb.listRuns()
    for (const run of runs) {
      if (run.state !== 'running') continue
      await this.stateDb.updateRunState(run.id, 'interrupted')
      interruptedRuns.push(run.id)
      const nodeStates = await this.stateDb.listNodeStates(run.id)
      for (const record of nodeStates) {
        if (record.state !== 'running') continue
        await this.stateDb.updateNodeState({
          ...record,
          state: 'interrupted',
          updatedAt: new Date().toISOString(),
        })
      }
    }

    const lastSession = this.sessionStore
      ? await this.sessionStore.loadLastSession()
      : null

    return { flows, worktrees, interruptedRuns, lastSession }
  }
}

export const resolveStateDbPath = async (
  projectRoot: string
): Promise<string> => {
  const result = await runGit(['rev-parse', '--git-common-dir'], projectRoot)
  if (result.exitCode !== 0) {
    throw new LumberjackError(
      'STATE_DB_PATH_UNRESOLVED',
      'Failed to resolve git common dir',
      { stderr: result.stderr }
    )
  }
  const raw = result.stdout.trim()
  if (!raw) {
    throw new LumberjackError(
      'STATE_DB_PATH_UNRESOLVED',
      'Git common dir is empty'
    )
  }
  const commonDir = isAbsolute(raw) ? raw : join(projectRoot, raw)
  return join(commonDir, 'lumberjack', 'state.db')
}

const runGit = (
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
  })
