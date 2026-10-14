import type { AiAction } from '@shared/api'
import { truncateTitle } from '@shared/text'
import type { Task } from '@shared/types'
import { whenPillText } from './aiDraft'

/** 不用确认、直接执行的操作；新建和删除要在确认卡片里点「执行」。 */
export type DirectAction = Exclude<AiAction, { op: 'add' } | { op: 'delete' }>

/** 一次直接执行改了哪条任务、改之前和之后的样子，撤销时只把改过的字段改回去。 */
export type TaskChange = { op: DirectAction['op']; before: Task; after: Task }

/** 确认卡片里待确认的删除。 */
export type DeleteDraft = { key: string; taskId: string; title: string; include: boolean }

const CHANGE_FIELDS = ['title', 'done', 'dueDate', 'dueTime', 'completedAt'] as const

// 撤销时成组处理的字段：完成状态和完成时间、日期和时间要一起改回去，不能只改回一半，
// 否则会出现「未完成却有完成时间」「没日期却有时间」这样的任务。
const FIELD_GROUPS: readonly (readonly (typeof CHANGE_FIELDS)[number][])[] = [
  ['title'],
  ['done', 'completedAt'],
  ['dueDate', 'dueTime']
]

export function isDirectAction(action: AiAction): action is DirectAction {
  return action.op !== 'add' && action.op !== 'delete'
}

function reschedule(task: Task, action: Extract<AiAction, { op: 'reschedule' }>, today: string): Task {
  let date = action.date === undefined ? task.dueDate : action.date
  let time = action.time === undefined ? task.dueTime : action.time
  if (date === null) {
    // 只给了时间、任务本来没定日期：算今天的这个时间；改成不定日期时去掉时间。
    if (action.date === undefined && action.time !== undefined && action.time !== null) date = today
    else time = null
  }
  return { ...task, dueDate: date, dueTime: time }
}

function applyOne(task: Task, action: DirectAction, nowIso: string, today: string): Task {
  switch (action.op) {
    case 'complete':
      return task.done ? task : { ...task, done: true, completedAt: nowIso }
    case 'reopen':
      return task.done ? { ...task, done: false, completedAt: null } : task
    case 'reschedule':
      return reschedule(task, action, today)
    case 'rename': {
      const title = truncateTitle(action.title)
      return title === '' ? task : { ...task, title }
    }
  }
}

function sameFields(a: Task, b: Task): boolean {
  return CHANGE_FIELDS.every((field) => a[field] === b[field])
}

/** 在当前列表上执行直接操作；任务已不存在或操作后没变化的跳过。 */
export function applyDirectActions(
  tasks: readonly Task[],
  actions: readonly DirectAction[],
  nowIso: string,
  today: string
): { next: Task[]; changes: TaskChange[] } {
  const next = [...tasks]
  const changes: TaskChange[] = []
  for (const action of actions) {
    const index = next.findIndex((task) => task.id === action.id)
    const before = next[index]
    if (before === undefined) continue
    const after = applyOne(before, action, nowIso, today)
    if (sameFields(before, after)) continue
    next[index] = after
    changes.push({ op: action.op, before, after })
  }
  return { next, changes }
}

/** 撤销直接操作：倒着改回去。按字段组处理：这次动过、且整组之后都没被别处改过的才改回去。 */
export function revertChanges(tasks: readonly Task[], changes: readonly TaskChange[]): Task[] {
  const next = [...tasks]
  for (const change of [...changes].reverse()) {
    const index = next.findIndex((task) => task.id === change.before.id)
    const current = next[index]
    if (current === undefined) continue
    const restored: Task = { ...current }
    for (const group of FIELD_GROUPS) {
      const touched = group.some((field) => change.before[field] !== change.after[field])
      const untouchedSince = group.every((field) => current[field] === change.after[field])
      if (!touched || !untouchedSince) continue
      for (const field of group) Object.assign(restored, { [field]: change.before[field] })
    }
    next[index] = restored
  }
  return next
}

const OP_LABELS: Record<DirectAction['op'], string> = {
  complete: '完成',
  reopen: '取消完成',
  reschedule: '改时间',
  rename: '改标题'
}

/** 提示条上的文字：一项时说清楚改了什么，多项时按类别计数。 */
export function changesMessage(changes: readonly TaskChange[], today: string): string {
  const [only] = changes
  if (changes.length === 1 && only !== undefined) {
    const title = `「${only.before.title}」`
    switch (only.op) {
      case 'complete':
        return `已完成${title}`
      case 'reopen':
        return `已取消完成${title}`
      case 'reschedule':
        return `已把${title}改到${whenPillText(only.after.dueDate, only.after.dueTime, today)}`
      case 'rename':
        return `已把${title}改成「${only.after.title}」`
    }
  }
  const counts = new Map<string, number>()
  for (const change of changes) counts.set(OP_LABELS[change.op], (counts.get(OP_LABELS[change.op]) ?? 0) + 1)
  const parts = [...counts].map(([label, count]) => `${label} ${count}`)
  return `已处理 ${changes.length} 项：${parts.join('、')}`
}

export function toDeleteDraft(taskId: string, tasks: readonly Task[]): DeleteDraft | null {
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (task === undefined) return null
  return { key: crypto.randomUUID(), taskId, title: task.title, include: true }
}

/** 删除：记下每条在列表里的位置，撤销时按原位置放回。 */
export function removeTasks(
  tasks: readonly Task[],
  ids: ReadonlySet<string>
): { next: Task[]; removed: { task: Task; index: number }[] } {
  const removed: { task: Task; index: number }[] = []
  tasks.forEach((task, index) => {
    if (ids.has(task.id)) removed.push({ task, index })
  })
  return { next: tasks.filter((task) => !ids.has(task.id)), removed }
}
