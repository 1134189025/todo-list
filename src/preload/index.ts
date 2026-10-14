import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PublicSettings, type QingxinApi, type SummaryResult } from '@shared/api'
import type { Task } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

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
    onSummaryShow: (cb) => subscribe<SummaryResult>(IPC.summaryShow, cb),
    onVoiceHotkey: (cb) => subscribe<undefined>(IPC.voiceHotkey, () => cb()),
    onTasksChanged: (cb) => subscribe<Task[]>(IPC.tasksChanged, cb),
    onSettingsChanged: (cb) => subscribe<PublicSettings>(IPC.settingsChanged, cb)
  },
  app: {
    isSandbox: ipcRenderer.sendSync(IPC.appIsSandbox) === true,
    showMain: () => ipcRenderer.invoke(IPC.appShowMain)
  }
}

contextBridge.exposeInMainWorld('api', api)
