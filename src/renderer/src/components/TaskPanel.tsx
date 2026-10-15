import type { ReactNode } from 'react'
import { todayProgress } from '@shared/dates'
import type { Category, Task } from '@shared/types'
import { type CategoryCounts, type CategoryFilter, filterTasks, sortCategories } from '../lib/categoryFilter'
import { localSummaryLine } from '../lib/localSummary'
import { buildTaskView, type TabKey } from '../lib/taskView'
import { CategorySelect } from './CategorySelect'
import { DoneSection } from './DoneSection'
import { EmptyState } from './EmptyState'
import { Header } from './Header'
import { SummaryStrip } from './SummaryStrip'
import { Tabs } from './Tabs'
import { TaskList } from './TaskList'
import type { TaskActions } from './TaskRow'
import './TaskPanel.css'

type TaskPanelProps = {
  today: string
  /** 全部待办（页眉的进度和小结用全部；列表按分类筛选）。 */
  tasks: Task[]
  /** 总结新鲜时的 headline；为 null 时显示本地算的一句。 */
  summaryHeadline: string | null
  tab: TabKey
  onTabChange: (tab: TabKey) => void
  summaryOpen: boolean
  onToggleSummary: () => void
  doneOpen: boolean
  onToggleDone: () => void
  freshIds: ReadonlySet<string>
  categories: Category[]
  categoryCounts: CategoryCounts
  filter: CategoryFilter
  onFilterChange: (filter: CategoryFilter) => void
  actions: TaskActions
}

/** 列表区的内容：页眉、小结条、标签页（窄窗口时带分类下拉），以及当前标签页的列表 / 空状态 / 已完成。 */
export function TaskPanel({
  today,
  tasks,
  summaryHeadline,
  tab,
  onTabChange,
  summaryOpen,
  onToggleSummary,
  doneOpen,
  onToggleDone,
  freshIds,
  categories,
  categoryCounts,
  filter,
  onFilterChange,
  actions
}: TaskPanelProps) {
  const view = buildTaskView(tasks, today)
  const progress = todayProgress(tasks, today)
  const listView = buildTaskView(filterTasks(tasks, filter, categories), today)
  const group = listView[tab]
  const counts = { today: listView.today.pending.length, later: listView.later.pending.length }
  const allDone = tab === 'today' && listView.today.pending.length === 0 && listView.today.done.length > 0

  let body: ReactNode
  if (allDone) {
    body = <EmptyState kind="allDone" />
  } else if (group.pending.length === 0) {
    body = <EmptyState kind={tab === 'today' ? 'emptyToday' : 'emptyLater'} />
  } else {
    body = (
      <TaskList
        tasks={group.pending}
        today={today}
        freshIds={freshIds}
        categories={categories}
        actions={actions}
      />
    )
  }

  return (
    <>
      <Header today={today} done={progress.done} total={progress.total} />
      <SummaryStrip
        label={summaryHeadline === null ? '小结' : 'AI 小结'}
        text={summaryHeadline ?? localSummaryLine(view)}
        open={summaryOpen}
        onClick={onToggleSummary}
      />
      <div className="task-inline-tabs">
        <Tabs active={tab} counts={counts} onChange={onTabChange} />
        <CategorySelect
          categories={sortCategories(categories)}
          counts={categoryCounts}
          filter={filter}
          onChange={onFilterChange}
        />
      </div>
      {body}
      {group.done.length > 0 && (
        <DoneSection
          tasks={group.done}
          today={today}
          open={doneOpen}
          freshIds={freshIds}
          categories={categories}
          actions={actions}
          onToggleOpen={onToggleDone}
        />
      )}
    </>
  )
}
