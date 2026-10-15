import { sameCategoryName } from './text'
import { CATEGORY_LIMIT, type Category, type Task } from './types'

/** 一条任务里改了的字段（id 不能改）。 */
export type TaskFields = Partial<Omit<Task, 'id'>>

/** 一份完整的待办数据：任务 + 分类。渲染进程状态、主进程内存、IPC 载荷都用这个形状。 */
export type TasksState = { tasks: Task[]; categories: Category[] }

/**
 * 分类部分的改动。added 里的分类 id 由发起方生成；renamed 只改名字；
 * removedIds 里的分类被删掉时，指向它的任务（含别的窗口刚加的）categoryId 置 null。
 */
export type CategoryPatch = {
  added: Category[]
  renamed: { id: string; name: string }[]
  removedIds: string[]
}

/**
 * 一次保存只发「改了什么」，由主进程合并到它手里最新的数据上。
 * 两个窗口（主窗口 / 悬浮窗）几乎同时保存时，各自的改动都能保留，不会互相整份覆盖；
 * 改动按字段合并，一边改标题、一边勾选同一条，两样都留下。
 */
export type TaskPatch = {
  /** 新加的（含撤销删除放回来的）；index 是在发起方列表里的位置，合并时尽量放回这个位置。 */
  added: { task: Task; index: number }[]
  /** 改过的字段；合并时如果这条已经被别处删掉，就不再加回来（删除优先）。 */
  updated: { id: string; fields: TaskFields }[]
  removedIds: string[]
  categories: CategoryPatch
}

/**
 * 主进程手里的数据和它的版本号。每合并一次改动版本号加 1。
 * 保存结果和推送走的是不同的 IPC 通道，到达顺序不保证，渲染进程靠版本号只接受更新的那份。
 */
export type TasksSnapshot = TasksState & { revision: number }

export const TASK_FIELDS = [
  'title',
  'done',
  'dueDate',
  'dueTime',
  'createdAt',
  'completedAt',
  'source',
  'urgency',
  'inProgress',
  'categoryId'
] as const

function changedFields(before: Task, after: Task): TaskFields {
  const fields: TaskFields = {}
  for (const field of TASK_FIELDS) {
    if (before[field] !== after[field]) Object.assign(fields, { [field]: after[field] })
  }
  return fields
}

function diffCategories(previous: readonly Category[], next: readonly Category[]): CategoryPatch {
  const before = new Map(previous.map((category) => [category.id, category]))
  const after = new Set(next.map((category) => category.id))
  const added: Category[] = []
  const renamed: CategoryPatch['renamed'] = []
  for (const category of next) {
    const old = before.get(category.id)
    if (old === undefined) {
      added.push(category)
      continue
    }
    if (old.name !== category.name) renamed.push({ id: category.id, name: category.name })
  }
  const removedIds = previous.filter((category) => !after.has(category.id)).map((category) => category.id)
  return { added, renamed, removedIds }
}

export function isEmptyPatch(patch: TaskPatch): boolean {
  const { categories } = patch
  return (
    patch.added.length === 0 &&
    patch.updated.length === 0 &&
    patch.removedIds.length === 0 &&
    categories.added.length === 0 &&
    categories.renamed.length === 0 &&
    categories.removedIds.length === 0
  )
}

/** 渲染进程：从改之前的数据和改之后的数据算出补丁。 */
export function diffTasks(previous: TasksState, next: TasksState): TaskPatch {
  const before = new Map(previous.tasks.map((task) => [task.id, task]))
  const after = new Set(next.tasks.map((task) => task.id))
  const added: TaskPatch['added'] = []
  const updated: TaskPatch['updated'] = []
  next.tasks.forEach((task, index) => {
    const old = before.get(task.id)
    if (old === undefined) {
      added.push({ task, index })
      return
    }
    const fields = changedFields(old, task)
    if (Object.keys(fields).length > 0) updated.push({ id: task.id, fields })
  })
  const removedIds = previous.tasks.filter((task) => !after.has(task.id)).map((task) => task.id)
  return { added, updated, removedIds, categories: diffCategories(previous.categories, next.categories) }
}

type CategoryMerge = {
  list: Category[]
  /**
   * 某个分类 id 被「删掉」或「新加但没加成」时，指向它的任务该改成哪个 id（null = 未分类）。
   * 不在表里的 id 原样保留：即使它指向一个不存在的分类，也当「未分类」显示而不是删掉字段。
   */
  remap: Map<string, string | null>
}

// 合并分类部分。不修改传进来的对象，一律产生新数组 / 新分类对象。
function mergeCategories(current: readonly Category[], patch: CategoryPatch): CategoryMerge {
  const list: Category[] = []
  const present = new Set<string>()
  const remap = new Map<string, string | null>()
  const removed = new Set(patch.removedIds)

  // 1. 删除：从列表去掉；只有真的去掉了一个分类，才把指向它的任务改成未分类。
  for (const category of current) {
    if (removed.has(category.id)) {
      remap.set(category.id, null)
      continue
    }
    list.push(category)
    present.add(category.id)
  }

  // 2. 新增：id 已存在 → 跳过；和已有分类重名 → 不加，指向它的任务改指已有的那个；
  //    已经满了 → 不加，指向它的任务改成未分类。
  for (const category of patch.added) {
    if (present.has(category.id)) {
      remap.delete(category.id)
      continue
    }
    const duplicate = list.find((existing) => sameCategoryName(existing.name, category.name))
    if (duplicate !== undefined) {
      remap.set(category.id, duplicate.id)
      continue
    }
    if (list.length >= CATEGORY_LIMIT) {
      remap.set(category.id, null)
      continue
    }
    list.push(category)
    present.add(category.id)
    remap.delete(category.id)
  }

  // 3. 改名：分类不存在、或新名字和另一个分类重名，这条改名不生效。
  for (const { id, name } of patch.renamed) {
    const index = list.findIndex((category) => category.id === id)
    if (index < 0) continue
    const taken = list.some((category) => category.id !== id && sameCategoryName(category.name, name))
    if (taken) continue
    list[index] = { ...list[index]!, name }
  }

  return { list, remap }
}

function fixCategoryId(task: Task, remap: Map<string, string | null>): Task {
  if (task.categoryId === null || !remap.has(task.categoryId)) return task
  return { ...task, categoryId: remap.get(task.categoryId) ?? null }
}

/**
 * 主进程：把补丁合并到当前数据上。
 * 任务部分：已存在的 id 不重复加；已被删掉的不因为「改过」而复活；字段合并后不再是合法任务的
 * （例如别处刚清掉日期、这边只改了时间），这条改动不生效。
 * 分类部分见 mergeCategories；合并完再保证 done 为 true 的任务 inProgress 一律为 false。
 */
export function applyTaskPatch(
  current: TasksState,
  patch: TaskPatch,
  isValid: (task: Task) => boolean
): TasksState {
  const { list: categories, remap } = mergeCategories(current.categories, patch.categories)
  const removed = new Set(patch.removedIds)
  const updates = new Map<string, TaskFields>()
  for (const { id, fields } of patch.updated) updates.set(id, { ...updates.get(id), ...fields })
  const merged = current.tasks
    .filter((task) => !removed.has(task.id))
    .map((task) => {
      const fields = updates.get(task.id)
      if (fields === undefined) return fixCategoryId(task, remap)
      const candidate: Task = { ...task, ...fields }
      return fixCategoryId(isValid(candidate) ? candidate : task, remap)
    })
  const present = new Set(merged.map((task) => task.id))
  for (const { task, index } of [...patch.added].sort((a, b) => a.index - b.index)) {
    if (present.has(task.id) || removed.has(task.id)) continue
    merged.splice(Math.min(index, merged.length), 0, fixCategoryId(task, remap))
    present.add(task.id)
  }
  return {
    tasks: merged.map((task) => (task.done && task.inProgress ? { ...task, inProgress: false } : task)),
    categories
  }
}
