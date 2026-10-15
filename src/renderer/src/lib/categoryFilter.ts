import type { Category, Task } from '@shared/types'

/** 分类筛选：全部、未分类、或某一个分类。只放内存，不存盘。 */
export type CategoryFilter = { kind: 'all' } | { kind: 'uncategorized' } | { kind: 'category'; id: string }

export const ALL_FILTER: CategoryFilter = { kind: 'all' }

export type CategoryCount = { open: number; total: number }

/** 计数：全部未完成、未分类未完成，以及每个分类的未完成数（open）和全部数（total，删除时的提示用）。 */
export type CategoryCounts = {
  all: number
  uncategorized: number
  byId: ReadonlyMap<string, CategoryCount>
}

/** 按创建时间排序，显示顺序稳定（撤销删除后分类放回末尾，显示时仍按原来的先后）。 */
export function sortCategories(categories: readonly Category[]): Category[] {
  return [...categories].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/** 指向的分类还存在时返回它的 id，否则 null（界面按「未分类」处理）。 */
export function categoryIdOrNull(id: string | null, categories: readonly Category[]): string | null {
  if (id === null) return null
  return categories.some((category) => category.id === id) ? id : null
}

/** 任务所属分类的名字；没有或指向不存在的分类时为 null。 */
export function categoryName(id: string | null, categories: readonly Category[]): string | null {
  const known = categoryIdOrNull(id, categories)
  if (known === null) return null
  return categories.find((category) => category.id === known)?.name ?? null
}

/** 筛选是否还有效：所选分类被删掉，或者没有任何分类时，「未分类」「某分类」都失效，应回到「全部」。 */
export function isFilterValid(filter: CategoryFilter, categories: readonly Category[]): boolean {
  if (filter.kind === 'all') return true
  if (filter.kind === 'uncategorized') return categories.length > 0
  return categories.some((category) => category.id === filter.id)
}

export function filterTasks(tasks: readonly Task[], filter: CategoryFilter, categories: readonly Category[]): Task[] {
  if (filter.kind === 'all') return [...tasks]
  if (filter.kind === 'category') return tasks.filter((task) => task.categoryId === filter.id)
  const known = new Set(categories.map((category) => category.id))
  return tasks.filter((task) => task.categoryId === null || !known.has(task.categoryId))
}

export function countCategories(tasks: readonly Task[], categories: readonly Category[]): CategoryCounts {
  const byId = new Map<string, CategoryCount>(categories.map((category) => [category.id, { open: 0, total: 0 }]))
  const known = new Set(categories.map((category) => category.id))
  let all = 0
  let uncategorized = 0
  for (const task of tasks) {
    if (!task.done) all += 1
    if (task.categoryId === null || !known.has(task.categoryId)) {
      if (!task.done) uncategorized += 1
      continue
    }
    const count = byId.get(task.categoryId)
    if (count === undefined) continue
    count.total += 1
    if (!task.done) count.open += 1
  }
  return { all, uncategorized, byId }
}

/**
 * 「未分类」入口是否显示：有未完成的未分类待办时显示；正在筛选它时即使数量为零也保留，
 * 免得选中的那一项从列表里消失。
 */
export function showsUncategorized(counts: CategoryCounts, filter: CategoryFilter): boolean {
  return counts.uncategorized > 0 || filter.kind === 'uncategorized'
}
