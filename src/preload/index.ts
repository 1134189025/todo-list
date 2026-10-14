import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type QingxinApi, type SummaryResult } from '@shared/api'

const api: QingxinApi = {
  tasks: {
    load: () => ipcRenderer.invoke(IPC.tasksLoad),
    save: (tasks) => ipcRenderer.invoke(IPC.tasksSave, tasks)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    save: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch),
    setApiKey: (key) => ipcRenderer.invoke(IPC.settingsSetApiKey, key),
    clearApiKey: () => ipcRenderer.invoke(IPC.settingsClearApiKey)
  },
  ai: {
    parse: (req) => ipcRenderer.invoke(IPC.aiParse, req),
    summarize: (req) => ipcRenderer.invoke(IPC.aiSummarize, req),
    testConnection: (draft) => ipcRenderer.invoke(IPC.aiTestConnection, draft),
    cancel: (requestId) => ipcRenderer.invoke(IPC.aiCancel, requestId)
  },
  events: {
    onSummaryShow: (cb) => {
      const listener = (_event: unknown, summary: SummaryResult): void => cb(summary)
      ipcRenderer.on(IPC.summaryShow, listener)
      return () => {
        ipcRenderer.removeListener(IPC.summaryShow, listener)
      }
    },
    onVoiceHotkey: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on(IPC.voiceHotkey, listener)
      return () => {
        ipcRenderer.removeListener(IPC.voiceHotkey, listener)
      }
    }
  },
  app: {
    isSandbox: ipcRenderer.sendSync(IPC.appIsSandbox) === true
  }
}

contextBridge.exposeInMainWorld('api', api)
