import type { Task } from './types'

/**
 * 一次保存只发「改了什么」，由主进程合并到它手里最新的列表上。
 * 两个窗口（主窗口 / 悬浮窗）几乎同时保存时，各自的改动都能保留，不会互相整份覆盖。
 */
export type TaskPatch = {
  /** 新加的（含撤销删除放回来的）；index 是在发起方列表里的位置，合并时尽量放回这个位置。 */
  added: { task: Task; index: number }[]
  /** 改过的；合并时如果这条已经被别处删掉，就不再加回来（删除优先）。 */
  updated: Task[]
  removedIds: string[]
}

/**
 * 主进程手里的任务列表和它的版本号。每合并一次改动版本号加 1。
 * 保存结果和推送走的是不同的 IPC 通道，到达顺序不保证，渲染进程靠版本号只接受更新的那份。
 */
export type TasksSnapshot = { tasks: Task[]; revision: number }

const TASK_FIELDS = ['title', 'done', 'dueDate', 'dueTime', 'createdAt', 'completedAt', 'source'] as const

function sameTask(a: Task, b: Task): boolean {
  return TASK_FIELDS.every((field) => a[field] === b[field])
}

export function isEmptyPatch(patch: TaskPatch): boolean {
  return patch.added.length === 0 && patch.updated.length === 0 && patch.removedIds.length === 0
}

/** 渲染进程：从改之前的列表和改之后的列表算出补丁。 */
export function diffTasks(previous: readonly Task[], next: readonly Task[]): TaskPatch {
  const before = new Map(previous.map((task) => [task.id, task]))
  const after = new Set(next.map((task) => task.id))
  const added: TaskPatch['added'] = []
  const updated: Task[] = []
  next.forEach((task, index) => {
    const old = before.get(task.id)
    if (old === undefined) added.push({ task, index })
    else if (!sameTask(old, task)) updated.push(task)
  })
  const removedIds = previous.filter((task) => !after.has(task.id)).map((task) => task.id)
  return { added, updated, removedIds }
}

/** 主进程：把补丁合并到当前列表。已存在的 id 不重复加；已被删掉的不因为「改过」而复活。 */
export function applyTaskPatch(current: readonly Task[], patch: TaskPatch): Task[] {
  const removed = new Set(patch.removedIds)
  const updates = new Map(patch.updated.map((task) => [task.id, task]))
  const merged = current.filter((task) => !removed.has(task.id)).map((task) => updates.get(task.id) ?? task)
  const present = new Set(merged.map((task) => task.id))
  for (const { task, index } of [...patch.added].sort((a, b) => a.index - b.index)) {
    if (present.has(task.id) || removed.has(task.id)) continue
    merged.splice(Math.min(index, merged.length), 0, task)
    present.add(task.id)
  }
  return merged
}
