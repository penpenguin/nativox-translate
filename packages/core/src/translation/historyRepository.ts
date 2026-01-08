import sqliteModule from 'node-sqlite3-wasm'
import type { TranslationRecord } from '@shared/translation/types'

type DatabaseLike = {
  exec: (sql: string) => void
  run: (sql: string, params?: Record<string, unknown>) => void
  get: (sql: string, params?: Record<string, unknown>) => unknown
  all: (sql: string, params?: Record<string, unknown>) => unknown[]
  close: () => void
}

type SqliteModule = {
  Database: new (dbPath: string) => DatabaseLike
}

const defaultSqliteModule = sqliteModule as unknown as SqliteModule

export type HistoryRepositoryDeps = {
  dbPath?: string
  retainLimit?: number
  sqliteModule?: SqliteModule
}

const schema = `
  CREATE TABLE IF NOT EXISTS translation_history (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    sourceText TEXT NOT NULL,
    translatedText TEXT,
    backTranslatedText TEXT,
    targetLanguage TEXT NOT NULL,
    systemPrompt TEXT,
    customPrompt TEXT,
    agentCommand TEXT,
    durationMs INTEGER,
    status TEXT NOT NULL,
    errorMessage TEXT
  );
`

const toRecord = (row?: Record<string, unknown>): TranslationRecord | null => {
  if (!row) return null
  return {
    id: row.id as string,
    createdAt: row.createdAt as string,
    sourceText: row.sourceText as string,
    translatedText: row.translatedText as string | undefined,
    backTranslatedText: row.backTranslatedText as string | undefined,
    targetLanguage: row.targetLanguage as string,
    systemPrompt: row.systemPrompt as string | undefined,
    customPrompt: row.customPrompt as string | undefined,
    agentCommand: row.agentCommand as string | undefined,
    durationMs: row.durationMs as number | undefined,
    status: row.status as TranslationRecord['status'],
    errorMessage: row.errorMessage as string | undefined,
  }
}

export const createHistoryRepository = (deps: HistoryRepositoryDeps = {}) => {
  const dbPath = deps.dbPath ?? 'translation-history.db'
  const retainLimit = deps.retainLimit ?? 100
  const sqlite = deps.sqliteModule ?? defaultSqliteModule
  const db = new sqlite.Database(dbPath)

  db.exec(schema)

  const addRecord = (record: TranslationRecord) => {
    db.run(
      `
      INSERT INTO translation_history (
        id,
        createdAt,
        sourceText,
        translatedText,
        backTranslatedText,
        targetLanguage,
        systemPrompt,
        customPrompt,
        agentCommand,
        durationMs,
        status,
        errorMessage
      ) VALUES (
        :id,
        :createdAt,
        :sourceText,
        :translatedText,
        :backTranslatedText,
        :targetLanguage,
        :systemPrompt,
        :customPrompt,
        :agentCommand,
        :durationMs,
        :status,
        :errorMessage
      )
    `,
      {
        ':id': record.id,
        ':createdAt': record.createdAt,
        ':sourceText': record.sourceText,
        ':translatedText': record.translatedText ?? null,
        ':backTranslatedText': record.backTranslatedText ?? null,
        ':targetLanguage': record.targetLanguage,
        ':systemPrompt': record.systemPrompt ?? null,
        ':customPrompt': record.customPrompt ?? null,
        ':agentCommand': record.agentCommand ?? null,
        ':durationMs': record.durationMs ?? null,
        ':status': record.status,
        ':errorMessage': record.errorMessage ?? null,
      }
    )

    db.run(
      `
      DELETE FROM translation_history
      WHERE id IN (
        SELECT id FROM translation_history
        ORDER BY datetime(createdAt) DESC
        LIMIT -1 OFFSET :limit
      )
      `,
      { ':limit': retainLimit }
    )
  }

  const getRecord = (id: string) => {
    const row = db.get(
      `
      SELECT * FROM translation_history
      WHERE id = :id
      `,
      { ':id': id }
    )
    return toRecord(row as Record<string, unknown> | undefined)
  }

  const listRecords = (limit = retainLimit, offset = 0) => {
    const rows = db.all(
      `
      SELECT * FROM translation_history
      ORDER BY datetime(createdAt) DESC
      LIMIT :limit OFFSET :offset
      `,
      { ':limit': limit, ':offset': offset }
    ) as Record<string, unknown>[]
    return rows.map((row) => toRecord(row)).filter(Boolean) as TranslationRecord[]
  }

  const close = () => {
    db.close()
  }

  return { addRecord, getRecord, listRecords, close }
}
