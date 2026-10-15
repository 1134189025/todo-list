import { useEffect, useRef, useState } from 'react'
import type { Category } from '@shared/types'
import {
  ALL_FILTER,
  showsUncategorized,
  sortCategories,
  type CategoryCounts,
  type CategoryFilter
} from '../lib/categoryFilter'
import { checkCategoryName, checkNewCategory } from '../lib/categoryOps'
import type { CategoryActions } from '../state/useCategories'
import { CategoryDeleteDialog } from './CategoryDeleteDialog'
import { CategoryMenu } from './CategoryMenu'
import { CategoryNameInput } from './CategoryNameInput'
import { PlusIcon } from './icons'
import './CategoryNav.css'

const NEW_BUTTON_SELECTOR = '[data-role="new-category"]'

function itemSelector(id: string): string {
  return `[data-category-id="${CSS.escape(id)}"]`
}

type CategoryNavProps = {
  categories: readonly Category[]
  counts: CategoryCounts
  filter: CategoryFilter
  onFilterChange: (filter: CategoryFilter) => void
  actions: CategoryActions
  /** 撤销删除时没能放回分类的说明。 */
  notice: string | null
}

type FilterItemProps = {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function FilterItem({ label, count, active, onClick }: FilterItemProps) {
  return (
    <button
      type="button"
      className={active ? 'nav-category-item is-active' : 'nav-category-item'}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="nav-category-name">{label}</span>
      <span className="nav-panel-count">{count}</span>
    </button>
  )
}

/**
 * 左栏「分类」一节：全部、每个分类（带未完成数）、有未分类待办时的「未分类」，最下面是「+ 新建分类」。
 * 一个分类都没有时只显示引导和「+ 新建分类」。改名、删除在分类项右边的「…」里。
 */
export function CategoryNav({ categories, counts, filter, onFilterChange, actions, notice }: CategoryNavProps) {
  const sectionRef = useRef<HTMLElement>(null)
  // 输入框收起后要把焦点放回的元素（CSS 选择器）。
  const pendingFocus = useRef<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const sorted = sortCategories(categories)

  useEffect(() => {
    if (creating || renamingId !== null || pendingFocus.current === null) return
    sectionRef.current?.querySelector<HTMLElement>(pendingFocus.current)?.focus()
    pendingFocus.current = null
  })

  function closeCreate(): void {
    pendingFocus.current = NEW_BUTTON_SELECTOR
    setCreating(false)
  }

  function closeRename(id: string): void {
    pendingFocus.current = itemSelector(id)
    setRenamingId(null)
  }

  function confirmDelete(): void {
    if (deleting !== null) actions.remove(deleting.id)
    setDeleting(null)
  }

  const newButton = (
    <button
      type="button"
      className="nav-category-new"
      data-role="new-category"
      onClick={() => setCreating(true)}
    >
      <PlusIcon size={13} />
      新建分类
    </button>
  )

  const createInput = (
    <CategoryNameInput
      label="新分类的名字"
      placeholder="分类名字，Enter 保存"
      check={(raw) => checkNewCategory(raw, categories)}
      onSave={(name) => {
        const result = actions.create(name)
        if (!result.ok) return result.message
        closeCreate()
        return null
      }}
      onCancel={closeCreate}
    />
  )

  if (categories.length === 0) {
    return (
      <section className="nav-categories" aria-label="分类" ref={sectionRef}>
        <p className="nav-panel-caption">分类</p>
        <p className="nav-categories-guide">给待办分个类，比如「工作」「家里」</p>
        {creating ? createInput : newButton}
        {notice !== null && (
          <p className="nav-categories-notice" role="status">
            {notice}
          </p>
        )}
      </section>
    )
  }

  const deletingTotal = deleting === null ? 0 : (counts.byId.get(deleting.id)?.total ?? 0)

  return (
    <>
      <section className="nav-categories" aria-label="分类" ref={sectionRef}>
        <p className="nav-panel-caption">分类</p>
        <ul className="nav-category-list">
          <li>
            <FilterItem
              label="全部"
              count={counts.all}
              active={filter.kind === 'all'}
              onClick={() => onFilterChange(ALL_FILTER)}
            />
          </li>
          {sorted.map((category) => {
            if (renamingId === category.id) {
              return (
                <li key={category.id} className="nav-category-row">
                  <CategoryNameInput
                    initial={category.name}
                    label="分类的新名字"
                    placeholder="新名字，Enter 保存"
                    check={(raw) => checkCategoryName(raw, categories, category.id)}
                    onSave={(name) => {
                      const result = actions.rename(category.id, name)
                      if (!result.ok) return result.message
                      closeRename(category.id)
                      return null
                    }}
                    onCancel={() => closeRename(category.id)}
                  />
                </li>
              )
            }
            const active = filter.kind === 'category' && filter.id === category.id
            return (
              <li key={category.id} className="nav-category-row">
                <button
                  type="button"
                  className={active ? 'nav-category-item is-active' : 'nav-category-item'}
                  aria-pressed={active}
                  data-category-id={category.id}
                  onClick={() => onFilterChange({ kind: 'category', id: category.id })}
                >
                  <span className="nav-category-name" title={category.name}>
                    {category.name}
                  </span>
                  <span className="nav-panel-count">{counts.byId.get(category.id)?.open ?? 0}</span>
                </button>
                <CategoryMenu
                  name={category.name}
                  onRename={() => setRenamingId(category.id)}
                  onDelete={() => setDeleting(category)}
                />
              </li>
            )
          })}
          {showsUncategorized(counts, filter) && (
            <li>
              <FilterItem
                label="未分类"
                count={counts.uncategorized}
                active={filter.kind === 'uncategorized'}
                onClick={() => onFilterChange({ kind: 'uncategorized' })}
              />
            </li>
          )}
        </ul>
        {creating ? createInput : newButton}
        {notice !== null && (
          <p className="nav-categories-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      <CategoryDeleteDialog
        category={deleting}
        total={deletingTotal}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}
