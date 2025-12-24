import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  AgentAdapter,
  type AgentProcess,
  type AgentProcessSpawner,
  type AgentTask,
} from './agentAdapter'

const createTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  taskId: 'task-1',
  runId: 'run-1',
  nodeId: 'node-1',
  config: {
    type: 'stdio-json',
    command: 'agent',
    args: [],
    envAllowlist: [],
    envDenylist: [],
    timeoutSec: 5,
  },
  input: {
    goal: 'do the thing',
    promptTemplate: 'Use prompt',
    artifacts: { spec: '/repo/spec.md' },
  },
  context: {
    runId: 'run-1',
    nodeId: 'node-1',
    flowId: 'flow-1',
    worktreePath: '/repo/worktrees/run-1',
    branchName: 'run/run-1',
    baseBranch: 'main',
    defaultBranch: 'main',
    repositoryUrl: 'https://ghp_SECRET@github.com/example/repo',
    previousNodeResults: [{ nodeId: 'n0', success: true, summary: 'ok' }],
  },
  ...overrides,
})

const createSpawner = ({
  stdout = '',
  stderr = '',
  exitCode = 0,
  exitPromise,
}: {
  stdout?: string
  stderr?: string
  exitCode?: number
  exitPromise?: Promise<{
    exitCode: number | null
    signal: NodeJS.Signals | null
  }>
} = {}) => {
  let capturedOptions: Parameters<AgentProcessSpawner['spawn']>[0] | undefined
  let written = ''
  const cancel = vi.fn(async () => {})
  const process: AgentProcess = {
    write: (input) => {
      written += input.toString()
    },
    end: () => {},
    getStdout: () => stdout,
    getStderr: () => stderr,
    exit:
      exitPromise ??
      Promise.resolve({ exitCode, signal: null as NodeJS.Signals | null }),
    cancel,
  }
  const spawner: AgentProcessSpawner = {
    spawn: vi.fn(async (options) => {
      capturedOptions = options
      return process
    }),
  }
  return {
    spawner,
    process,
    getOptions: () => capturedOptions,
    getWritten: () => written,
    cancel,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AgentAdapter', () => {
  it('filters environment variables by allowlist and denylist', async () => {
    const { spawner, getOptions } = createSpawner()
    const adapter = new AgentAdapter({
      spawner,
      envSource: {
        PATH: '/bin',
        HOME: '/home/user',
        FOO: 'bar',
        foo: 'lower',
        AWS_SECRET_ACCESS_KEY: 'nope',
      },
    })

    await adapter.execute(
      createTask({
        config: {
          type: 'stdio-json',
          command: 'agent',
          args: [],
          envAllowlist: ['FOO', 'AWS_*', 'foo'],
          envDenylist: ['AWS_*', 'foo'],
        },
      })
    )

    const env = getOptions()?.env ?? {}
    expect(env.PATH).toBe('/bin')
    expect(env.HOME).toBe('/home/user')
    expect(env.FOO).toBe('bar')
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.foo).toBeUndefined()
  })

  it('uses adapter command when provided', async () => {
    const { spawner, getOptions } = createSpawner()
    const adapter = new AgentAdapter({ spawner })

    await adapter.execute(
      createTask({
        config: {
          type: 'stdio-json',
          command: 'agent',
          adapterCommand: 'adapter',
          args: ['--flag'],
          envAllowlist: [],
          envDenylist: [],
        },
      })
    )

    const options = getOptions()
    expect(options?.command).toBe('adapter')
    expect(options?.args).toEqual(['--flag'])
  })

  it('parses RESULT blocks and redacts context/logs', async () => {
    const stdout = [
      'log before',
      'token ghp_ABCDEF',
      '===RESULT===',
      '{"success":true,"summary":"done"}',
      '===END===',
      'log after',
    ].join('\n')
    const { spawner, getWritten } = createSpawner({ stdout })
    const adapter = new AgentAdapter({ spawner })

    const result = await adapter.execute(createTask())

    expect(result.resultBlock).toEqual({ success: true, summary: 'done' })
    expect(result.stdout).not.toContain('ghp_ABCDEF')

    const [firstLine] = getWritten().trim().split('\\n')
    const payload = JSON.parse(firstLine ?? '{}') as Record<string, unknown>
    const repo = payload.repo as Record<string, string>
    expect(repo.repositoryUrl).not.toContain('ghp_SECRET')
  })

  it('times out and cancels the process', async () => {
    vi.useFakeTimers()
    const never = new Promise<{
      exitCode: number | null
      signal: NodeJS.Signals | null
    }>(() => {})
    const { spawner, cancel } = createSpawner({ exitPromise: never })
    const adapter = new AgentAdapter({ spawner })

    const promise = adapter.execute(
      createTask({
        config: {
          type: 'stdio-json',
          command: 'agent',
          args: [],
          envAllowlist: [],
          envDenylist: [],
          timeoutSec: 1,
        },
      })
    )

    const expectation = expect(promise).rejects.toEqual(
      expect.objectContaining({ code: 'AGENT_TIMEOUT' })
    )
    await vi.advanceTimersByTimeAsync(1000)
    await expectation
    expect(cancel).toHaveBeenCalled()
  })
})
