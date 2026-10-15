import { toDateKey } from '@shared/dates'
import type { Task, Urgency } from '@shared/types'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const SHORT_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 紧急度的说法：紧急 / 普通 / 不急。 */
export const URGENCY_TEXT: Record<Urgency, string> = { high: '紧急', normal: '普通', low: '不急' }

export type WhenLabel = { kind: 'time' | 'date' | 'overdue'; text: string }

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`)
}

function weekdayName(date: Date, names: readonly string[]): string {
  return names[date.getDay()] ?? ''
}

function monthDay(dateKey: string): string {
  const date = parseDateKey(dateKey)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function formatHeaderDate(today: string): string {
  return `${monthDay(today)} · ${weekdayName(parseDateKey(today), WEEKDAYS)}`
}

function formatLaterDay(dateKey: string, today: string): string {
  if (dateKey === addDays(today, 1)) return '明天'
  if (dateKey === addDays(today, 2)) return '后天'
  return `${monthDay(dateKey)} ${weekdayName(parseDateKey(dateKey), SHORT_WEEKDAYS)}`
}

/** 任务行上的时间标签；已完成的任务和今天没有时间的任务不显示。 */
export function formatTaskWhen(task: Task, today: string): WhenLabel | null {
  if (task.done || task.dueDate === null) return null
  if (task.dueDate < today) return { kind: 'overdue', text: `${monthDay(task.dueDate)} · 已过期` }
  if (task.dueDate === today) {
    return task.dueTime === null ? null : { kind: 'time', text: task.dueTime }
  }
  const day = formatLaterDay(task.dueDate, today)
  return { kind: 'date', text: task.dueTime === null ? day : `${day} ${task.dueTime}` }
}

/** 日期胶囊用的说法：今天 / 明天 / 后天 / 10月18日 周日。 */
export function formatDayLabel(dateKey: string, today: string): string {
  return dateKey === today ? '今天' : formatLaterDay(dateKey, today)
}

/** HH:mm，按本地时间，用于「基于 N 件待办 · HH:mm 生成」。 */
export function formatClock(iso: string): string {
  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
