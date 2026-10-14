import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { IPC, type PublicSettings, type Result, type SummaryResult } from '@shared/api'
import { fail, ok } from '@shared/result'
import type { TasksSnapshot } from '@shared/taskPatch'
import {
  validateApiKey,
  validateCommandRequest,
  validateRequestId,
  validateSettingsPatch,
  validateSummarizeRequest,
  validateTaskPatch,
  validateTestDraft
} from '@shared/validate'
import { cancelAiRequest, testAiConnection } from './ai/client'
import { runCommand } from './ai/command'
import { summarizeTasks } from './ai/summary'
import { isSandbox } from './sandbox'
import type { SettingsService } from './settingsService'
import type { SettingsStore } from './store/settingsStore'
import type { TasksStore } from './store/tasksStore'

export type IpcDeps = {
  tasks: TasksStore
  settings: SettingsStore
  settingsService: SettingsService
  showMain: () => void
}

function invalidInput(message: string): Result<never> {
  return fail('INVALID_INPUT', message)
}

function handle<T>(
  channel: string,
  handler: (args: unknown, event: IpcMainInvokeEvent) => Result<T> | Promise<Result<T>>
): void {
  ipcMain.handle(channel, async (event, args: unknown) => {
    try {
      return await handler(args, event)
    } catch {
      return fail('IO', '操作失败，请稍后重试')
    }
  })
}

// 主窗口和悬浮窗各自持有一份任务列表：一边保存后，把合并后的新列表推给另一边。
function broadcastTasks(snapshot: TasksSnapshot, from: WebContents): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents === from) continue
    win.webContents.send(IPC.tasksChanged, snapshot)
  }
}

export function broadcastSettings(settings: PublicSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.settingsChanged, settings)
  }
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { tasks, settings, settingsService } = deps

  handle(IPC.tasksLoad, () => tasks.load())
  handle(IPC.tasksApply, (raw, event) => {
    const checked = validateTaskPatch(raw)
    if (!checked.ok) return invalidInput(checked.message)
    // apply 同步合并进内存，紧接着把合并后的列表推给其它窗口；发起方从返回值里拿。
    const applying = tasks.apply(checked.value)
    broadcastTasks(tasks.versioned(), event.sender)
    return applying
  })

  handle(IPC.settingsGet, () => settingsService.get())
  handle(IPC.settingsSave, (raw) => {
    const checked = validateSettingsPatch(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return settingsService.save(checked.value)
  })
  handle(IPC.settingsSetApiKey, (raw) => {
    const checked = validateApiKey(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return settingsService.setApiKey(checked.value)
  })
  handle(IPC.settingsClearApiKey, () => settingsService.clearApiKey())

  handle(IPC.aiCommand, async (raw) => {
    const checked = validateCommandRequest(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return runCommand(tasks, settings, checked.value)
  })
  handle(IPC.aiSummarize, async (raw) => {
    const checked = validateSummarizeRequest(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return summarizeTasks(tasks, settings, checked.value.requestId, 'summarize')
  })
  handle(IPC.aiTestConnection, async (raw) => {
    const checked = validateTestDraft(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return testAiConnection(settings, checked.value)
  })
  handle(IPC.aiCancel, (raw) => {
    const checked = validateRequestId(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return cancelAiRequest(checked.value)
  })

  handle(IPC.appShowMain, () => {
    deps.showMain()
    return ok(null)
  })

  ipcMain.on(IPC.appIsSandbox, (event: IpcMainEvent) => {
    event.returnValue = isSandbox
  })
}

export function sendSummaryShow(target: WebContents, summary: SummaryResult): void {
  target.send(IPC.summaryShow, summary)
}
