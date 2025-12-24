import { app, BrowserWindow } from 'electron'
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
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const projectRoot = process.cwd()
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
