import { normalizeCategoryName, sameCategoryName } from '@shared/text'
import { CATEGORY_LIMIT, DEFAULT_URGENCY, type Category, type Task, type TaskSource, type Urgency } from '@shared/types'

export type NewTaskFields = {
  title: string
  dueDate: string | null
  dueTime: string | null
  source: TaskSource
  urgency?: Urgency          // 不传 = 普通
  categoryId?: string | null // 不传 = 未分类
}

/** 新建一条未完成的任务；进行中恒为 false。调用方负责把标题过一遍 truncateTitle。 */
export function createTask(fields: NewTaskFields, nowIso: string): Task {
  return {
    id: crypto.randomUUID(),
    title: fields.title,
    done: false,
    dueDate: fields.dueDate,
    dueTime: fields.dueTime,
    createdAt: nowIso,
    completedAt: null,
    source: fields.source,
    urgency: fields.urgency ?? DEFAULT_URGENCY,
    inProgress: false,
    categoryId: fields.categoryId ?? null
  }
}

/** 直接添加的待办：没有日期（算今天）、没有时间、手动来源、普通紧急度、未分类。 */
export function createTodayTask(title: string, nowIso: string): Task {
  return createTask({ title, dueDate: null, dueTime: null, source: 'manual' }, nowIso)
}

/** 取消完成，或标记完成；完成时把进行中一起清掉（完成的任务不能是进行中）。 */
export function toggleDone(task: Task, nowIso: string): Task {
  if (task.done) return { ...task, done: false, completedAt: null }
  return { ...task, done: true, completedAt: nowIso, inProgress: false }
}

/** 切换进行中；已完成的任务不变（完成的任务本来就不是进行中）。 */
export function toggleInProgress(task: Task): Task {
  if (task.done) return task
  return { ...task, inProgress: !task.inProgress }
}

/** 新建一个分类，id 用 crypto.randomUUID()，名字先规范化。调用方要确认规范化后不为空。 */
export function createCategory(name: string, nowIso: string): Category {
  return { id: crypto.randomUUID(), name: normalizeCategoryName(name), createdAt: nowIso }
}

/** 分类簿：一次操作里按名字找或新建分类用的。list 是改后的完整分类列表，created 是这次新建的，full 是因为分类已满没能建的次数。 */
export type CategoryBook = { list: Category[]; created: Category[]; full: number }

export function newCategoryBook(categories: readonly Category[]): CategoryBook {
  return { list: [...categories], created: [], full: 0 }
}

/**
 * 按名字找分类（规范化后不区分大小写）：有就用已有的；没有就新建并追加到 list；
 * 已满（CATEGORY_LIMIT）时不建、返回 null 并把 full 加一。名字规范化后为空也返回 null。
 */
export function bookCategory(book: CategoryBook, name: string, nowIso: string): Category | null {
  const normalized = normalizeCategoryName(name)
  if (normalized === '') return null
  const existing = book.list.find((category) => sameCategoryName(category.name, normalized))
  if (existing !== undefined) return existing
  if (book.list.length >= CATEGORY_LIMIT) {
    book.full += 1
    return null
  }
  const created = createCategory(normalized, nowIso)
  book.list.push(created)
  book.created.push(created)
  return created
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
