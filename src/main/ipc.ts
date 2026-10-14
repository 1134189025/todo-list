import { ipcMain, type IpcMainEvent, type WebContents } from 'electron'
import { IPC, type Result, type SummaryResult } from '@shared/api'
import { fail, ok } from '@shared/result'
import {
  validateApiKey,
  validateParseRequest,
  validateRequestId,
  validateSettingsPatch,
  validateSummarizeRequest,
  validateTaskList,
  validateTestDraft
} from '@shared/validate'
import { cancelAiRequest, testAiConnection } from './ai/client'
import { parseTasksText } from './ai/parse'
import { summarizeTasks } from './ai/summary'
import type { HotkeyManager } from './hotkey'
import { isSandbox } from './sandbox'
import { saveSettings } from './settingsService'
import type { SettingsStore } from './store/settingsStore'
import type { TasksStore } from './store/tasksStore'

export type IpcDeps = {
  tasks: TasksStore
  settings: SettingsStore
  hotkey: HotkeyManager
}

function invalidInput(message: string): Result<never> {
  return fail('INVALID_INPUT', message)
}

function handle<T>(channel: string, handler: (args: unknown) => Result<T> | Promise<Result<T>>): void {
  ipcMain.handle(channel, async (_event, args: unknown) => {
    try {
      return await handler(args)
    } catch {
      return fail('IO', '操作失败，请稍后重试')
    }
  })
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { tasks, settings, hotkey } = deps

  handle(IPC.tasksLoad, () => tasks.load())
  handle(IPC.tasksSave, (raw) => {
    const checked = validateTaskList(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return tasks.save(checked.value)
  })

  handle(IPC.settingsGet, () => ok(settings.toPublic()))
  handle(IPC.settingsSave, (raw) => {
    const checked = validateSettingsPatch(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return saveSettings(settings, hotkey, checked.value)
  })
  handle(IPC.settingsSetApiKey, (raw) => {
    const checked = validateApiKey(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return settings.setApiKey(checked.value)
  })
  handle(IPC.settingsClearApiKey, () => settings.clearApiKey())

  handle(IPC.aiParse, async (raw) => {
    const checked = validateParseRequest(raw)
    if (!checked.ok) return invalidInput(checked.message)
    return parseTasksText(settings, checked.value)
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

  ipcMain.on(IPC.appIsSandbox, (event: IpcMainEvent) => {
    event.returnValue = isSandbox
  })
}

export function sendSummaryShow(target: WebContents, summary: SummaryResult): void {
  target.send(IPC.summaryShow, summary)
}
