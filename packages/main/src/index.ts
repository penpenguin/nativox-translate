import { app, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { access, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { FlowStore } from '@core/flowStore'
import { StateDB } from '@core/stateDb'
import { WorktreeManager } from '@core/worktreeManager'
import { StartupRecovery } from '@core/startupRecovery'
import { EventBus } from './ipcEventBus'
import { FileSessionStore } from './sessionStore'
import { toStructuredError } from '@shared/errors'

const createWindow = () => {
  const preloadPath = join(__dirname, '../preload/index.js')
  const preload = existsSync(preloadPath)
    ? preloadPath
    : join(__dirname, '../preload/index.mjs')
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const fallbackDevUrl = 'http://localhost:5174'
  const rendererUrl = devServerUrl ?? (!app.isPackaged ? fallbackDevUrl : null)

  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const ensureSqliteWasm = async () => {
  const target = join(__dirname, 'node-sqlite3-wasm.wasm')
  try {
    await access(target)
    return
  } catch {
    // continue
  }
  const candidates = [
    join(
      app.getAppPath(),
      'node_modules',
      'node-sqlite3-wasm',
      'dist',
      'node-sqlite3-wasm.wasm'
    ),
    join(
      process.cwd(),
      'node_modules',
      'node-sqlite3-wasm',
      'dist',
      'node-sqlite3-wasm.wasm'
    ),
  ]
  for (const source of candidates) {
    try {
      await access(source)
      await copyFile(source, target)
      return
    } catch {
      // try next
    }
  }
}

app.whenReady().then(async () => {
  const projectRoot = process.cwd()
  await ensureSqliteWasm()
  const flowStore = new FlowStore({ projectRoot })
  const stateDb = new StateDB()
  const worktreeManager = new WorktreeManager({ projectRoot, stateDb })
  const sessionStore = new FileSessionStore(
    join(app.getPath('userData'), 'session.json')
  )
  const recovery = new StartupRecovery({
    projectRoot,
    stateDb,
    flowStore,
    worktreeManager,
    sessionStore,
  })
  let migrationStatus = stateDb.getMigrationStatus()
  try {
    await recovery.recover()
    migrationStatus = stateDb.getMigrationStatus()
  } catch (error) {
    migrationStatus = {
      ...stateDb.getMigrationStatus(),
      error: toStructuredError(error),
    }
  }
  const eventBus = new EventBus()
  registerIpc({
    flowStore,
    stateDb,
    eventBus,
    getMigrationStatus: () => migrationStatus,
    sessionStore,
    projectRoot,
    worktreeManager,
  })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
