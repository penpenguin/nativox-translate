import { app, BrowserWindow, clipboard, globalShortcut, ipcMain } from 'electron'
import { join } from 'node:path'
import { createMainApp } from './mainApp'

const mainApp = createMainApp({
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  clipboard,
  env: process.env,
  joinPath: join,
})

void mainApp.start()
