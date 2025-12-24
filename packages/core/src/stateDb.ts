import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  type ApprovedCommandRecord,
  type ArtifactRecord,
  type EventRecord,
  type LockResult,
  type NodeStateRecord,
  type RunRecord,
  type RunState,
  type WorktreeRecord,
  type WorktreeStatus,
} from '@shared/types'
import { LumberjackError } from '@shared/errors'
import type { StructuredError } from '@shared/errors'

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    worktree_id TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS node_states (
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    meta TEXT,
    PRIMARY KEY (run_id, node_id)
  );

  CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    path TEXT NOT NULL,
    hash TEXT,
    meta TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    node_id TEXT,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approved_commands (
    id TEXT PRIMARY KEY,
    command_path TEXT NOT NULL,
    args_pattern TEXT NOT NULL,
    hash TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE worktrees ADD COLUMN base_branch TEXT;
  ALTER TABLE worktrees ADD COLUMN run_id TEXT;
  `,
  `
  CREATE TABLE IF NOT EXISTS artifact_lineage (
    artifact_id TEXT NOT NULL,
    source_artifact_id TEXT NOT NULL,
    PRIMARY KEY (artifact_id, source_artifact_id)
  );
  `,
]

const DB_SCHEMA_VERSION = MIGRATIONS.length

interface SqliteDb {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (params?: Record<string, unknown> | unknown[]) => void
    get: (
      params?: Record<string, unknown> | unknown[]
    ) => Record<string, unknown>
    all: (
      params?: Record<string, unknown> | unknown[]
    ) => Record<string, unknown>[]
    finalize?: () => void
  }
  close?: () => void
}

export class StateDB {
  private db: SqliteDb | null = null
  private dbPath: string | null = null
  private lockPath: string | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private lastMigrationApplied: number[] = []
  private lastMigrationError?: StructuredError

  async open(dbPath: string): Promise<void> {
    this.dbPath = dbPath
    this.lockPath = `${dbPath}.lock`
    await mkdir(dirname(dbPath), { recursive: true })
    this.db = await openSqlite(dbPath)
    await this.applyMigrations()
  }

  async close(): Promise<void> {
    this.releaseLock()
    if (this.db?.close) {
      this.db.close()
    }
    this.db = null
  }

  async acquireLock({
    staleMs = 30_000,
    heartbeatMs = 5_000,
  }: {
    staleMs?: number
    heartbeatMs?: number
  } = {}): Promise<LockResult> {
    if (!this.lockPath) {
      throw new LumberjackError('STATE_DB_NOT_OPEN', 'StateDB not opened')
    }
    try {
      const now = new Date().toISOString()
      await writeFile(
        this.lockPath,
        JSON.stringify({ pid: process.pid, createdAt: now, heartbeatAt: now }),
        { flag: 'wx' }
      )
      this.heartbeatTimer = setInterval(async () => {
        if (!this.lockPath) return
        const heartbeatAt = new Date().toISOString()
        await writeFile(
          this.lockPath,
          JSON.stringify({ pid: process.pid, createdAt: now, heartbeatAt }),
          { flag: 'w' }
        )
      }, heartbeatMs)
      return { acquired: true, stale: false }
    } catch (error) {
      if (!isFileExists(error)) {
        throw error
      }
      const owner = await readLockFile(this.lockPath)
      if (owner && isStale(owner.heartbeatAt, staleMs)) {
        await rm(this.lockPath)
        return this.acquireLock({ staleMs, heartbeatMs })
      }
      return { acquired: false, stale: false, owner: owner ?? undefined }
    }
  }

  releaseLock(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.lockPath) {
      void rm(this.lockPath).catch(() => {})
    }
  }

  getSchemaVersion(): number {
    this.ensureDb()
    const row = this.get('PRAGMA user_version;') ?? {}
    const version = row.user_version
    if (typeof version !== 'number') return 0
    return version
  }

  async applyMigrations(): Promise<{ applied: number[] }> {
    this.ensureDb()
    const applied: number[] = []
    const current = this.getSchemaVersion()
    if (current > DB_SCHEMA_VERSION) {
      const error = new LumberjackError(
        'STATE_DB_VERSION_TOO_NEW',
        'Database schema version is newer than supported',
        { current, supported: DB_SCHEMA_VERSION }
      )
      this.lastMigrationError = error.toStructuredError()
      throw error
    }
    for (let version = current; version < DB_SCHEMA_VERSION; version += 1) {
      const sql = MIGRATIONS[version]
      if (!sql) continue
      this.exec('BEGIN')
      try {
        this.exec(sql)
        this.exec(`PRAGMA user_version = ${version + 1}`)
        this.exec('COMMIT')
        applied.push(version + 1)
      } catch (error) {
        this.exec('ROLLBACK')
        const migrationError = new LumberjackError(
          'STATE_DB_MIGRATION_FAILED',
          'Migration failed',
          {
            version: version + 1,
            reason: error instanceof Error ? error.message : String(error),
          }
        )
        this.lastMigrationError = migrationError.toStructuredError()
        throw migrationError
      }
    }
    this.lastMigrationApplied = applied
    this.lastMigrationError = undefined
    return { applied }
  }

  getMigrationStatus(): {
    schemaVersion: number
    applied: number[]
    error?: StructuredError
  } {
    return {
      schemaVersion: DB_SCHEMA_VERSION,
      applied: this.lastMigrationApplied,
      error: this.lastMigrationError,
    }
  }

  async createRun(flowId: string, worktreeId: string): Promise<RunRecord> {
    const now = new Date().toISOString()
    const run: RunRecord = {
      id: randomUUID(),
      flowId,
      worktreeId,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    this.run(
      `INSERT INTO runs (id, flow_id, worktree_id, state, created_at, updated_at)
       VALUES (:id, :flow_id, :worktree_id, :state, :created_at, :updated_at)`,
      {
        id: run.id,
        flow_id: run.flowId,
        worktree_id: run.worktreeId,
        state: run.state,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      }
    )
    return run
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const row = this.get('SELECT * FROM runs WHERE id = :id', { id: runId })
    if (!row) return null
    return mapRun(row)
  }

  async updateRunState(runId: string, state: RunState): Promise<void> {
    const now = new Date().toISOString()
    this.run(
      `UPDATE runs SET state = :state, updated_at = :updated_at WHERE id = :id`,
      { id: runId, state, updated_at: now }
    )
  }

  async listRuns(flowId?: string): Promise<RunRecord[]> {
    const rows = flowId
      ? this.all('SELECT * FROM runs WHERE flow_id = :flow_id', {
          flow_id: flowId,
        })
      : this.all('SELECT * FROM runs')
    return rows.map(mapRun)
  }

  async getNodeState(
    runId: string,
    nodeId: string
  ): Promise<NodeStateRecord | null> {
    const row = this.get(
      'SELECT * FROM node_states WHERE run_id = :run_id AND node_id = :node_id',
      { run_id: runId, node_id: nodeId }
    )
    if (!row) return null
    return mapNodeState(row)
  }

  async updateNodeState(record: NodeStateRecord): Promise<void> {
    this.run(
      `INSERT INTO node_states (run_id, node_id, state, updated_at, meta)
       VALUES (:run_id, :node_id, :state, :updated_at, :meta)
       ON CONFLICT(run_id, node_id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at,
         meta = excluded.meta`,
      {
        run_id: record.runId,
        node_id: record.nodeId,
        state: record.state,
        updated_at: record.updatedAt,
        meta: record.meta ? JSON.stringify(record.meta) : null,
      }
    )
  }

  async listNodeStates(runId: string): Promise<NodeStateRecord[]> {
    return this.all('SELECT * FROM node_states WHERE run_id = :run_id', {
      run_id: runId,
    }).map(mapNodeState)
  }

  async createWorktree(record: WorktreeRecord): Promise<void> {
    this.run(
      `INSERT INTO worktrees (
         id,
         path,
         branch,
         base_branch,
         run_id,
         status,
         created_at,
         updated_at
       )
       VALUES (
         :id,
         :path,
         :branch,
         :base_branch,
         :run_id,
         :status,
         :created_at,
         :updated_at
       )`,
      {
        id: record.id,
        path: record.path,
        branch: record.branch,
        base_branch: record.baseBranch ?? null,
        run_id: record.runId ?? null,
        status: record.status,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      }
    )
  }

  async getWorktree(worktreeId: string): Promise<WorktreeRecord | null> {
    const row = this.get('SELECT * FROM worktrees WHERE id = :id', {
      id: worktreeId,
    })
    if (!row) return null
    return mapWorktree(row)
  }

  async updateWorktreeStatus(
    worktreeId: string,
    status: WorktreeStatus
  ): Promise<void> {
    const now = new Date().toISOString()
    this.run(
      `UPDATE worktrees SET status = :status, updated_at = :updated_at WHERE id = :id`,
      { id: worktreeId, status, updated_at: now }
    )
  }

  async listWorktrees(): Promise<WorktreeRecord[]> {
    return this.all('SELECT * FROM worktrees').map(mapWorktree)
  }

  async registerArtifact(record: ArtifactRecord): Promise<void> {
    this.run(
      `INSERT INTO artifacts (id, run_id, node_id, path, hash, meta, created_at)
       VALUES (:id, :run_id, :node_id, :path, :hash, :meta, :created_at)`,
      {
        id: record.id,
        run_id: record.runId,
        node_id: record.nodeId,
        path: record.path,
        hash: record.hash ?? null,
        meta: record.meta ? JSON.stringify(record.meta) : null,
        created_at: record.createdAt,
      }
    )
  }

  async registerArtifactLineage(
    artifactId: string,
    sourceArtifactId: string
  ): Promise<void> {
    this.run(
      `INSERT INTO artifact_lineage (artifact_id, source_artifact_id)
       VALUES (:artifact_id, :source_artifact_id)`,
      { artifact_id: artifactId, source_artifact_id: sourceArtifactId }
    )
  }

  async listArtifactLineage(artifactId: string): Promise<string[]> {
    return this.all(
      'SELECT source_artifact_id FROM artifact_lineage WHERE artifact_id = :id',
      { id: artifactId }
    ).map((row) => String(row.source_artifact_id))
  }

  async getArtifact(artifactId: string): Promise<ArtifactRecord | null> {
    const row = this.get('SELECT * FROM artifacts WHERE id = :id', {
      id: artifactId,
    })
    if (!row) return null
    return mapArtifact(row)
  }

  async getArtifactsByNode(
    runId: string,
    nodeId: string
  ): Promise<ArtifactRecord[]> {
    return this.all(
      'SELECT * FROM artifacts WHERE run_id = :run_id AND node_id = :node_id',
      { run_id: runId, node_id: nodeId }
    ).map(mapArtifact)
  }

  async recordEvent(event: Omit<EventRecord, 'id'>): Promise<void> {
    this.run(
      `INSERT INTO events (run_id, node_id, type, payload, created_at)
       VALUES (:run_id, :node_id, :type, :payload, :created_at)`,
      {
        run_id: event.runId ?? null,
        node_id: event.nodeId ?? null,
        type: event.type,
        payload: event.payload ? JSON.stringify(event.payload) : null,
        created_at: event.createdAt,
      }
    )
  }

  async listEvents(filters?: {
    runId?: string
    nodeId?: string
    limit?: number
  }): Promise<EventRecord[]> {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (filters?.runId) {
      clauses.push('run_id = :run_id')
      params.run_id = filters.runId
    }
    if (filters?.nodeId) {
      clauses.push('node_id = :node_id')
      params.node_id = filters.nodeId
    }
    let sql = 'SELECT * FROM events'
    if (clauses.length) {
      sql += ` WHERE ${clauses.join(' AND ')}`
    }
    sql += ' ORDER BY id ASC'
    if (filters?.limit) {
      sql += ' LIMIT :limit'
      params.limit = filters.limit
    }
    return this.all(sql, params).map(mapEvent)
  }

  async listApprovedCommands(): Promise<ApprovedCommandRecord[]> {
    const rows = this.all('SELECT * FROM approved_commands')
    return rows.map(mapApprovedCommand)
  }

  async saveApprovedCommand(
    record: Omit<ApprovedCommandRecord, 'id'> & { id?: string }
  ): Promise<ApprovedCommandRecord> {
    const id = record.id ?? randomUUID()
    this.run(
      `INSERT INTO approved_commands (id, command_path, args_pattern, hash, approved_at, last_seen_at)
       VALUES (:id, :command_path, :args_pattern, :hash, :approved_at, :last_seen_at)`,
      {
        id,
        command_path: record.commandPath,
        args_pattern: JSON.stringify(record.argsPattern),
        hash: record.hash,
        approved_at: record.approvedAt,
        last_seen_at: record.lastSeenAt,
      }
    )
    return { ...record, id }
  }

  async updateApprovedCommandHash(id: string, hash: string): Promise<void> {
    const now = new Date().toISOString()
    this.run(
      `UPDATE approved_commands SET hash = :hash, last_seen_at = :last_seen_at WHERE id = :id`,
      { id, hash, last_seen_at: now }
    )
  }

  async touchApprovedCommand(id: string): Promise<void> {
    const now = new Date().toISOString()
    this.run(
      `UPDATE approved_commands SET last_seen_at = :last_seen_at WHERE id = :id`,
      { id, last_seen_at: now }
    )
  }

  ensureDb(): asserts this is { db: SqliteDb } {
    if (!this.db) {
      throw new LumberjackError('STATE_DB_NOT_OPEN', 'StateDB not opened')
    }
  }

  private exec(sql: string): void {
    this.ensureDb()
    this.db.exec(sql)
  }

  private run(sql: string, params?: Record<string, unknown> | unknown[]): void {
    this.ensureDb()
    const stmt = this.db.prepare(sql)
    stmt.run(normalizeParams(params))
    stmt.finalize?.()
  }

  private get(
    sql: string,
    params?: Record<string, unknown> | unknown[]
  ): Record<string, unknown> | undefined {
    this.ensureDb()
    const stmt = this.db.prepare(sql)
    const row = stmt.get(normalizeParams(params))
    stmt.finalize?.()
    return row
  }

  private all(
    sql: string,
    params?: Record<string, unknown> | unknown[]
  ): Record<string, unknown>[] {
    this.ensureDb()
    const stmt = this.db.prepare(sql)
    const rows = stmt.all(normalizeParams(params))
    stmt.finalize?.()
    return rows
  }
}

const openSqlite = async (dbPath: string): Promise<SqliteDb> => {
  const mod = await import('node-sqlite3-wasm')
  const Database =
    (mod as { Database?: new (path: string) => SqliteDb }).Database ??
    (mod as { default?: { Database?: new (path: string) => SqliteDb } }).default
      ?.Database ??
    (mod as { default?: new (path: string) => SqliteDb }).default
  if (!Database) {
    throw new LumberjackError(
      'STATE_DB_DRIVER_MISSING',
      'node-sqlite3-wasm Database export not found'
    )
  }
  return new Database(dbPath)
}

const mapRun = (row: Record<string, unknown>): RunRecord => ({
  id: String(row.id),
  flowId: String(row.flow_id),
  worktreeId: String(row.worktree_id),
  state: row.state as RunState,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapNodeState = (row: Record<string, unknown>): NodeStateRecord => ({
  runId: String(row.run_id),
  nodeId: String(row.node_id),
  state: row.state as NodeStateRecord['state'],
  updatedAt: String(row.updated_at),
  meta: row.meta ? JSON.parse(String(row.meta)) : undefined,
})

const mapWorktree = (row: Record<string, unknown>): WorktreeRecord => ({
  id: String(row.id),
  path: String(row.path),
  branch: String(row.branch),
  baseBranch: row.base_branch ? String(row.base_branch) : undefined,
  runId: row.run_id ? String(row.run_id) : undefined,
  status: row.status as WorktreeStatus,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

const mapArtifact = (row: Record<string, unknown>): ArtifactRecord => ({
  id: String(row.id),
  runId: String(row.run_id),
  nodeId: String(row.node_id),
  path: String(row.path),
  hash: row.hash ? String(row.hash) : undefined,
  meta: row.meta ? JSON.parse(String(row.meta)) : undefined,
  createdAt: String(row.created_at),
})

const mapApprovedCommand = (
  row: Record<string, unknown>
): ApprovedCommandRecord => ({
  id: String(row.id),
  commandPath: String(row.command_path),
  argsPattern: row.args_pattern ? JSON.parse(String(row.args_pattern)) : [],
  hash: String(row.hash),
  approvedAt: String(row.approved_at),
  lastSeenAt: String(row.last_seen_at),
})

const normalizeParams = (
  params?: Record<string, unknown> | unknown[]
): Record<string, unknown> | unknown[] | undefined => {
  if (!params || Array.isArray(params)) return params
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(':') || key.startsWith('@') || key.startsWith('$')) {
      normalized[key] = value
    } else {
      normalized[`:${key}`] = value
    }
  }
  return normalized
}

const mapEvent = (row: Record<string, unknown>): EventRecord => ({
  id: Number(row.id),
  runId: row.run_id ? String(row.run_id) : undefined,
  nodeId: row.node_id ? String(row.node_id) : undefined,
  type: String(row.type),
  payload: row.payload ? JSON.parse(String(row.payload)) : undefined,
  createdAt: String(row.created_at),
})

const isFileExists = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === 'EEXIST'
  }
  return false
}

const readLockFile = async (path: string) => {
  try {
    const raw = await readFile(path, 'utf-8')
    const json = JSON.parse(raw) as {
      pid: number
      createdAt: string
      heartbeatAt: string
    }
    return json
  } catch {
    return null
  }
}

const isStale = (heartbeatAt: string, staleMs: number): boolean => {
  const last = new Date(heartbeatAt).getTime()
  return Date.now() - last > staleMs
}

export const hashFile = async (filePath: string): Promise<string> => {
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

export const toRelativeArtifactPath = (
  rootDir: string,
  absolutePath: string
) => {
  const normalizedRoot = rootDir.endsWith('/') ? rootDir : `${rootDir}/`
  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new LumberjackError(
      'ARTIFACT_PATH_INVALID',
      'Artifact path is outside root',
      {
        rootDir,
        absolutePath,
      }
    )
  }
  return absolutePath.slice(normalizedRoot.length)
}

export const resolveArtifactPath = (rootDir: string, relativePath: string) =>
  join(rootDir, relativePath)
