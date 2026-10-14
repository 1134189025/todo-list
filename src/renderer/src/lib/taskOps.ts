import type { Task, TaskSource } from '@shared/types'

export type NewTaskFields = {
  title: string
  dueDate: string | null
  dueTime: string | null
  source: TaskSource
}

/** 新建一条未完成的任务。调用方负责把标题过一遍 truncateTitle。 */
export function createTask(fields: NewTaskFields, nowIso: string): Task {
  return {
    id: crypto.randomUUID(),
    title: fields.title,
    done: false,
    dueDate: fields.dueDate,
    dueTime: fields.dueTime,
    createdAt: nowIso,
    completedAt: null,
    source: fields.source
  }
}

/** 直接添加的待办：没有日期（算今天）、没有时间、手动来源。 */
export function createTodayTask(title: string, nowIso: string): Task {
  return createTask({ title, dueDate: null, dueTime: null, source: 'manual' }, nowIso)
}

export function toggleDone(task: Task, nowIso: string): Task {
  if (task.done) return { ...task, done: false, completedAt: null }
  return { ...task, done: true, completedAt: nowIso }
}

/** 撤销添加：从当前列表去掉这次加的那几条。 */
export function withoutIds(tasks: readonly Task[], ids: ReadonlySet<string>): Task[] {
  return tasks.filter((task) => !ids.has(task.id))
}

/** 撤销删除：按原来的位置放回。位置超出当前长度就放最后；已经存在同 id 就不重复放。 */
export function restoreAt(tasks: readonly Task[], task: Task, index: number): Task[] {
  if (tasks.some((existing) => existing.id === task.id)) return [...tasks]
  const next = [...tasks]
  next.splice(Math.min(Math.max(index, 0), next.length), 0, task)
  return next
}
