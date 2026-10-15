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
import { sameCategoryName, truncateTitle } from '@shared/text'
import type { Category, Task } from '@shared/types'
import { isRecord } from '@shared/validate'
import type { SettingsStore } from '../store/settingsStore'
import type { TasksStore } from '../store/tasksStore'
import { completeChat } from './client'
import { extractJsonObject, readCategoryName, readUrgency, sanitizeItem, truncateText } from './parse'
import { buildCommandMessages, COMMAND_ACTION_LIMIT, HEARD_MAX, REPLY_MAX } from './prompts'
import { oneLine, quoted, readNumber, shortDate, taskFlags } from './taskText'

const MAX_OPEN_LISTED = 100
const MAX_DONE_LISTED = 20
const MAX_UNMATCHED = 5
const UNMATCHED_MAX = 30
const BAD_REPLY_MESSAGE = 'AI 的回复里没有操作列表，再试一次'

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

function whenText(task: Task, today: string): string {
  if (task.done) return '已完成'
  const time = task.dueTime === null ? '' : ` ${task.dueTime}`
  if (task.dueDate === null) return '今天，未定日期'
  if (isOverdue(task, today)) return `已过期 ${shortDate(task.dueDate)}${time}`
  if (task.dueDate === today) return `今天${time}`
  return `${shortDate(task.dueDate)}${time}`
}

function categoryNames(categories: readonly Category[]): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.name]))
}

// 一条待办的说明：时间、紧急度（普通不写）、进行中、分类（没有或指向不存在的分类就不写）。
function describe(task: Task, today: string, names: ReadonlyMap<string, string>): string {
  const parts = [whenText(task, today), ...taskFlags(task)]
  const category = task.categoryId === null ? undefined : names.get(task.categoryId)
  if (category !== undefined) parts.push(`分类${quoted(category)}`)
  return parts.join('，')
}

function candidatesText(candidates: Task[], names: ReadonlyMap<string, string>, today: string): string {
  if (candidates.length === 0) return '无'
  return candidates
    .map((task, index) => `${index + 1}. ${quoted(task.title)}（${describe(task, today, names)}）`)
    .join('\n')
}

// 「现有分类」那一行：没有分类时写「无」。分类名也用引号括起来，和标题一样只是数据。
function categoriesText(categories: readonly Category[]): string {
  if (categories.length === 0) return '现有分类：无'
  return `现有分类：${categories.map((category) => quoted(category.name)).join('、')}`
}

// reschedule 的一个字段：没写 = 不改（undefined）；null = 清掉；格式不对也当没写。
function readField(entry: Record<string, unknown>, key: 'date' | 'time'): string | null | undefined {
  if (!(key in entry)) return undefined
  const value = entry[key]
  if (value === null) return null
  const check = key === 'date' ? isDateKey : isTimeKey
  return typeof value === 'string' && check(value.trim()) ? value.trim() : undefined
}

// 分类改动：category 为 null = 移出分类（任务本来就没有分类时不做）；分类名没写、或和任务现在的分类同名时不做。
function toCategorize(entry: Record<string, unknown>, task: Task, names: ReadonlyMap<string, string>): AiAction | null {
  const current = task.categoryId === null ? null : (names.get(task.categoryId) ?? null)
  if (entry.category === null) return current === null ? null : { op: 'categorize', id: task.id, category: null }
  const name = readCategoryName(entry.category)
  if (name === null || (current !== null && sameCategoryName(current, name))) return null
  return { op: 'categorize', id: task.id, category: name }
}

function toTaskAction(entry: Record<string, unknown>, task: Task, names: ReadonlyMap<string, string>): AiAction | null {
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
    case 'categorize':
      return toCategorize(entry, task, names)
    case 'urgency': {
      const level = readUrgency(entry.level)
      return level === null || level === task.urgency ? null : { op: 'urgency', id: task.id, level }
    }
    case 'start':
      return task.done || task.inProgress ? null : { op: 'start', id: task.id }
    case 'pause':
      return task.inProgress ? { op: 'pause', id: task.id } : null
    default:
      return null
  }
}

// 逐项校验：编号必须在列表里，操作要对得上任务状态（已完成的不能再完成），同一任务同一操作只留第一次。
function readActions(
  reply: Record<string, unknown>,
  candidates: Task[],
  categories: readonly Category[]
): Result<Omit<AiCommandResult, 'heard' | 'reply'>> {
  const raw: unknown = reply.actions
  if (!Array.isArray(raw)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const entries: unknown[] = raw
  const names = categoryNames(categories)
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
    if (entry.op === 'create_category') {
      // 同名分类已存在就不建；同一次结果里同名只留一个（不区分大小写）。
      const name = readCategoryName(entry.name)
      if (name === null || categories.some((category) => sameCategoryName(category.name, name))) continue
      const key = `createCategory:${name.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      actions.push({ op: 'createCategory', name })
      continue
    }
    const number = readNumber(entry.id)
    const task = number === null ? undefined : candidates[number - 1]
    if (task === undefined) continue
    const action = toTaskAction(entry, task, names)
    if (action === null || action.op === 'add' || action.op === 'createCategory') continue
    const key = `${action.op}:${action.id}`
    if (seen.has(key)) continue
    seen.add(key)
    actions.push(action)
  }
  return ok({ actions, unmatched })
}

// 看不见的字符一律去掉：格式字符（\p{Cf}，方向控制符会把引语整段镜像，零宽空格、标签字符会藏字）
// 和默认可忽略的字符（\p{Default_Ignorable_Code_Point}：变体选择符、组合字形连接符、韩文填充字符等，
// 夹在字中间看不出来，一串就能藏数据）。
// 只留组合 emoji 要用的：真有的三面地区旗（英格兰、苏格兰、威尔士）的整段标签、两个 emoji 之间的零宽连接符，
// 紧跟在图形 emoji（\p{Extended_Pictographic}，含 ©、™、☀ 这类）后面的一个 FE0E / FE0F（表情和文字两种样子），
// 以及 keycap（0–9 # * 后面 FE0F 再接 U+20E3）里的 FE0F。
// 跟在汉字、普通数字、空格后面或连着好几个的都去掉：逐字夹一个也能藏数据。剩下的每一位都要一个看得见的 emoji 来带。
const HIDDEN_CHARS =
  /(\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F})|((?<=[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}])\u{200D}(?=\p{Extended_Pictographic}))|((?<=\p{Extended_Pictographic})[\u{FE0E}\u{FE0F}]|(?<=[0-9#*])\u{FE0F}(?=\u{20E3}))|[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu
// 盲文空白看起来是空格、却不算空白字符：只有它时也当没听清。
const BRAILLE_BLANK = /\u{2800}/gu
const VISIBLE_CHAR = /[\p{L}\p{N}\p{P}\p{S}]/u

function stripHidden(text: string): string {
  return text.replace(HIDDEN_CHARS, (char, flag?: string, joiner?: string, presentation?: string) =>
    flag !== undefined || joiner !== undefined || presentation !== undefined ? char : ''
  )
}

// AI 写给人看的一段文字（听写的原话、助理回复）：去掉看不见的字符，其它控制字符当空格，压成一行、截断。
// 没有一个看得见的字（字母、数字、标点、符号）就当没有。
function readVisibleText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = truncateText(oneLine(stripHidden(value).replace(/\p{Cc}/gu, ' ')), max)
  return VISIBLE_CHAR.test(text.replace(BRAILLE_BLANK, '')) ? text : null
}

export async function runCommand(
  tasks: TasksStore,
  settings: SettingsStore,
  request: { requestId: string; input: CommandInput },
  owner: number | null
): Promise<Result<AiCommandResult>> {
  const now = new Date()
  const today = toDateKey(now)
  const { tasks: snapshot, categories } = tasks.state()
  const candidates = listCandidates(snapshot, today)
  const names = categoryNames(categories)
  const reply = await completeChat(
    settings,
    { kind: 'command', requestId: request.requestId, owner },
    buildCommandMessages(candidatesText(candidates, names, today), categoriesText(categories), request.input, now)
  )
  if (!reply.ok) return reply
  const json = extractJsonObject(reply.data, (data) => Array.isArray(data.actions))
  if (!json.ok) return json
  const actions = readActions(json.data, candidates, categories)
  if (!actions.ok) return actions
  return ok({
    ...actions.data,
    heard: request.input.kind === 'audio' ? readVisibleText(json.data.heard, HEARD_MAX) : null,
    reply: readVisibleText(json.data.reply, REPLY_MAX)
  })
}
