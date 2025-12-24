import { ipcMain } from 'electron'
import { FlowStore } from '@core/flowStore'
import { StateDB } from '@core/stateDb'
import type { SessionStore } from '@core/startupRecovery'
import { WorktreeManager } from '@core/worktreeManager'
import { toStructuredError } from '@shared/errors'
import {
  IPC_CHANNELS,
  type AppStatus,
  type IpcResult,
  type MigrationStatus,
  type LumberjackEvent,
  type LumberjackIpcApi,
} from '@shared/ipc'
import { EventBus } from './ipcEventBus'

const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })
const fail = <T>(error: unknown): IpcResult<T> => ({
  ok: false,
  error: toStructuredError(error),
})

export const registerIpc = ({
  flowStore,
  stateDb,
  eventBus,
  getMigrationStatus,
  sessionStore,
  projectRoot,
}: {
  flowStore: FlowStore
  stateDb: StateDB
  eventBus: EventBus
  getMigrationStatus: () => MigrationStatus
  sessionStore: SessionStore
  projectRoot: string
  worktreeManager: WorktreeManager
}) => {
  ipcMain.handle(IPC_CHANNELS.flowsList, async () => {
    try {
      return ok(await flowStore.loadAll())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.flowsGet, async (_event, flowId: string) => {
    try {
      return ok(await flowStore.load(flowId))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.flowsSave,
    async (
      _event,
      flowJson: Parameters<LumberjackIpcApi['flows']['save']>[0]
    ) => {
      try {
        await flowStore.save(flowJson)
        return ok(undefined)
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.flowsDelete, async (_event, flowId: string) => {
    try {
      await flowStore.delete(flowId)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.runsCreate,
    async (_event, flowId: string, worktreeId: string) => {
      try {
        return ok(await stateDb.createRun(flowId, worktreeId))
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.runsGet, async (_event, runId: string) => {
    try {
      return ok(await stateDb.getRun(runId))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.runsList, async (_event, flowId?: string) => {
    try {
      return ok(await stateDb.listRuns(flowId))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.worktreesGet,
    async (_event, worktreeId: string) => {
      try {
        return ok(await stateDb.getWorktree(worktreeId))
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.worktreesList, async () => {
    try {
      return ok(await stateDb.listWorktrees())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.worktreesMerge,
    async (_event, worktreeId: string) => {
      try {
        return ok(await worktreeManager.merge(worktreeId))
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.worktreesRemove,
    async (_event, worktreeId: string) => {
      try {
        await worktreeManager.remove(worktreeId)
        return ok(undefined)
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.statusGet, async () => {
    try {
      const status: AppStatus = {
        appVersion: process.env.npm_package_version ?? '0.0.0',
        platform: process.platform,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }
      return ok(status)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.migrationsGet, async () => {
    try {
      return ok(getMigrationStatus())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.approvalsList, async () => {
    try {
      return ok([])
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.approvalsApprove, async () => {
    try {
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.approvalsReject, async () => {
    try {
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.sessionGet, async () => {
    try {
      return ok(await sessionStore.loadLastSession())
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.sessionSave,
    async (_event, flowId: string | null) => {
      try {
        if (sessionStore.saveSession) {
          await sessionStore.saveSession({
            projectRoot,
            flowId: flowId ?? undefined,
          })
        }
        return ok(undefined)
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.eventsEmit,
    async (_event, payload: LumberjackEvent) => {
      try {
        eventBus.emit(payload)
        return ok(undefined)
      } catch (error) {
        return fail(error)
      }
    }
  )
}
