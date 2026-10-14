import type { AiAction, AiCommandResult, CommandInput, Result } from '@shared/api'
import {
  isDateKey,
  isInLaterList,
  isInTodayList,
  isOverdue,
  isTimeKey,
  sortLaterOpenTasks,
  sortOpenTasks,
  toDateKey
} from '@shared/dates'
import { fail, ok } from '@shared/result'
import { truncateTitle } from '@shared/text'
import type { Task } from '@shared/types'
import { isRecord } from '@shared/validate'
import type { SettingsStore } from '../store/settingsStore'
import type { TasksStore } from '../store/tasksStore'
import { completeChat } from './client'
import { extractJsonObject, sanitizeItem, truncateText } from './parse'
import { buildCommandMessages, COMMAND_ACTION_LIMIT, HEARD_MAX } from './prompts'
import { oneLine, quoted, readNumber, shortDate } from './taskText'

const MAX_OPEN_LISTED = 100
const MAX_DONE_LISTED = 20
const MAX_UNMATCHED = 5
const UNMATCHED_MAX = 30
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'

// 发给 AI 的现有待办：先今天未完成、再之后未完成、最后今天已完成（给「取消完成」用），按编号 1、2、3 列出。
function listCandidates(snapshot: Task[], today: string): Task[] {
  const openToday = sortOpenTasks(
    snapshot.filter((task) => !task.done && isInTodayList(task, today)),
    today
  )
  const openLater = sortLaterOpenTasks(snapshot.filter((task) => !task.done && isInLaterList(task, today)))
  const doneToday = snapshot.filter((task) => task.done && isInTodayList(task, today)).slice(0, MAX_DONE_LISTED)
  return [...[...openToday, ...openLater].slice(0, MAX_OPEN_LISTED), ...doneToday]
}

function describe(task: Task, today: string): string {
  if (task.done) return '已完成'
  const time = task.dueTime === null ? '' : ` ${task.dueTime}`
  if (task.dueDate === null) return '今天，未定日期'
  if (isOverdue(task, today)) return `已过期 ${shortDate(task.dueDate)}${time}`
  if (task.dueDate === today) return `今天${time}`
  return `${shortDate(task.dueDate)}${time}`
}

function candidatesText(candidates: Task[], today: string): string {
  if (candidates.length === 0) return '无'
  return candidates.map((task, index) => `${index + 1}. ${quoted(task.title)}（${describe(task, today)}）`).join('\n')
}

// reschedule 的一个字段：没写 = 不改（undefined）；null = 清掉；格式不对也当没写。
function readField(entry: Record<string, unknown>, key: 'date' | 'time'): string | null | undefined {
  if (!(key in entry)) return undefined
  const value = entry[key]
  if (value === null) return null
  const check = key === 'date' ? isDateKey : isTimeKey
  return typeof value === 'string' && check(value.trim()) ? value.trim() : undefined
}

function toTaskAction(entry: Record<string, unknown>, task: Task): AiAction | null {
  switch (entry.op) {
    case 'complete':
      return task.done ? null : { op: 'complete', id: task.id }
    case 'reopen':
      return task.done ? { op: 'reopen', id: task.id } : null
    case 'delete':
      return { op: 'delete', id: task.id }
    case 'rename': {
      const title = typeof entry.title === 'string' ? truncateTitle(entry.title) : ''
      return title === '' || title === task.title ? null : { op: 'rename', id: task.id, title }
    }
    case 'reschedule': {
      const date = readField(entry, 'date')
      const time = readField(entry, 'time')
      if (date === undefined && time === undefined) return null
      const action: Extract<AiAction, { op: 'reschedule' }> = { op: 'reschedule', id: task.id }
      if (date !== undefined) action.date = date
      if (time !== undefined) action.time = time
      return action
    }
    default:
      return null
  }
}

// 逐项校验：编号必须在列表里，操作要对得上任务状态（已完成的不能再完成），同一任务同一操作只留第一次。
function readActions(reply: Record<string, unknown>, candidates: Task[]): Result<Omit<AiCommandResult, 'heard'>> {
  const raw: unknown = reply.actions
  if (!Array.isArray(raw)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const entries: unknown[] = raw
  const actions: AiAction[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const entry of entries.slice(0, COMMAND_ACTION_LIMIT)) {
    if (!isRecord(entry)) continue
    if (entry.op === 'unknown') {
      const text = typeof entry.text === 'string' ? truncateText(oneLine(entry.text), UNMATCHED_MAX) : ''
      if (text !== '' && unmatched.length < MAX_UNMATCHED && !unmatched.includes(text)) unmatched.push(text)
      continue
    }
    if (entry.op === 'add') {
      const item = sanitizeItem(entry)
      if (item !== null) actions.push({ op: 'add', item })
      continue
    }
    const number = readNumber(entry.id)
    const task = number === null ? undefined : candidates[number - 1]
    if (task === undefined) continue
    const action = toTaskAction(entry, task)
    if (action === null || action.op === 'add') continue
    const key = `${action.op}:${action.id}`
    if (seen.has(key)) continue
    seen.add(key)
    actions.push(action)
  }
  return ok({ actions, unmatched })
}

// 语音输入时 AI 听写出的原话；压成一行、截断，空的当没听清。
function readHeard(reply: Record<string, unknown>): string | null {
  if (typeof reply.heard !== 'string') return null
  const heard = truncateText(oneLine(reply.heard), HEARD_MAX)
  return heard === '' ? null : heard
}

export async function runCommand(
  tasks: TasksStore,
  settings: SettingsStore,
  request: { requestId: string; input: CommandInput }
): Promise<Result<AiCommandResult>> {
  const now = new Date()
  const candidates = listCandidates(tasks.snapshot(), toDateKey(now))
  const reply = await completeChat(
    settings,
    { kind: 'command', requestId: request.requestId },
    buildCommandMessages(candidatesText(candidates, toDateKey(now)), request.input, now)
  )
  if (!reply.ok) return reply
  const json = extractJsonObject(reply.data)
  if (!json.ok) return json
  const actions = readActions(json.data, candidates)
  if (!actions.ok) return actions
  return ok({ ...actions.data, heard: request.input.kind === 'audio' ? readHeard(json.data) : null })
}
