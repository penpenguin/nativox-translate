import { contextBridge, ipcRenderer } from 'electron'
import { createTranslationBridge } from './translation'

contextBridge.exposeInMainWorld('translationApi', createTranslationBridge(ipcRenderer))
