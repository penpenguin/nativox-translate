import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEOUT_MS, agentExec } from './agentExec'

describe('agentExec', () => {
  it('parses JSON stdout and returns data', async () => {
    const result = await agentExec({
      command: 'cat',
      payload: { translatedText: 'hola' },
      timeoutMs: 1000,
    })

    expect(result.data).toEqual({ translatedText: 'hola' })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects on timeout', async () => {
    await expect(
      agentExec({
        command: 'sleep',
        args: ['0.2'],
        payload: { sourceText: 'hello' },
        timeoutMs: 10,
      })
    ).rejects.toThrow(/timeout/i)
  })

  it('uses a 15s default timeout', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15000)
  })

  it('includes stderr in timeout errors for debugging', async () => {
    await expect(
      agentExec({
        command: 'bash',
        args: ['-c', 'echo AUTH 1>&2; sleep 1'],
        payload: { sourceText: 'hello' },
        timeoutMs: 50,
      })
    ).rejects.toThrow(/AUTH/)
  })
})
