import { spawn } from 'node:child_process'

export type AgentExecOptions = {
  command: string
  args?: string[]
  payload: unknown
  timeoutMs?: number
}

export type AgentExecResult<T = unknown> = {
  data: T
  stdout: string
  stderr: string
  durationMs: number
}

export class AgentExecError extends Error {
  code: 'timeout' | 'spawn' | 'parse' | 'exit'

  constructor(message: string, code: AgentExecError['code']) {
    super(message)
    this.name = 'AgentExecError'
    this.code = code
  }
}

export const DEFAULT_TIMEOUT_MS = 15000

export const agentExec = async <T = unknown>(
  options: AgentExecOptions
): Promise<AgentExecResult<T>> => {
  const { command, args = [], payload, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  return await new Promise<AgentExecResult<T>>((resolve, reject) => {
    const startedAt = Date.now()
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const summarizeOutput = (label: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return ''
      const preview =
        trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed
      return `${label}: ${preview}`
    }

    const buildTimeoutMessage = () => {
      const details = [
        summarizeOutput('stderr', stderr),
        summarizeOutput('stdout', stdout),
      ].filter(Boolean)
      return details.length
        ? `Agent execution timeout\n${details.join('\n')}`
        : 'Agent execution timeout'
    }

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new AgentExecError(buildTimeoutMessage(), 'timeout'))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(new AgentExecError(error.message, 'spawn'))
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)

      if (code && code !== 0) {
        reject(new AgentExecError(stderr || `Agent exited with code ${code}`, 'exit'))
        return
      }

      try {
        const trimmed = stdout.trim()
        const parsed = trimmed.length ? (JSON.parse(trimmed) as T) : ({} as T)
        resolve({
          data: parsed,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        })
      } catch (error) {
        reject(
          new AgentExecError(
            error instanceof Error ? error.message : 'Invalid JSON output',
            'parse'
          )
        )
      }
    })

    try {
      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(
        new AgentExecError(
          error instanceof Error ? error.message : 'Failed to write stdin',
          'spawn'
        )
      )
    }
  })
}
