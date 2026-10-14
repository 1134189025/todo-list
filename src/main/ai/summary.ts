import type { Result, SummaryResult } from '@shared/api'
import { isInLaterList, isInTodayList, sortOpenTasks, toDateKey } from '@shared/dates'
import { fail, ok } from '@shared/result'
import { tasksFingerprint } from '@shared/fingerprint'
import type { Task } from '@shared/types'
import { isRecord } from '@shared/validate'
import type { SettingsStore } from '../store/settingsStore'
import type { TasksStore } from '../store/tasksStore'
import { completeChat, type SummaryKind } from './client'
import { extractJsonObject, truncateText } from './parse'
import { buildSummaryMessages } from './prompts'

const HEADLINE_MAX = 40
const OVERVIEW_MAX = 200
const REASON_MAX = 30
const UPCOMING_DAYS = 7
const MAX_PROMPT_TASKS = 150
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'

type ListName = 'today' | 'later'
type PromptTask = {
  id: string
  title: string
  list: ListName
  done: boolean
  date: string | null
  time: string | null
}

function toPromptTask(task: Task, list: ListName): PromptTask {
  return { id: task.id, title: task.title, list, done: task.done, date: task.dueDate, time: task.dueTime }
}

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? truncateText(value.trim(), max) : ''
}

// 只保留今天未完成里的 id，去重；没被提到的按本地排序补在最后，reason 为空。
function buildOrder(openToday: Task[], raw: unknown): SummaryResult['order'] {
  const allowed = new Set(openToday.map((task) => task.id))
  const seen = new Set<string>()
  const order: SummaryResult['order'] = []
  const entries: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const id = entry.id
    if (!allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push({ id, reason: readText(entry.reason, REASON_MAX) })
  }
  for (const task of openToday) {
    if (!seen.has(task.id)) order.push({ id: task.id, reason: '' })
  }
  return order
}

export async function summarizeTasks(
  tasks: TasksStore,
  settings: SettingsStore,
  requestId: string,
  kind: SummaryKind
): Promise<Result<SummaryResult>> {
  const now = new Date()
  const today = toDateKey(now)
  const snapshot = tasks.snapshot()
  const upcomingLimit = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_DAYS))

  const todayOpen = sortOpenTasks(
    snapshot.filter((task) => !task.done && isInTodayList(task, today)),
    today
  )
  const todayDone = snapshot.filter((task) => task.done && isInTodayList(task, today))
  const upcoming = snapshot.filter(
    (task) => !task.done && isInLaterList(task, today) && task.dueDate !== null && task.dueDate <= upcomingLimit
  )
  const promptTasks: PromptTask[] = [
    ...todayOpen.map((task) => toPromptTask(task, 'today')),
    ...todayDone.map((task) => toPromptTask(task, 'today')),
    ...upcoming.map((task) => toPromptTask(task, 'later'))
  ].slice(0, MAX_PROMPT_TASKS)

  const reply = await completeChat(
    settings,
    { kind, requestId },
    buildSummaryMessages(JSON.stringify({ today, tasks: promptTasks }), now)
  )
  if (!reply.ok) return reply
  const json = extractJsonObject(reply.data)
  if (!json.ok) return json

  const headline = readText(json.data.headline, HEADLINE_MAX)
  if (headline === '') return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  return ok({
    headline,
    overview: readText(json.data.overview, OVERVIEW_MAX),
    order: buildOrder(todayOpen, json.data.order),
    generatedAt: new Date().toISOString(),
    basedOnCount: promptTasks.length,
    tasksFingerprint: tasksFingerprint(snapshot)
  })
}
