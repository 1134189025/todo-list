import type { Category } from '@shared/types'
import { type CategoryCounts, type CategoryFilter, showsUncategorized } from '../lib/categoryFilter'
import './CategorySelect.css'

type CategorySelectProps = {
  /** 已按创建时间排好的分类。没有分类时不显示。 */
  categories: Category[]
  counts: CategoryCounts
  filter: CategoryFilter
  onChange: (filter: CategoryFilter) => void
}

const ALL_VALUE = 'all'
const NONE_VALUE = 'none'
const CATEGORY_PREFIX = 'c:'

/** 窗口窄、左栏隐藏时用的分类筛选：一个下拉框，选项和左栏一致。 */
export function CategorySelect({ categories, counts, filter, onChange }: CategorySelectProps) {
  if (categories.length === 0) return null
  const value =
    filter.kind === 'all' ? ALL_VALUE : filter.kind === 'uncategorized' ? NONE_VALUE : `${CATEGORY_PREFIX}${filter.id}`

  function handleChange(next: string): void {
    if (next === ALL_VALUE) onChange({ kind: 'all' })
    else if (next === NONE_VALUE) onChange({ kind: 'uncategorized' })
    else onChange({ kind: 'category', id: next.slice(CATEGORY_PREFIX.length) })
  }

  return (
    <select
      className="category-select"
      aria-label="分类筛选"
      value={value}
      onChange={(event) => handleChange(event.target.value)}
    >
      <option value={ALL_VALUE}>全部 · {counts.all}</option>
      {categories.map((category) => (
        <option key={category.id} value={`${CATEGORY_PREFIX}${category.id}`}>
          {category.name} · {counts.byId.get(category.id)?.open ?? 0}
        </option>
      ))}
      {showsUncategorized(counts, filter) && (
        <option value={NONE_VALUE}>未分类 · {counts.uncategorized}</option>
      )}
    </select>
  )
}
