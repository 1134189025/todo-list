import type { ParsedItem } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import { truncateTitle } from '@shared/text'
import { DEFAULT_URGENCY, type Category, type Task, type Urgency } from '@shared/types'
import { addDays, formatDayLabel } from './labels'
import { bookCategory, createTask, newCategoryBook } from './taskOps'

export type DraftItem = {
  key: string
  title: string
  date: string | null
  time: string | null
  /** 分类名（AI 写的）；null = 不归类。确认时才解析成分类。 */
  category: string | null
  /** 紧急度；AI 没写 = 普通。 */
  urgency: Urgency
  include: boolean
}

export type DraftPatch = Partial<Pick<DraftItem, 'title' | 'date' | 'time' | 'include' | 'category' | 'urgency'>>

export type DayPreset = 'today' | 'tomorrow' | 'dayAfter'

export function toDraftItem(item: ParsedItem): DraftItem {
  return {
    key: crypto.randomUUID(),
    title: item.title,
    date: item.date,
    time: item.date === null ? null : item.time,
    category: item.category,
    urgency: item.urgency ?? DEFAULT_URGENCY,
    include: true
  }
}

/** 确认卡片里能添加的条目：勾选且标题非空。 */
export function pickableItems(items: readonly DraftItem[]): DraftItem[] {
  return items.filter((item) => item.include && item.title.trim() !== '')
}

/**
 * 把确认后的条目变成任务：没有日期时时间也清空，标题过 truncateTitle。
 * categoryId 不传 = 未分类（分类名的解析见 draftsToTasks）。
 */
export function draftToTask(item: DraftItem, nowIso: string, categoryId: string | null = null): Task {
  const date = item.date !== null && isDateKey(item.date) ? item.date : null
  const time = date !== null && item.time !== null && isTimeKey(item.time) ? item.time : null
  return createTask(
    {
      title: truncateTitle(item.title.trim()),
      dueDate: date,
      dueTime: time,
      source: 'ai',
      urgency: item.urgency,
      categoryId
    },
    nowIso
  )
}

export type DraftTasks = {
  tasks: Task[]
  /** 改后的完整分类列表（含这次新建的）。 */
  categories: Category[]
  createdCategories: Category[]
  /** 因分类已满没能归类的条数。 */
  categoryFull: number
}

/**
 * 确认后的条目变成任务，并解析分类名：现有分类（不区分大小写）直接用；没有就新建，同一批里同名只建一个；
 * 已满 50 个时不建，这条待办不归类。
 */
export function draftsToTasks(items: readonly DraftItem[], categories: readonly Category[], nowIso: string): DraftTasks {
  const book = newCategoryBook(categories)
  const tasks = items.map((item) => {
    const category = item.category === null ? null : bookCategory(book, item.category, nowIso)
    return draftToTask(item, nowIso, category?.id ?? null)
  })
  return { tasks, categories: book.list, createdCategories: book.created, categoryFull: book.full }
}

/** 胶囊上的文字：今天 20:00 / 明天 15:00 / 10月18日 周日。 */
export function whenPillText(date: string | null, time: string | null, today: string): string {
  const day = formatDayLabel(date ?? today, today)
  return time === null ? day : `${day} ${time}`
}

export function presetDate(preset: DayPreset, today: string): string {
  const offset = preset === 'today' ? 0 : preset === 'tomorrow' ? 1 : 2
  return addDays(today, offset)
}

/** 给条目设时间：没有日期时补上今天，保证时间不会悬空。 */
export function patchTime(item: DraftItem, time: string | null, today: string): DraftPatch {
  return { date: item.date ?? today, time }
}
