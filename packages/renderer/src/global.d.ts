import type { LumberjackIpcApi } from '@shared/ipc'

declare global {
  interface Window {
    lumberjack?: LumberjackIpcApi
  }
}

export {}
