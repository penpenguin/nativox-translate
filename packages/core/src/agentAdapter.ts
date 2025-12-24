import { LumberjackError } from '@shared/errors'
import type { NodeResultSummary } from '@shared/types'
import { minimatch } from 'minimatch'
import { ProcessManager, type SpawnOptions } from './processManager'

export interface TaskConstraints {
  allowedCommands?: string[]
  maxTimeout?: number
}

export interface ExecutionContext {
  runId: string
  nodeId: string
  flowId: string
  worktreePath: string
  branchName: string
  baseBranch: string
  defaultBranch: string
  repositoryUrl?: string
  constraints?: TaskConstraints
  previousNodeResults?: NodeResultSummary[]
}

export interface TaskInput {
  goal: string
  promptTemplate?: string
  artifacts?: Record<string, string>
  constraints?: TaskConstraints
}

export interface ResolvedAgentConfig {
  type: 'stdio-json'
  command: string
  args?: string[]
  adapterCommand?: string
  envAllowlist?: string[]
  envDenylist?: string[]
  timeoutSec?: number
}

export interface AgentTask {
  taskId: string
  nodeId: string
  runId: string
  config: ResolvedAgentConfig
  input: TaskInput
  context: ExecutionContext
}

export interface AgentResult {
  success: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  resultBlock?: unknown
}

export interface AgentProcess {
  write: (input: string | Buffer) => void
  end: () => void
  getStdout: () => string
  getStderr: () => string
  exit: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
  cancel: () => Promise<void>
}

export interface AgentProcessSpawnOptions {
  command: string
  args: string[]
  cwd?: string
  env: NodeJS.ProcessEnv
  timeoutMs?: number
  runId?: string
  nodeId?: string
}

export interface AgentProcessSpawner {
  spawn: (options: AgentProcessSpawnOptions) => Promise<AgentProcess>
}

type AgentTaskJson = {
  taskId: string
  goal: string
  promptTemplate?: string
  artifacts: Record<string, string>
  repo: {
    worktreePath: string
    baseBranch: string
    branch: string
    defaultBranch: string
    repositoryUrl?: string
  }
  context: {
    runId: string
    nodeId: string
    flowId: string
    previousResults?: NodeResultSummary[]
  }
  constraints?: TaskConstraints
}

const SAFE_ENV_PATTERNS = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'TERM',
  'TMPDIR',
]

const DEFAULT_ENV_DENYLIST = ['AWS_*', 'GITHUB_TOKEN', 'OPENAI_API_KEY']

const REDACTION_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /Authorization:\\s*Bearer\\s+[A-Za-z0-9._-]+/gi,
  /Authorization:\\s*[A-Za-z0-9._-]+/gi,
]

const buildTaskJson = (task: AgentTask): AgentTaskJson => {
  const constraints = task.context.constraints ?? task.input.constraints
  return {
    taskId: task.taskId,
    goal: task.input.goal,
    promptTemplate: task.input.promptTemplate,
    artifacts: task.input.artifacts ?? {},
    repo: {
      worktreePath: task.context.worktreePath,
      baseBranch: task.context.baseBranch,
      branch: task.context.branchName,
      defaultBranch: task.context.defaultBranch,
      repositoryUrl: task.context.repositoryUrl,
    },
    context: {
      runId: task.runId,
      nodeId: task.nodeId,
      flowId: task.context.flowId,
      previousResults: task.context.previousNodeResults,
    },
    constraints,
  }
}

const redactString = (value: string): string =>
  REDACTION_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[REDACTED]'),
    value
  )

const redactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactValue(entry)])
    )
  }
  return value
}

const resolveEnv = (
  source: NodeJS.ProcessEnv,
  allowlist: string[],
  denylist: string[]
): NodeJS.ProcessEnv => {
  const allowed = new Set<string>()
  for (const key of Object.keys(source)) {
    if (SAFE_ENV_PATTERNS.includes(key)) {
      allowed.add(key)
      continue
    }
    if (key.startsWith('LC_') || key.startsWith('XDG_')) {
      allowed.add(key)
    }
  }

  for (const key of Object.keys(source)) {
    if (
      allowlist.some((pattern) =>
        minimatch(key, pattern, { nocase: false, dot: true })
      )
    ) {
      allowed.add(key)
    }
  }

  const denied = new Set<string>()
  for (const key of Object.keys(source)) {
    if (
      denylist.some((pattern) =>
        minimatch(key, pattern, { nocase: false, dot: true })
      )
    ) {
      denied.add(key)
    }
  }

  const env: NodeJS.ProcessEnv = {}
  for (const key of allowed) {
    if (denied.has(key)) continue
    const value = source[key]
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

const parseResultBlock = (stdout: string): unknown | undefined => {
  const startMarker = '===RESULT==='
  const endMarker = '===END==='
  const start = stdout.indexOf(startMarker)
  if (start === -1) return undefined
  const end = stdout.indexOf(endMarker, start + startMarker.length)
  if (end === -1) return undefined
  const jsonText = stdout.slice(start + startMarker.length, end).trim()
  if (!jsonText) return undefined
  try {
    return JSON.parse(jsonText)
  } catch (error) {
    throw new LumberjackError(
      'AGENT_RESULT_PARSE_ERROR',
      'Failed to parse agent result block',
      {
        reason: error instanceof Error ? error.message : String(error),
      }
    )
  }
}

const createDefaultSpawner = (projectRoot: string): AgentProcessSpawner => {
  const manager = new ProcessManager({ projectRoot })
  return {
    spawn: async (options) => {
      const spawnOptions: SpawnOptions = {
        command: options.command,
        args: options.args,
        cwd: options.cwd,
        env: options.env,
        timeoutMs: options.timeoutMs,
        runId: options.runId,
        nodeId: options.nodeId,
      }
      return manager.spawnProcess(spawnOptions)
    },
  }
}

export class AgentAdapter {
  private readonly spawner: AgentProcessSpawner
  private readonly envSource: NodeJS.ProcessEnv
  private readonly running = new Map<string, AgentProcess>()

  constructor({
    spawner,
    envSource,
    projectRoot,
  }: {
    spawner?: AgentProcessSpawner
    envSource?: NodeJS.ProcessEnv
    projectRoot?: string
  } = {}) {
    this.envSource = envSource ?? process.env
    this.spawner = spawner ?? createDefaultSpawner(projectRoot ?? process.cwd())
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const config = task.config
    const command = config.adapterCommand ?? config.command
    const args = config.args ?? []
    const denylist = [...DEFAULT_ENV_DENYLIST, ...(config.envDenylist ?? [])]
    const allowlist = config.envAllowlist ?? []
    const env = resolveEnv(this.envSource, allowlist, denylist)
    const payload = redactValue(buildTaskJson(task)) as AgentTaskJson

    const timeoutMs =
      typeof config.timeoutSec === 'number' && config.timeoutSec > 0
        ? config.timeoutSec * 1000
        : undefined

    const process = await this.spawner.spawn({
      command,
      args,
      cwd: task.context.worktreePath,
      env,
      timeoutMs,
      runId: task.runId,
      nodeId: task.nodeId,
    })

    this.running.set(task.taskId, process)
    try {
      process.write(`${JSON.stringify(payload)}\\n`)
      process.end()

      const exitResult = await this.waitForExit(process, timeoutMs)
      const rawStdout = process.getStdout()
      const rawStderr = process.getStderr()
      const resultBlock = parseResultBlock(rawStdout)
      return {
        success: exitResult.exitCode === 0,
        exitCode: exitResult.exitCode,
        stdout: redactString(rawStdout),
        stderr: redactString(rawStderr),
        resultBlock: resultBlock ? redactValue(resultBlock) : undefined,
      }
    } finally {
      this.running.delete(task.taskId)
    }
  }

  async cancel(taskId: string): Promise<void> {
    const process = this.running.get(taskId)
    if (!process) return
    await process.cancel()
  }

  private async waitForExit(
    process: AgentProcess,
    timeoutMs?: number
  ): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }> {
    if (!timeoutMs) {
      return process.exit
    }
    let timeoutHandle: NodeJS.Timeout | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        void process.cancel()
        reject(
          new LumberjackError('AGENT_TIMEOUT', 'Agent execution timed out', {
            timeoutMs,
          })
        )
      }, timeoutMs)
    })
    try {
      return await Promise.race([process.exit, timeoutPromise])
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }
  }
}
