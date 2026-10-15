import type { AiAction } from '@shared/api'
import type { TasksState } from '@shared/taskPatch'
import { truncateTitle } from '@shared/text'
import { CATEGORY_LIMIT, type Category, type Task } from '@shared/types'
import { whenPillText } from './aiDraft'
import { URGENCY_TEXT } from './labels'
import { bookCategory, type CategoryBook, newCategoryBook } from './taskOps'

/** 不用确认、直接执行的操作；新建和删除要在确认卡片里点「执行」。 */
export type DirectAction = Exclude<AiAction, { op: 'add' } | { op: 'delete' }>

/** 直接执行里作用在某条任务上的操作（不含新建分类，新建分类不改任务）。 */
type TaskAction = Exclude<DirectAction, { op: 'createCategory' }>
export type TaskOp = TaskAction['op']

/** 一次直接执行改了哪条任务、改之前和之后的样子，撤销时只把改过的字段改回去。 */
export type TaskChange = { op: TaskOp; before: Task; after: Task }

/** 确认卡片里待确认的删除。 */
export type DeleteDraft = { key: string; taskId: string; title: string; include: boolean }

/** 直接执行的结果：改后的整份数据（任务 + 分类）、改了哪些任务、这次新建的分类、因分类已满没能建 / 归类的次数。 */
export type DirectOutcome = {
  next: TasksState
  changes: TaskChange[]
  createdCategories: Category[]
  categoryFull: number
}

const CHANGE_FIELDS = [
  'title',
  'done',
  'dueDate',
  'dueTime',
  'completedAt',
  'urgency',
  'inProgress',
  'categoryId'
] as const

// 撤销时成组处理的字段：完成状态、完成时间、进行中要一起改回去（完成会清掉进行中）；日期和时间也一起改。
// 不能只改回一半，否则会出现「未完成却有完成时间」「没日期却有时间」这样的任务。
const FIELD_GROUPS: readonly (readonly (typeof CHANGE_FIELDS)[number][])[] = [
  ['title'],
  ['done', 'completedAt', 'inProgress'],
  ['dueDate', 'dueTime'],
  ['urgency'],
  ['categoryId']
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

// 按名字解析分类：返回分类；已满、没能建时返回 null。
type Resolver = (name: string) => Category | null

// 对一条任务执行一个操作，返回改后的任务；分类已满、没能归类时返回 null（这条跳过）。
function applyOne(task: Task, action: TaskAction, nowIso: string, today: string, resolve: Resolver): Task | null {
  switch (action.op) {
    case 'complete':
      return task.done ? task : { ...task, done: true, completedAt: nowIso, inProgress: false }
    case 'reopen':
      return task.done ? { ...task, done: false, completedAt: null } : task
    case 'reschedule':
      return reschedule(task, action, today)
    case 'rename': {
      const title = truncateTitle(action.title)
      return title === '' ? task : { ...task, title }
    }
    case 'categorize': {
      if (action.category === null) return { ...task, categoryId: null }
      const category = resolve(action.category)
      return category === null ? null : { ...task, categoryId: category.id }
    }
    case 'urgency':
      return { ...task, urgency: action.level }
    case 'start':
      return task.done ? task : { ...task, inProgress: true }
    case 'pause':
      return { ...task, inProgress: false }
  }
}

function sameFields(a: Task, b: Task): boolean {
  return CHANGE_FIELDS.every((field) => a[field] === b[field])
}

/**
 * 在当前的任务和分类上执行直接操作。任务已不存在、操作后没变化的跳过；
 * 分类按名字解析（已有的直接用，没有就新建，同一次结果里同名只建一个，已满 50 个时不建）。
 * 新建分类（createCategory）不改任务，只建分类。
 */
export function applyAiDirect(
  state: TasksState,
  actions: readonly DirectAction[],
  nowIso: string,
  today: string
): DirectOutcome {
  const book: CategoryBook = newCategoryBook(state.categories)
  const resolve: Resolver = (name) => bookCategory(book, name, nowIso)
  const tasks = [...state.tasks]
  const changes: TaskChange[] = []
  for (const action of actions) {
    if (action.op === 'createCategory') {
      resolve(action.name)
      continue
    }
    const index = tasks.findIndex((task) => task.id === action.id)
    const before = tasks[index]
    if (before === undefined) continue
    const after = applyOne(before, action, nowIso, today, resolve)
    if (after === null || sameFields(before, after)) continue
    tasks[index] = after
    changes.push({ op: action.op, before, after })
  }
  return {
    next: { tasks, categories: book.list },
    changes,
    createdCategories: book.created,
    categoryFull: book.full
  }
}

/** 旧接口（语音胶囊还在用）：不带分类，只返回任务和改动。 */
export function applyDirectActions(
  tasks: readonly Task[],
  actions: readonly DirectAction[],
  nowIso: string,
  today: string
): { next: Task[]; changes: TaskChange[] } {
  const outcome = applyAiDirect({ tasks: [...tasks], categories: [] }, actions, nowIso, today)
  return { next: outcome.next.tasks, changes: outcome.changes }
}

/** 撤销直接操作：倒着改回去。按字段组处理：这次动过、且整组之后都没被别处改过的才改回去。分类不撤销。 */
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

/** 直接执行之后的分类信息：分类列表（取名字用）、这次新建的分类、因分类已满没能建 / 归类的次数。 */
export type CategoryNotes = { categories: readonly Category[]; created: readonly Category[]; full: number }

const NO_NOTES: CategoryNotes = { categories: [], created: [], full: 0 }

const TASK_OP_LABELS: Record<TaskOp | 'createCategory', string> = {
  complete: '完成',
  reopen: '取消完成',
  reschedule: '改时间',
  rename: '改标题',
  categorize: '归类',
  urgency: '改紧急度',
  start: '开始',
  pause: '取消进行中',
  createCategory: '新建分类'
}

function quoteNames(categories: readonly Category[]): string {
  return categories.map((category) => `「${category.name}」`).join('')
}

// 新建的分类里，不是为了某条归类而建的（只有「新建分类」建的）。
function standaloneCreated(changes: readonly TaskChange[], notes: CategoryNotes): Category[] {
  return notes.created.filter((category) => !changes.some((change) => change.after.categoryId === category.id))
}

function singleMessage(change: TaskChange, categories: readonly Category[], today: string): string {
  const title = `「${change.before.title}」`
  const after = change.after
  switch (change.op) {
    case 'complete':
      return `已完成${title}`
    case 'reopen':
      return `已取消完成${title}`
    case 'reschedule':
      return `已把${title}改到${whenPillText(after.dueDate, after.dueTime, today)}`
    case 'rename':
      return `已把${title}改成「${after.title}」`
    case 'categorize': {
      if (after.categoryId === null) return `已把${title}移出分类`
      const name = categories.find((category) => category.id === after.categoryId)?.name ?? '分类'
      return `已把${title}归到「${name}」`
    }
    case 'urgency':
      return `已把${title}设为${URGENCY_TEXT[after.urgency]}`
    case 'start':
      return `已开始${title}`
    case 'pause':
      return `已取消${title}的进行中`
  }
}

// 多项时按类别计数：「已处理 3 项：完成 1、归类 1、新建分类 1」。
function countMessage(changes: readonly TaskChange[], standalone: readonly Category[]): string {
  const counts = new Map<string, number>()
  for (const change of changes) {
    const label = TASK_OP_LABELS[change.op]
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  if (standalone.length > 0) counts.set(TASK_OP_LABELS.createCategory, standalone.length)
  const parts = [...counts].map(([label, count]) => `${label} ${count}`)
  return `已处理 ${changes.length + standalone.length} 项：${parts.join('、')}`
}

function withFullNote(message: string, notes: CategoryNotes): string {
  return notes.full > 0 ? `${message}；分类已满（最多 ${CATEGORY_LIMIT} 个），有的没能新建或归类` : message
}

/** 提示条上的文字：一项时说清楚改了什么，多项时按类别计数；分类已满时说明没能归类。 */
export function changesMessage(
  changes: readonly TaskChange[],
  today: string,
  notes: CategoryNotes = NO_NOTES
): string {
  const standalone = standaloneCreated(changes, notes)
  const [only] = changes
  if (changes.length === 0) {
    if (notes.created.length > 0) return withFullNote(`已新建分类${quoteNames(notes.created)}`, notes)
    return notes.full > 0 ? `分类已满（最多 ${CATEGORY_LIMIT} 个），没有新建或归类` : ''
  }
  if (changes.length === 1 && only !== undefined) {
    const head = singleMessage(only, notes.categories, today)
    return withFullNote(standalone.length === 0 ? head : `${head}；已新建分类${quoteNames(standalone)}`, notes)
  }
  return withFullNote(countMessage(changes, standalone), notes)
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
