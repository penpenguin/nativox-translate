import { describe, expect, it } from 'vitest'
import {
  WorktreeManager,
  type GitRunner,
  type GitRunResult,
  type WorktreeStateStore,
} from './worktreeManager'
import type { WorktreeRecord, WorktreeStatus, EventRecord } from '@shared/types'
import { LumberjackError } from '@shared/errors'

const createFakeGitRunner = (expectations: GitExpectation[]): GitRunner => {
  const queue = [...expectations]
  return {
    run: async (args, options) => {
      const next = queue.shift()
      if (!next) {
        throw new Error(`Unexpected git call: ${args.join(' ')}`)
      }
      expect(args).toEqual(next.args)
      if (next.cwd) {
        expect(options.cwd).toBe(next.cwd)
      }
      return next.result
    },
  }
}

type GitExpectation = {
  args: string[]
  cwd?: string
  result: GitRunResult
}

type Captured = {
  created: WorktreeRecord[]
  updates: Array<{ id: string; status: WorktreeStatus }>
  events: Array<Omit<EventRecord, 'id'>>
}

const createStateStore = (records: WorktreeRecord[] = []) => {
  const captured: Captured = { created: [], updates: [], events: [] }
  const store: WorktreeStateStore = {
    createWorktree: async (record) => {
      captured.created.push(record)
      records.push(record)
    },
    getWorktree: async (worktreeId) =>
      records.find((record) => record.id === worktreeId) ?? null,
    updateWorktreeStatus: async (worktreeId, status) => {
      captured.updates.push({ id: worktreeId, status })
    },
    listWorktrees: async () => records,
    recordEvent: async (event) => {
      captured.events.push(event)
    },
  }
  return { store, captured, records }
}

const ok = (stdout = ''): GitRunResult => ({
  stdout,
  stderr: '',
  exitCode: 0,
})

const fail = (stderr = 'error'): GitRunResult => ({
  stdout: '',
  stderr,
  exitCode: 1,
})

const fixedNow = () => new Date('2024-01-01T00:00:00.000Z')

const createManager = ({
  git,
  store,
  projectRoot = '/repo',
  suffixes = ['sfx'],
}: {
  git: GitRunner
  store: WorktreeStateStore
  projectRoot?: string
  suffixes?: string[]
}) => {
  let index = 0
  return new WorktreeManager({
    projectRoot,
    stateDb: store,
    git,
    now: fixedNow,
    randomSuffix: () => {
      const value = suffixes[index] ?? suffixes[suffixes.length - 1] ?? 'sfx'
      index += 1
      return value
    },
  })
}

describe('WorktreeManager.getDefaultBranch', () => {
  it('uses origin/HEAD when available', async () => {
    const git = createFakeGitRunner([
      {
        args: ['symbolic-ref', 'refs/remotes/origin/HEAD'],
        result: ok('refs/remotes/origin/main\n'),
      },
    ])
    const { store } = createStateStore()
    const manager = createManager({ git, store })

    await expect(manager.getDefaultBranch()).resolves.toBe('main')
  })

  it('preserves branch names with slashes from origin/HEAD', async () => {
    const git = createFakeGitRunner([
      {
        args: ['symbolic-ref', 'refs/remotes/origin/HEAD'],
        result: ok('refs/remotes/origin/release/v1\n'),
      },
    ])
    const { store } = createStateStore()
    const manager = createManager({ git, store })

    await expect(manager.getDefaultBranch()).resolves.toBe('release/v1')
  })

  it('falls back to main when origin/HEAD is missing', async () => {
    const git = createFakeGitRunner([
      {
        args: ['symbolic-ref', 'refs/remotes/origin/HEAD'],
        result: fail('no origin'),
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/main'],
        result: ok(),
      },
    ])
    const { store } = createStateStore()
    const manager = createManager({ git, store })

    await expect(manager.getDefaultBranch()).resolves.toBe('main')
  })

  it('throws when no default branch can be found', async () => {
    const git = createFakeGitRunner([
      {
        args: ['symbolic-ref', 'refs/remotes/origin/HEAD'],
        result: fail('no origin'),
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/main'],
        result: fail('missing'),
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/master'],
        result: fail('missing'),
      },
    ])
    const { store } = createStateStore()
    const manager = createManager({ git, store })

    await expect(manager.getDefaultBranch()).rejects.toEqual(
      expect.objectContaining({ code: 'DEFAULT_BRANCH_NOT_FOUND' })
    )
  })
})

describe('WorktreeManager.create', () => {
  it('creates a worktree with a unique branch and records it', async () => {
    const git = createFakeGitRunner([
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/run/run-1-sfx'],
        result: fail(),
      },
      {
        args: [
          'worktree',
          'add',
          '-b',
          'run/run-1-sfx',
          '/repo/.lumberjack/worktrees/run-1-sfx',
          'main',
        ],
        result: ok(),
      },
    ])
    const { store, captured } = createStateStore()
    const manager = createManager({ git, store })

    const info = await manager.create('run-1', 'main')

    expect(info.branch).toBe('run/run-1-sfx')
    expect(info.baseBranch).toBe('main')
    expect(info.runId).toBe('run-1')
    expect(info.path).toBe('/repo/.lumberjack/worktrees/run-1-sfx')
    expect(captured.created[0]).toEqual(
      expect.objectContaining({
        branch: 'run/run-1-sfx',
        path: '/repo/.lumberjack/worktrees/run-1-sfx',
        baseBranch: 'main',
        runId: 'run-1',
        status: 'active',
      })
    )
  })

  it('regenerates branch names when collisions occur', async () => {
    const git = createFakeGitRunner([
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/run/run-2-sfx1'],
        result: ok(),
      },
      {
        args: ['show-ref', '--verify', '--quiet', 'refs/heads/run/run-2-sfx2'],
        result: fail(),
      },
      {
        args: [
          'worktree',
          'add',
          '-b',
          'run/run-2-sfx2',
          '/repo/.lumberjack/worktrees/run-2-sfx2',
          'main',
        ],
        result: ok(),
      },
    ])
    const { store } = createStateStore()
    const manager = createManager({
      git,
      store,
      suffixes: ['sfx1', 'sfx2'],
    })

    const info = await manager.create('run-2', 'main')

    expect(info.branch).toBe('run/run-2-sfx2')
  })
})

describe('WorktreeManager.list', () => {
  it('lists only worktrees that are present in git output', async () => {
    const git = createFakeGitRunner([
      {
        args: ['worktree', 'list', '--porcelain'],
        result: ok(
          [
            'worktree /repo',
            'HEAD 012345',
            'branch refs/heads/main',
            'worktree /repo/.lumberjack/worktrees/run-3-sfx',
            'HEAD abcdef',
            'branch refs/heads/run/run-3-sfx',
            '',
          ].join('\n')
        ),
      },
    ])
    const { store } = createStateStore([
      {
        id: 'wt-1',
        path: '/repo/.lumberjack/worktrees/run-3-sfx',
        branch: 'run/run-3-sfx',
        baseBranch: 'main',
        runId: 'run-3',
        status: 'active',
        createdAt: fixedNow().toISOString(),
        updatedAt: fixedNow().toISOString(),
      },
      {
        id: 'wt-2',
        path: '/repo/.lumberjack/worktrees/missing',
        branch: 'run/run-4-missing',
        baseBranch: 'main',
        runId: 'run-4',
        status: 'active',
        createdAt: fixedNow().toISOString(),
        updatedAt: fixedNow().toISOString(),
      },
    ])

    const manager = createManager({ git, store })
    const worktrees = await manager.list()

    expect(worktrees).toHaveLength(1)
    expect(worktrees[0]?.id).toBe('wt-1')
  })
})

describe('WorktreeManager.remove', () => {
  it('removes a worktree and marks it abandoned', async () => {
    const record: WorktreeRecord = {
      id: 'wt-5',
      path: '/repo/.lumberjack/worktrees/run-5-sfx',
      branch: 'run/run-5-sfx',
      baseBranch: 'main',
      runId: 'run-5',
      status: 'active',
      createdAt: fixedNow().toISOString(),
      updatedAt: fixedNow().toISOString(),
    }
    const git = createFakeGitRunner([
      {
        args: ['worktree', 'remove', '/repo/.lumberjack/worktrees/run-5-sfx'],
        result: ok(),
      },
    ])
    const { store, captured } = createStateStore([record])
    const manager = createManager({ git, store })

    await manager.remove('wt-5')

    expect(captured.updates).toEqual([{ id: 'wt-5', status: 'abandoned' }])
  })
})

describe('WorktreeManager.merge', () => {
  it('merges the worktree branch into the base branch and records events', async () => {
    const record: WorktreeRecord = {
      id: 'wt-6',
      path: '/repo/.lumberjack/worktrees/run-6-sfx',
      branch: 'run/run-6-sfx',
      baseBranch: 'main',
      runId: 'run-6',
      status: 'active',
      createdAt: fixedNow().toISOString(),
      updatedAt: fixedNow().toISOString(),
    }
    const git = createFakeGitRunner([
      {
        args: ['checkout', 'main'],
        result: ok(),
      },
      {
        args: ['merge', '--no-ff', '--no-edit', 'run/run-6-sfx'],
        result: ok(),
      },
    ])
    const { store, captured } = createStateStore([record])
    const manager = createManager({ git, store })

    const result = await manager.merge('wt-6')

    expect(result.worktreeId).toBe('wt-6')
    expect(captured.updates).toEqual([{ id: 'wt-6', status: 'merged' }])
    expect(captured.events[0]).toEqual(
      expect.objectContaining({
        type: 'worktree_merged',
        runId: 'run-6',
        payload: expect.objectContaining({
          worktreeId: 'wt-6',
          branch: 'run/run-6-sfx',
          baseBranch: 'main',
        }),
      })
    )
  })

  it('records a merge failure event', async () => {
    const record: WorktreeRecord = {
      id: 'wt-7',
      path: '/repo/.lumberjack/worktrees/run-7-sfx',
      branch: 'run/run-7-sfx',
      baseBranch: 'main',
      runId: 'run-7',
      status: 'active',
      createdAt: fixedNow().toISOString(),
      updatedAt: fixedNow().toISOString(),
    }
    const git = createFakeGitRunner([
      {
        args: ['checkout', 'main'],
        result: ok(),
      },
      {
        args: ['merge', '--no-ff', '--no-edit', 'run/run-7-sfx'],
        result: fail('conflict'),
      },
    ])
    const { store, captured } = createStateStore([record])
    const manager = createManager({ git, store })

    await expect(manager.merge('wt-7')).rejects.toBeInstanceOf(LumberjackError)
    expect(captured.events[0]).toEqual(
      expect.objectContaining({
        type: 'worktree_merge_failed',
        runId: 'run-7',
      })
    )
  })
})

describe('WorktreeManager.reconcileWithDb', () => {
  it('marks missing worktrees and creates discovered records', async () => {
    const git = createFakeGitRunner([
      {
        args: ['worktree', 'list', '--porcelain'],
        result: ok(
          [
            'worktree /repo',
            'HEAD 012345',
            'branch refs/heads/main',
            'worktree /repo/.lumberjack/worktrees/run-8-sfx',
            'HEAD abcdef',
            'branch refs/heads/run/run-8-sfx',
            'worktree /repo/.lumberjack/worktrees/run-9-sfx',
            'HEAD abcdef',
            'branch refs/heads/run/run-9-sfx',
            '',
          ].join('\n')
        ),
      },
    ])
    const { store, captured } = createStateStore([
      {
        id: 'wt-8',
        path: '/repo/.lumberjack/worktrees/run-8-sfx',
        branch: 'run/run-8-sfx',
        baseBranch: 'main',
        runId: 'run-8',
        status: 'active',
        createdAt: fixedNow().toISOString(),
        updatedAt: fixedNow().toISOString(),
      },
      {
        id: 'wt-missing',
        path: '/repo/.lumberjack/worktrees/missing',
        branch: 'run/run-missing',
        baseBranch: 'main',
        runId: 'run-missing',
        status: 'active',
        createdAt: fixedNow().toISOString(),
        updatedAt: fixedNow().toISOString(),
      },
    ])

    const manager = createManager({ git, store })
    const result = await manager.reconcileWithDb()

    expect(result.missing).toEqual(['wt-missing'])
    expect(result.discovered).toHaveLength(1)
    expect(captured.created[0]?.status).toBe('discovered')
    expect(captured.updates).toEqual([{ id: 'wt-missing', status: 'missing' }])
  })
})
