import { randomUUID, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { LumberjackError } from '@shared/errors'
import type {
  EventRecord,
  MergeResult,
  WorktreeRecord,
  WorktreeStatus,
} from '@shared/types'

export type GitRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export interface GitRunner {
  run: (args: string[], options: { cwd: string }) => Promise<GitRunResult>
}

export interface WorktreeStateStore {
  createWorktree: (record: WorktreeRecord) => Promise<void>
  getWorktree: (worktreeId: string) => Promise<WorktreeRecord | null>
  updateWorktreeStatus: (
    worktreeId: string,
    status: WorktreeStatus
  ) => Promise<void>
  listWorktrees: () => Promise<WorktreeRecord[]>
  recordEvent: (event: Omit<EventRecord, 'id'>) => Promise<void>
}

export interface WorktreeInfo {
  id: string
  path: string
  branch: string
  baseBranch: string
  runId: string
}

const DEFAULT_BRANCH_PREFIX = 'run'

const defaultRandomSuffix = () => randomBytes(3).toString('hex')

const createGitRunner = (): GitRunner => ({
  run: (args, options) =>
    new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: options.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        })
      })
    }),
})

const normalizeBranchRef = (ref: string): string => {
  const trimmed = ref.trim()
  const originPrefix = 'refs/remotes/origin/'
  if (trimmed.startsWith(originPrefix)) {
    return trimmed.slice(originPrefix.length)
  }
  const headsPrefix = 'refs/heads/'
  if (trimmed.startsWith(headsPrefix)) {
    return trimmed.slice(headsPrefix.length)
  }
  return trimmed
}

type WorktreeListing = {
  path: string
  branch?: string
}

const normalizeWorktreePath = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value

const parseWorktreeList = (output: string): WorktreeListing[] => {
  const entries: WorktreeListing[] = []
  let current: WorktreeListing | null = null
  const flush = () => {
    if (current?.path) entries.push(current)
    current = null
  }
  for (const line of output.split('\n')) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) {
      flush()
      current = { path: line.slice('worktree '.length).trim() }
      continue
    }
    if (line.startsWith('branch ') && current) {
      const ref = line.slice('branch '.length).trim()
      current.branch = normalizeBranchRef(ref)
    }
  }
  flush()
  return entries
    .filter((entry) => entry.path)
    .map((entry) => ({
      ...entry,
      path: normalizeWorktreePath(entry.path),
    }))
}

export class WorktreeManager {
  private readonly projectRoot: string
  private readonly stateDb: WorktreeStateStore
  private readonly git: GitRunner
  private readonly now: () => Date
  private readonly randomSuffix: () => string

  constructor({
    projectRoot,
    stateDb,
    git,
    now,
    randomSuffix,
  }: {
    projectRoot: string
    stateDb: WorktreeStateStore
    git?: GitRunner
    now?: () => Date
    randomSuffix?: () => string
  }) {
    this.projectRoot = projectRoot
    this.stateDb = stateDb
    this.git = git ?? createGitRunner()
    this.now = now ?? (() => new Date())
    this.randomSuffix = randomSuffix ?? defaultRandomSuffix
  }

  async getDefaultBranch(): Promise<string> {
    const symbolic = await this.git.run(
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { cwd: this.projectRoot }
    )
    if (symbolic.exitCode === 0) {
      const ref = symbolic.stdout.trim()
      if (ref) return normalizeBranchRef(ref)
    }

    const main = await this.git.run(
      ['show-ref', '--verify', '--quiet', 'refs/heads/main'],
      { cwd: this.projectRoot }
    )
    if (main.exitCode === 0) return 'main'

    const master = await this.git.run(
      ['show-ref', '--verify', '--quiet', 'refs/heads/master'],
      { cwd: this.projectRoot }
    )
    if (master.exitCode === 0) return 'master'

    throw new LumberjackError(
      'DEFAULT_BRANCH_NOT_FOUND',
      'Default branch not found'
    )
  }

  async create(runId: string, baseBranch?: string): Promise<WorktreeInfo> {
    const resolvedBase = baseBranch ?? (await this.getDefaultBranch())
    const { branch, suffix } = await this.generateBranch(runId)
    const worktreePath = join(
      this.projectRoot,
      '.lumberjack',
      'worktrees',
      `${runId}-${suffix}`
    )
    const result = await this.git.run(
      ['worktree', 'add', '-b', branch, worktreePath, resolvedBase],
      { cwd: this.projectRoot }
    )
    if (result.exitCode !== 0) {
      throw new LumberjackError(
        'WORKTREE_CREATE_FAILED',
        'Failed to add worktree',
        {
          stderr: result.stderr,
        }
      )
    }

    const now = this.now().toISOString()
    const record: WorktreeRecord = {
      id: randomUUID(),
      path: worktreePath,
      branch,
      baseBranch: resolvedBase,
      runId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    await this.stateDb.createWorktree(record)
    return {
      id: record.id,
      path: record.path,
      branch: record.branch,
      baseBranch: resolvedBase,
      runId,
    }
  }

  async list(): Promise<WorktreeRecord[]> {
    const result = await this.git.run(['worktree', 'list', '--porcelain'], {
      cwd: this.projectRoot,
    })
    if (result.exitCode !== 0) {
      throw new LumberjackError(
        'WORKTREE_LIST_FAILED',
        'Failed to list worktrees'
      )
    }
    const paths = new Set(
      parseWorktreeList(result.stdout).map((entry) => entry.path)
    )
    const stored = await this.stateDb.listWorktrees()
    return stored.filter((record) => paths.has(record.path))
  }

  async remove(worktreeId: string): Promise<void> {
    const record = await this.stateDb.getWorktree(worktreeId)
    if (!record) {
      throw new LumberjackError('WORKTREE_NOT_FOUND', 'Worktree not found', {
        worktreeId,
      })
    }
    const result = await this.git.run(['worktree', 'remove', record.path], {
      cwd: this.projectRoot,
    })
    if (result.exitCode !== 0) {
      throw new LumberjackError(
        'WORKTREE_REMOVE_FAILED',
        'Failed to remove worktree',
        {
          stderr: result.stderr,
        }
      )
    }
    await this.stateDb.updateWorktreeStatus(worktreeId, 'abandoned')
  }

  async merge(worktreeId: string): Promise<MergeResult> {
    const record = await this.stateDb.getWorktree(worktreeId)
    if (!record) {
      throw new LumberjackError('WORKTREE_NOT_FOUND', 'Worktree not found', {
        worktreeId,
      })
    }
    const baseBranch = record.baseBranch ?? (await this.getDefaultBranch())
    const checkout = await this.git.run(['checkout', baseBranch], {
      cwd: this.projectRoot,
    })
    if (checkout.exitCode !== 0) {
      throw new LumberjackError(
        'WORKTREE_MERGE_FAILED',
        'Failed to checkout base branch',
        {
          stderr: checkout.stderr,
        }
      )
    }
    const merge = await this.git.run(
      ['merge', '--no-ff', '--no-edit', record.branch],
      { cwd: this.projectRoot }
    )
    if (merge.exitCode !== 0) {
      await this.stateDb.recordEvent({
        runId: record.runId,
        nodeId: undefined,
        type: 'worktree_merge_failed',
        payload: {
          worktreeId,
          branch: record.branch,
          baseBranch,
          stderr: merge.stderr,
        },
        createdAt: this.now().toISOString(),
      })
      throw new LumberjackError('WORKTREE_MERGE_CONFLICT', 'Merge failed', {
        stderr: merge.stderr,
      })
    }
    await this.stateDb.updateWorktreeStatus(worktreeId, 'merged')
    await this.stateDb.recordEvent({
      runId: record.runId,
      nodeId: undefined,
      type: 'worktree_merged',
      payload: {
        worktreeId,
        branch: record.branch,
        baseBranch,
      },
      createdAt: this.now().toISOString(),
    })
    return { worktreeId, branch: record.branch, baseBranch }
  }

  async reconcileWithDb(): Promise<{
    missing: string[]
    discovered: string[]
    unchanged: string[]
  }> {
    const result = await this.git.run(['worktree', 'list', '--porcelain'], {
      cwd: this.projectRoot,
    })
    if (result.exitCode !== 0) {
      throw new LumberjackError(
        'WORKTREE_LIST_FAILED',
        'Failed to list worktrees'
      )
    }
    const entries = parseWorktreeList(result.stdout).filter(
      (entry) => entry.path !== normalizeWorktreePath(this.projectRoot)
    )
    const stored = await this.stateDb.listWorktrees()
    const storedByPath = new Map(
      stored.map((record) => [normalizeWorktreePath(record.path), record])
    )
    const entryPaths = new Set(entries.map((entry) => entry.path))
    // console.log({ projectRoot: this.projectRoot, entries, stored })

    const missing: string[] = []
    const unchanged: string[] = []
    for (const record of stored) {
      const normalizedPath = normalizeWorktreePath(record.path)
      if (entryPaths.has(normalizedPath)) {
        unchanged.push(record.id)
      } else {
        missing.push(record.id)
        await this.stateDb.updateWorktreeStatus(record.id, 'missing')
      }
    }

    const discovered: string[] = []
    for (const entry of entries) {
      if (storedByPath.has(entry.path)) continue
      const now = this.now().toISOString()
      const record: WorktreeRecord = {
        id: randomUUID(),
        path: entry.path,
        branch: entry.branch ?? 'unknown',
        status: 'discovered',
        createdAt: now,
        updatedAt: now,
      }
      await this.stateDb.createWorktree(record)
      discovered.push(record.id)
    }

    return { missing, discovered, unchanged }
  }

  private async generateBranch(runId: string): Promise<{
    branch: string
    suffix: string
  }> {
    let attempt = 0
    while (attempt < 10) {
      const suffix = this.randomSuffix()
      const branch = `${DEFAULT_BRANCH_PREFIX}/${runId}-${suffix}`
      const exists = await this.branchExists(branch)
      if (!exists) {
        return { branch, suffix }
      }
      attempt += 1
    }
    throw new LumberjackError(
      'WORKTREE_BRANCH_COLLISION',
      'Failed to generate unique branch name',
      { runId }
    )
  }

  private async branchExists(branch: string): Promise<boolean> {
    const result = await this.git.run(
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      { cwd: this.projectRoot }
    )
    return result.exitCode === 0
  }
}
