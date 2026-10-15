import { randomUUID } from 'node:crypto'
import { Notification, type BrowserWindow } from 'electron'
import type { SummaryResult } from '@shared/api'
import { toDateKey } from '@shared/dates'
import { isAiConfigured } from './ai/client'
import { summarizeTasks } from './ai/summary'
import { sendSummaryShow } from './ipc'
import { isSandbox } from './sandbox'
import type { SettingsStore } from './store/settingsStore'
import type { TasksStore } from './store/tasksStore'

const CHECK_INTERVAL_MS = 30_000
const NOTIFICATION_TITLE = '今日总结'

export type SchedulerDeps = {
  tasks: TasksStore
  settings: SettingsStore
  getWindow: () => BrowserWindow | null
}

export type Scheduler = { stop(): void }

function timeOnDay(day: Date, time: string): Date {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0)
}

// 只在「上次检查之后、到达今天的设定时间点」时触发；应用在设定时间之后才启动不补跑，改设定时间也不会立刻触发。
function isDue(lastTick: Date, now: Date, time: string): boolean {
  const scheduled = timeOnDay(now, time)
  return lastTick < scheduled && scheduled <= now
}

function liveWindow(deps: SchedulerDeps): BrowserWindow | null {
  const win = deps.getWindow()
  return win === null || win.isDestroyed() ? null : win
}

// 通知对象必须保持引用，否则可能被回收，点击就没反应。新通知替换旧的；点击、关闭或失败后释放。
let activeNotification: Notification | null = null

function publish(deps: SchedulerDeps, summary: SummaryResult): void {
  const win = liveWindow(deps)
  if (win !== null) sendSummaryShow(win.webContents, summary)
  if (isSandbox || !Notification.isSupported()) return
  const notification = new Notification({ title: NOTIFICATION_TITLE, body: summary.headline })
  const release = (): void => {
    if (activeNotification === notification) activeNotification = null
  }
  activeNotification = notification
  notification.on('click', () => {
    release()
    const target = liveWindow(deps)
    if (target === null) return
    if (target.isMinimized()) target.restore()
    target.show()
    target.focus()
    sendSummaryShow(target.webContents, summary)
  })
  notification.on('close', release)
  notification.on('failed', release)
  notification.show()
}

export function startScheduler(deps: SchedulerDeps): Scheduler {
  let lastTick = new Date()
  let triggeredDate: string | null = null

  async function tick(): Promise<void> {
    const previous = lastTick
    const now = new Date()
    lastTick = now
    const { autoSummary } = deps.settings.toPublic()
    if (!autoSummary.enabled || !isDue(previous, now, autoSummary.time)) return
    const today = toDateKey(now)
    if (triggeredDate === today || deps.settings.getLastAutoSummaryDate() === today) return
    if (!isAiConfigured(deps.settings)) return
    triggeredDate = today
    await deps.settings.setLastAutoSummaryDate(today)
    const result = await summarizeTasks(deps.tasks, deps.settings, randomUUID(), 'auto-summary', null)
    if (result.ok) publish(deps, result.data)
  }

  const timer = setInterval(() => {
    tick().catch(() => undefined)
  }, CHECK_INTERVAL_MS)
  return {
    stop(): void {
      clearInterval(timer)
    }
  }
}
