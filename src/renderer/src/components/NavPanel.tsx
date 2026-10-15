import type { Category } from '@shared/types'
import type { CategoryCounts, CategoryFilter } from '../lib/categoryFilter'
import type { TabKey } from '../lib/taskView'
import type { CategoryActions } from '../state/useCategories'
import { CategoryNav } from './CategoryNav'
import './NavPanel.css'

type NavPanelProps = {
  tab: TabKey
  counts: Record<TabKey, number>
  done: number
  total: number
  floatOpen: boolean
  onTabChange: (tab: TabKey) => void
  onToggleFloat: () => void
  categories: readonly Category[]
  categoryCounts: CategoryCounts
  filter: CategoryFilter
  onFilterChange: (filter: CategoryFilter) => void
  categoryActions: CategoryActions
  categoryNotice: string | null
}

const ITEMS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'later', label: '之后' }
]

/** 左栏：待办范围、分类筛选、今日进度、悬浮窗开关。窗口窄时隐藏，改用列表上方的标签页和分类下拉。 */
export function NavPanel({
  tab,
  counts,
  done,
  total,
  floatOpen,
  onTabChange,
  onToggleFloat,
  categories,
  categoryCounts,
  filter,
  onFilterChange,
  categoryActions,
  categoryNotice
}: NavPanelProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <nav className="nav-panel" aria-label="待办范围">
      <p className="nav-panel-caption">清单</p>
      <ul className="nav-panel-list">
        {ITEMS.map((item) => {
          const active = item.key === tab
          return (
            <li key={item.key}>
              <button
                type="button"
                className={active ? 'nav-panel-item is-active' : 'nav-panel-item'}
                aria-pressed={active}
                onClick={() => onTabChange(item.key)}
              >
                <span>{item.label}</span>
                <span className="nav-panel-count">{counts[item.key]}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <CategoryNav
        categories={categories}
        counts={categoryCounts}
        filter={filter}
        onFilterChange={onFilterChange}
        actions={categoryActions}
        notice={categoryNotice}
      />
      <section className="nav-panel-progress" aria-label="今日进度">
        <div className="nav-panel-progress-text">
          <span>今日完成</span>
          <span className="nav-panel-progress-count">
            {done} / {total}
          </span>
        </div>
        <div className="nav-panel-track">
          <div className="nav-panel-bar" style={{ width: `${percent}%` }} />
        </div>
      </section>
      <span className="nav-panel-spacer" />
      <button
        type="button"
        className={floatOpen ? 'nav-panel-float is-on' : 'nav-panel-float'}
        aria-pressed={floatOpen}
        onClick={onToggleFloat}
      >
        {floatOpen ? '悬浮窗已打开' : '打开悬浮窗'}
      </button>
    </nav>
  )
}
