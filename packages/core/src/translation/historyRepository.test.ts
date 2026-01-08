import { describe, expect, it, vi } from 'vitest'
import { createHistoryRepository } from './historyRepository'

const makeRecord = (id: string, createdAt: string) => ({
  id,
  createdAt,
  sourceText: `source-${id}`,
  translatedText: `translated-${id}`,
  targetLanguage: 'es',
  status: 'success' as const,
})

describe('historyRepository', () => {
  it('uses an injected sqlite module when provided', () => {
    class FakeDatabase {
      static lastInstance: FakeDatabase | null = null
      path: string
      exec = vi.fn()
      run = vi.fn()
      get = vi.fn()
      all = vi.fn().mockReturnValue([])
      close = vi.fn()

      constructor(path: string) {
        this.path = path
        FakeDatabase.lastInstance = this
      }
    }

    createHistoryRepository({
      dbPath: 'test.db',
      sqliteModule: { Database: FakeDatabase },
    } as unknown as Parameters<typeof createHistoryRepository>[0])

    expect(FakeDatabase.lastInstance?.path).toBe('test.db')
    expect(FakeDatabase.lastInstance?.exec).toHaveBeenCalled()
  })

  it('stores and retrieves history records', () => {
    const repo = createHistoryRepository({ dbPath: ':memory:' })

    const record = makeRecord('record-1', '2026-01-07T00:00:00.000Z')
    repo.addRecord(record)

    const fetched = repo.getRecord('record-1')
    expect(fetched).toMatchObject(record)

    const list = repo.listRecords(10, 0)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('record-1')

    repo.close()
  })

  it('retains only the last 100 entries', () => {
    const repo = createHistoryRepository({ dbPath: ':memory:' })

    for (let i = 0; i < 105; i += 1) {
      const createdAt = new Date(Date.UTC(2026, 0, 7, 0, 0, i)).toISOString()
      repo.addRecord(makeRecord(`record-${i}`, createdAt))
    }

    const list = repo.listRecords(200, 0)
    expect(list).toHaveLength(100)
    expect(list[0].id).toBe('record-104')
    expect(list[99].id).toBe('record-5')

    repo.close()
  })
})
