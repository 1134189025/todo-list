import type { AiAction } from '@shared/api'
import type { TasksState } from '@shared/taskPatch'
import type { Task } from '@shared/types'
import {
  applyAiDirect,
  changesMessage,
  isDirectAction,
  removeTasks,
  revertChanges,
  type CategoryNotes,
  type TaskChange
} from './aiActions'
import { draftsToTasks, toDraftItem, whenPillText } from './aiDraft'
import { restoreAt, withoutIds } from './taskOps'

// 语音胶囊的「AI 结果 → 执行 + 撤销」。
// 用户选定的规则：新建、完成、取消完成、改时间、改标题、归类、设紧急度、开始 / 取消进行中、新建分类都直接执行；
// 只有删除要先问一句。撤销 = 把这一次胶囊对任务做的所有改动一起撤回（直接执行的字段、新建的任务、后来删掉的任务）；
// 这次顺带新建的分类撤销时保留（和主窗口一样，数据层约定撤销只撤任务）。

/** 待确认的删除：任务 id 和当时看到的标题。 */
export type PillDeleteTarget = { taskId: string; title: string }

/** 撤销时按原来的位置放回。 */
export type PillRemoved = { task: Task; index: number }

export type PillUndo = {
  createdIds: ReadonlySet<string>
  changes: readonly TaskChange[]
  removed: readonly PillRemoved[]
}

export type PillPlan = {
  /** 除删除之外执行之后的任务和分类（分类可能多了 AI 新建的）。 */
  next: TasksState
  /** 这次新建的任务（结果那一行要写出标题）。 */
  created: Task[]
  createdIds: ReadonlySet<string>
  changes: TaskChange[]
  /** 结果文字要用的分类信息：最新的分类列表、新建了哪些、有几处因为满了没能新建或归类。 */
  notes: CategoryNotes
  /** 要确认的删除；任务已经不存在的不算。 */
  deletes: PillDeleteTarget[]
  /** 这次一条操作都没落地。 */
  nothing: boolean
}

/**
 * 把 AI 的操作用在当前的任务和分类上：直接执行的改动 + 新建一起落进 next，删除先留成待确认。
 * 分类按名字解析：有同名的（不区分大小写）就用它，没有就新建；同一次结果里同一个新名字只建一个。
 */
export function planPill(actions: readonly AiAction[], state: TasksState, nowIso: string, today: string): PillPlan {
  const direct = applyAiDirect(state, actions.filter(isDirectAction), nowIso, today)
  const drafts = actions.flatMap((action) => (action.op === 'add' ? [toDraftItem(action.item)] : []))
  const made = draftsToTasks(drafts, direct.next.categories, nowIso)
  const notes: CategoryNotes = {
    categories: made.categories,
    created: [...direct.createdCategories, ...made.createdCategories],
    full: direct.categoryFull + made.categoryFull
  }
  const deletes = actions.flatMap((action) => {
    if (action.op !== 'delete') return []
    const task = state.tasks.find((candidate) => candidate.id === action.id)
    return task === undefined ? [] : [{ taskId: task.id, title: task.title }]
  })
  return {
    next: { tasks: [...made.tasks, ...direct.next.tasks], categories: made.categories },
    created: made.tasks,
    createdIds: new Set(made.tasks.map((task) => task.id)),
    changes: direct.changes,
    notes,
    deletes,
    nothing:
      made.tasks.length === 0 && direct.changes.length === 0 && deletes.length === 0 && notes.created.length === 0
  }
}

/** 在现在的列表上删掉待确认的那几条，返回撤销要用的信息。 */
export function deleteTargets(tasks: readonly Task[], targets: readonly PillDeleteTarget[]): {
  next: Task[]
  removed: PillRemoved[]
} {
  return removeTasks(tasks, new Set(targets.map((target) => target.taskId)))
}

/** 撤销这一次的全部改动。 */
export function undoPill(tasks: readonly Task[], undo: PillUndo): Task[] {
  const restored = undo.removed.reduce((list, entry) => restoreAt(list, entry.task, entry.index), [...tasks])
  return revertChanges(withoutIds(restored, undo.createdIds), undo.changes)
}

/** 新建的那一条后面括号里的补充：日期时间、分类，没有就不加括号。 */
function createdDetail(task: Task, notes: CategoryNotes, today: string): string {
  const parts: string[] = []
  if (task.dueDate !== null) parts.push(whenPillText(task.dueDate, task.dueTime, today))
  const category = task.categoryId === null ? undefined : notes.categories.find((item) => item.id === task.categoryId)
  if (category !== undefined) parts.push(category.name)
  return parts.length === 0 ? '' : `（${parts.join(' · ')}）`
}

/**
 * 结果那一行：说清这次胶囊真正做了什么。
 * 只新建了一条时写出标题（「已添加「买牛奶」（明天 15:00 · 生活）」）；只有直接执行的改动时用主窗口同一套说法
 * （「已完成「写周报」」「已把「X」归到「工作」」）；混在一起时先说新建 / 删除的件数，再接改动的说明。
 */
export function pillSummary(
  created: readonly Task[],
  changes: readonly TaskChange[],
  deleted: number,
  today: string,
  notes: CategoryNotes
): string {
  const [onlyCreated] = created
  // 新建待办时顺带建的分类不单独说（标题后面括号里已经写了分类名）。
  const changeNotes: CategoryNotes = {
    ...notes,
    created: notes.created.filter((category) => !created.some((task) => task.categoryId === category.id))
  }
  const changeText = changesMessage(changes, today, changeNotes)
  if (created.length === 0 && deleted === 0) return changeText
  if (created.length === 1 && deleted === 0 && changeText === '' && onlyCreated !== undefined) {
    return `已添加「${onlyCreated.title}」${createdDetail(onlyCreated, notes, today)}`
  }
  const head: string[] = []
  if (created.length > 0) head.push(`已添加 ${created.length} 件`)
  if (deleted > 0) head.push(created.length > 0 ? `删除 ${deleted} 件` : `已删除 ${deleted} 件`)
  return changeText === '' ? head.join('、') : `${head.join('、')}；${changeText}`
}

/** 删除确认那一行的文字：一条写标题，多条写「A」等 N 件。 */
export function deleteQuestion(targets: readonly PillDeleteTarget[]): string {
  const [first] = targets
  if (first === undefined) return ''
  return targets.length === 1 ? `删除「${first.title}」？` : `删除「${first.title}」等 ${targets.length} 件？`
}
