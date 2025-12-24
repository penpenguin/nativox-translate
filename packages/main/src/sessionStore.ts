import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SessionState } from '@shared/types'
import type { SessionStore } from '@core/startupRecovery'

export class FileSessionStore implements SessionStore {
  private readonly path: string

  constructor(path: string) {
    this.path = path
  }

  async loadLastSession(): Promise<SessionState | null> {
    try {
      const raw = await readFile(this.path, 'utf-8')
      const parsed = JSON.parse(raw) as SessionState
      return parsed ?? null
    } catch {
      return null
    }
  }

  async saveSession(state: SessionState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(state, null, 2), 'utf-8')
  }
}
