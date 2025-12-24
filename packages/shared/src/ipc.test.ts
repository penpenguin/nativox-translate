import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './ipc'

describe('IPC channels', () => {
  it('includes migration and approval channels', () => {
    expect(IPC_CHANNELS.migrationsGet).toBe('lumberjack:migrations:get')
    expect(IPC_CHANNELS.approvalsList).toBe('lumberjack:approvals:list')
    expect(IPC_CHANNELS.approvalsApprove).toBe('lumberjack:approvals:approve')
    expect(IPC_CHANNELS.approvalsReject).toBe('lumberjack:approvals:reject')
    expect(IPC_CHANNELS.sessionGet).toBe('lumberjack:session:get')
    expect(IPC_CHANNELS.sessionSave).toBe('lumberjack:session:save')
    expect(IPC_CHANNELS.worktreesMerge).toBe('lumberjack:worktrees:merge')
    expect(IPC_CHANNELS.worktreesRemove).toBe('lumberjack:worktrees:remove')
  })
})
