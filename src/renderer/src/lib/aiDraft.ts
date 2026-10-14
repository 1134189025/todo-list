import type { ParsedItem } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import type { Task } from '@shared/types'
import { truncateTitle } from '@shared/text'
import { addDays, formatDayLabel } from './labels'
import { createTask } from './taskOps'

export type DraftItem = {
  key: string
  title: string
  date: string | null
  time: string | null
  include: boolean
}

export type DraftPatch = Partial<Pick<DraftItem, 'title' | 'date' | 'time' | 'include'>>

export type DayPreset = 'today' | 'tomorrow' | 'dayAfter'

export function toDraftItem(item: ParsedItem): DraftItem {
  return {
    key: crypto.randomUUID(),
    title: item.title,
    date: item.date,
    time: item.date === null ? null : item.time,
    include: true
  }
}

/** 确认卡片里能添加的条目：勾选且标题非空。 */
export function pickableItems(items: readonly DraftItem[]): DraftItem[] {
  return items.filter((item) => item.include && item.title.trim() !== '')
}

/** 把确认后的条目变成任务：没有日期时时间也清空，标题过 truncateTitle。 */
export function draftToTask(item: DraftItem, nowIso: string): Task {
  const date = item.date !== null && isDateKey(item.date) ? item.date : null
  const time = date !== null && item.time !== null && isTimeKey(item.time) ? item.time : null
  return createTask(
    { title: truncateTitle(item.title.trim()), dueDate: date, dueTime: time, source: 'ai' },
    nowIso
  )
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
