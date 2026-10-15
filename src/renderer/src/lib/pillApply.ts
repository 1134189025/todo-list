import type { AiAction } from '@shared/api'
import type { Task } from '@shared/types'
import {
  applyDirectActions,
  changesMessage,
  isDirectAction,
  removeTasks,
  revertChanges,
  type TaskChange
} from './aiActions'
import { draftToTask, toDraftItem } from './aiDraft'
import { restoreAt, withoutIds } from './taskOps'

// 语音胶囊的「AI 结果 → 执行 + 撤销」。
// 用户选定的规则：新建、完成、取消完成、改时间、改标题直接执行；只有删除要先问一句。
// 撤销 = 把这一次胶囊做的所有改动一起撤回（直接执行的字段、新建的任务、后来删掉的任务）。

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
  /** 除删除之外执行之后的列表。 */
  next: Task[]
  createdIds: ReadonlySet<string>
  changes: TaskChange[]
  added: number
  /** 要确认的删除；任务已经不存在的不算。 */
  deletes: PillDeleteTarget[]
  /** 这次一条操作都没落地。 */
  nothing: boolean
}

const OP_LABELS: Record<TaskChange['op'], string> = {
  complete: '完成',
  reopen: '取消完成',
  reschedule: '改时间',
  rename: '改标题'
}

/**
 * 把 AI 的操作用在当前列表上：直接执行的改动 + 新建一起落进 next，删除先留成待确认。
 * 只执行这一回，不再问（删除除外）。
 */
export function planPill(
  actions: readonly AiAction[],
  tasks: readonly Task[],
  nowIso: string,
  today: string
): PillPlan {
  const { next: afterDirect, changes } = applyDirectActions(
    tasks,
    actions.filter(isDirectAction),
    nowIso,
    today
  )
  const created = actions.flatMap((action) =>
    action.op === 'add' ? [draftToTask(toDraftItem(action.item), nowIso)] : []
  )
  const deletes = actions.flatMap((action) => {
    if (action.op !== 'delete') return []
    const task = tasks.find((candidate) => candidate.id === action.id)
    return task === undefined ? [] : [{ taskId: task.id, title: task.title }]
  })
  return {
    next: [...created, ...afterDirect],
    createdIds: new Set(created.map((task) => task.id)),
    changes,
    added: created.length,
    deletes,
    nothing: created.length === 0 && changes.length === 0 && deletes.length === 0
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

/** 执行说明：AI 没写回复时用它顶一行文字，例如「已添加 2 件、完成 1 件」。 */
export function pillSummary(added: number, changes: readonly TaskChange[], deleted: number, today: string): string {
  if (added === 0 && deleted === 0 && changes.length === 1) return changesMessage(changes, today)
  const parts: string[] = []
  if (added > 0) parts.push(`已添加 ${added} 件`)
  if (deleted > 0) parts.push(`已删除 ${deleted} 件`)
  const counts = new Map<string, number>()
  for (const change of changes) counts.set(OP_LABELS[change.op], (counts.get(OP_LABELS[change.op]) ?? 0) + 1)
  for (const [label, count] of counts) parts.push(`${label} ${count} 件`)
  return parts.join('、')
}

/** 删除确认那一行的文字：一条写标题，多条写「A」等 N 件。 */
export function deleteQuestion(targets: readonly PillDeleteTarget[]): string {
  const [first] = targets
  if (first === undefined) return ''
  return targets.length === 1 ? `删除「${first.title}」？` : `删除「${first.title}」等 ${targets.length} 件？`
}
