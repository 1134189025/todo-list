import type { Task } from './types'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const NO_TIME_SORT_KEY = '99:99'

type OpenGroup = 0 | 1 | 2

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function isDateKey(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isTimeKey(value: string): boolean {
  return TIME_PATTERN.test(value)
}

export function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

export function toDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function dateKeyFromIso(iso: string): string | null {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return toDateKey(new Date(time))
}

export function isOverdue(task: Task, today: string): boolean {
  return !task.done && task.dueDate !== null && task.dueDate < today
}

export function isInTodayList(task: Task, today: string): boolean {
  if (task.done) {
    const completedKey = task.completedAt === null ? null : dateKeyFromIso(task.completedAt)
    return completedKey === today || task.dueDate === today
  }
  return task.dueDate === null || task.dueDate <= today
}

export function isInLaterList(task: Task, today: string): boolean {
  return task.dueDate !== null && task.dueDate > today
}

export function sortOpenTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => compareOpenTasks(a, b, today))
}

export function sortLaterOpenTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(compareLaterOpenTasks)
}

export function todayProgress(tasks: Task[], today: string): { done: number; total: number } {
  const todayTasks = tasks.filter((task) => isInTodayList(task, today))
  return {
    done: todayTasks.filter((task) => task.done).length,
    total: todayTasks.length
  }
}

function openGroup(task: Task, today: string): OpenGroup {
  if (isOverdue(task, today)) return 0
  if (task.dueTime !== null) return 1
  return 2
}

function compareOpenTasks(a: Task, b: Task, today: string): number {
  const group = openGroup(a, today)
  const groupDiff = group - openGroup(b, today)
  if (groupDiff !== 0) return groupDiff
  if (group !== 2) {
    const dateDiff = compareText(a.dueDate ?? '', b.dueDate ?? '')
    if (dateDiff !== 0) return dateDiff
    const timeDiff = compareText(a.dueTime ?? NO_TIME_SORT_KEY, b.dueTime ?? NO_TIME_SORT_KEY)
    if (timeDiff !== 0) return timeDiff
  }
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

function compareLaterOpenTasks(a: Task, b: Task): number {
  const dateDiff = compareText(a.dueDate ?? '', b.dueDate ?? '')
  if (dateDiff !== 0) return dateDiff
  const timeDiff = compareText(a.dueTime ?? NO_TIME_SORT_KEY, b.dueTime ?? NO_TIME_SORT_KEY)
  if (timeDiff !== 0) return timeDiff
  return Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

function compareText(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}
