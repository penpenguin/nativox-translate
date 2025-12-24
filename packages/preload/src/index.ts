import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type LumberjackEvent,
  type LumberjackIpcApi,
} from '@shared/ipc'

const api: LumberjackIpcApi = {
  flows: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.flowsList),
    get: (flowId) => ipcRenderer.invoke(IPC_CHANNELS.flowsGet, flowId),
    save: (flow) => ipcRenderer.invoke(IPC_CHANNELS.flowsSave, flow),
    delete: (flowId) => ipcRenderer.invoke(IPC_CHANNELS.flowsDelete, flowId),
  },
  runs: {
    create: (flowId, worktreeId) =>
      ipcRenderer.invoke(IPC_CHANNELS.runsCreate, flowId, worktreeId),
    get: (runId) => ipcRenderer.invoke(IPC_CHANNELS.runsGet, runId),
    list: (flowId) => ipcRenderer.invoke(IPC_CHANNELS.runsList, flowId),
  },
  worktrees: {
    get: (worktreeId) =>
      ipcRenderer.invoke(IPC_CHANNELS.worktreesGet, worktreeId),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.worktreesList),
    merge: (worktreeId) =>
      ipcRenderer.invoke(IPC_CHANNELS.worktreesMerge, worktreeId),
    remove: (worktreeId) =>
      ipcRenderer.invoke(IPC_CHANNELS.worktreesRemove, worktreeId),
  },
  status: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.statusGet),
  },
  migrations: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.migrationsGet),
  },
  events: {
    subscribe: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: LumberjackEvent) =>
        handler(payload)
      ipcRenderer.on(IPC_CHANNELS.events, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.events, listener)
      }
    },
  },
  approval: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.approvalsList),
    approve: (approvalId) =>
      ipcRenderer.invoke(IPC_CHANNELS.approvalsApprove, approvalId),
    reject: (approvalId) =>
      ipcRenderer.invoke(IPC_CHANNELS.approvalsReject, approvalId),
  },
  session: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.sessionGet),
    save: (flowId) => ipcRenderer.invoke(IPC_CHANNELS.sessionSave, flowId),
  },
}

contextBridge.exposeInMainWorld('lumberjack', api)
