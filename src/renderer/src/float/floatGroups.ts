import type { Category, Task } from '@shared/types'
import { categoryIdOrNull, sortCategories } from '../lib/categoryFilter'
import { buildTaskView } from '../lib/taskView'

/** 一个分组：分类 id 为 null 时是「未分类」。 */
export type FloatGroup = {
  categoryId: string | null
  name: string
  tasks: Task[]
}

/**
 * 未完成或已完成的一段。
 * grouped 为 false：平铺 tasks（没有任何分类可分，或这一段的待办全都未分类）。
 * grouped 为 true：按 groups 分组，分类顺序同主窗口（按创建时间），「未分类」放最后。
 */
export type FloatSection = { grouped: true; groups: FloatGroup[] } | { grouped: false; tasks: Task[] }

export type FloatView = {
  pending: FloatSection
  done: FloatSection
  pendingCount: number
  doneCount: number
}

export const UNCATEGORIZED_NAME = '未分类'

/** 「已完成 · N」整块的展开键。 */
export const DONE_SECTION_KEY = 'done'

function categoryKeyPart(categoryId: string | null): string {
  return categoryId === null ? 'none' : `cat:${categoryId}`
}

/** 未完成某个分组的展开键。 */
export function pendingGroupKey(categoryId: string | null): string {
  return `pending:${categoryKeyPart(categoryId)}`
}

/** 已完成里某个分组的展开键。 */
export function doneGroupKey(categoryId: string | null): string {
  return `done:${categoryKeyPart(categoryId)}`
}

/** 没有存过的组的默认展开状态：未完成的组默认展开，「已完成」和它里面的组默认收起。 */
export function defaultOpen(key: string): boolean {
  return key.startsWith('pending:')
}

/** 解析本地保存的展开状态（应为 JSON 对象，值是布尔）。坏 JSON、不是对象的一律当没有；值不是布尔的忽略。 */
export function parseOpenStates(raw: string | null): Record<string, boolean> {
  if (raw === null) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
  const states: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'boolean') states[key] = value
  }
  return states
}

/**
 * 把今天的待办分成「未完成」「已完成」两段，各自决定是否分组。
 * 分组的判断：这一段里至少有一条待办指向存在的分类，才分组；否则平铺。
 */
export function buildFloatView(
  tasks: readonly Task[],
  categories: readonly Category[] | null,
  today: string
): FloatView {
  const todayView = buildTaskView(tasks, today).today
  const sorted = sortCategories(categories ?? [])
  return {
    pending: buildSection(todayView.pending, sorted),
    done: buildSection(todayView.done, sorted),
    pendingCount: todayView.pending.length,
    doneCount: todayView.done.length
  }
}

function buildSection(tasks: Task[], categories: Category[]): FloatSection {
  const hasCategory = tasks.some((task) => categoryIdOrNull(task.categoryId, categories) !== null)
  if (!hasCategory) return { grouped: false, tasks }
  const groups: FloatGroup[] = []
  for (const category of categories) {
    const members = tasks.filter((task) => task.categoryId === category.id)
    if (members.length > 0) groups.push({ categoryId: category.id, name: category.name, tasks: members })
  }
  const uncategorized = tasks.filter((task) => categoryIdOrNull(task.categoryId, categories) === null)
  if (uncategorized.length > 0) groups.push({ categoryId: null, name: UNCATEGORIZED_NAME, tasks: uncategorized })
  return { grouped: true, groups }
}
