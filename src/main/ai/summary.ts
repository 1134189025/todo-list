import type { Result, SummaryResult } from '@shared/api'
import { isInLaterList, isInTodayList, isOverdue, sortLaterOpenTasks, sortOpenTasks, toDateKey } from '@shared/dates'
import { fail, ok } from '@shared/result'
import { tasksFingerprint } from '@shared/fingerprint'
import type { Task } from '@shared/types'
import { isRecord } from '@shared/validate'
import type { SettingsStore } from '../store/settingsStore'
import type { TasksStore } from '../store/tasksStore'
import { completeChat, type SummaryKind } from './client'
import { extractJsonObject, truncateText } from './parse'
import { buildSummaryMessages } from './prompts'
import { quoted, readNumber, shortDate } from './taskText'

const HEADLINE_MAX = 40
const OVERVIEW_MAX = 200
const REASON_MAX = 30
const UPCOMING_DAYS = 7
const MAX_OPEN_TASKS = 100
const MAX_DONE_TASKS = 30
const MAX_UPCOMING_TASKS = 20
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'

// openToday 是今天全部未完成（排好序）；提示词里只编号前 MAX_OPEN_TASKS 条。
type PromptData = { text: string; count: number; openToday: Task[] }

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? truncateText(value.trim(), max) : ''
}

function openTodayLine(task: Task, index: number, today: string): string {
  const notes: string[] = []
  if (isOverdue(task, today) && task.dueDate !== null) notes.push(`已过期 ${shortDate(task.dueDate)}`)
  if (task.dueTime !== null) notes.push(task.dueTime)
  const suffix = notes.length === 0 ? '' : `（${notes.join(' ')}）`
  return `${index + 1}. ${quoted(task.title)}${suffix}`
}

function upcomingItem(task: Task): string {
  const when = [task.dueDate === null ? '' : shortDate(task.dueDate), task.dueTime ?? ''].filter(Boolean).join(' ')
  return `${when} ${quoted(task.title)}`
}

// 用紧凑的纯文本代替 JSON：今天未完成用 1、2、3 编号（AI 只回编号，比回完整 id 短得多），
// 已完成和之后的只列标题，不需要编号。
function buildPromptData(snapshot: Task[], now: Date): PromptData {
  const today = toDateKey(now)
  const upcomingLimit = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_DAYS))
  const openToday = sortOpenTasks(
    snapshot.filter((task) => !task.done && isInTodayList(task, today)),
    today
  )
  const numbered = openToday.slice(0, MAX_OPEN_TASKS)
  const doneToday = snapshot.filter((task) => task.done && isInTodayList(task, today)).slice(0, MAX_DONE_TASKS)
  const upcoming = sortLaterOpenTasks(
    snapshot.filter(
      (task) => !task.done && isInLaterList(task, today) && task.dueDate !== null && task.dueDate <= upcomingLimit
    )
  ).slice(0, MAX_UPCOMING_TASKS)

  const lines = [
    '今天未完成：',
    ...(numbered.length === 0 ? ['无'] : numbered.map((task, index) => openTodayLine(task, index, today))),
    `今天已完成：${doneToday.length === 0 ? '无' : doneToday.map((task) => quoted(task.title)).join('；')}`,
    `之后 ${UPCOMING_DAYS} 天：${upcoming.length === 0 ? '无' : upcoming.map(upcomingItem).join('；')}`
  ]
  return { text: lines.join('\n'), count: numbered.length + doneToday.length + upcoming.length, openToday }
}

// AI 回的是编号：只认今天未完成里的编号，去重；没被提到的按本地排序补在最后，reason 为空。
function buildOrder(openToday: Task[], raw: unknown): SummaryResult['order'] {
  const seen = new Set<string>()
  const order: SummaryResult['order'] = []
  const entries: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const number = readNumber(entry.id)
    if (number === null || number > MAX_OPEN_TASKS) continue
    const task = openToday[number - 1]
    if (task === undefined || seen.has(task.id)) continue
    seen.add(task.id)
    order.push({ id: task.id, reason: readText(entry.reason, REASON_MAX) })
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
  const snapshot = tasks.snapshot()
  const prompt = buildPromptData(snapshot, now)

  const reply = await completeChat(settings, { kind, requestId }, buildSummaryMessages(prompt.text, now))
  if (!reply.ok) return reply
  const json = extractJsonObject(reply.data)
  if (!json.ok) return json

  const headline = readText(json.data.headline, HEADLINE_MAX)
  if (headline === '') return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  return ok({
    headline,
    overview: readText(json.data.overview, OVERVIEW_MAX),
    order: buildOrder(prompt.openToday, json.data.order),
    generatedAt: new Date().toISOString(),
    basedOnCount: prompt.count,
    tasksFingerprint: tasksFingerprint(snapshot)
  })
}
