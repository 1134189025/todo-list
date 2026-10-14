import type { ReactNode } from 'react'
import { todayProgress } from '@shared/dates'
import type { Task } from '@shared/types'
import { localSummaryLine } from '../lib/localSummary'
import { buildTaskView, type TabKey } from '../lib/taskView'
import { DoneSection } from './DoneSection'
import { EmptyState } from './EmptyState'
import { Header } from './Header'
import { SummaryStrip } from './SummaryStrip'
import { Tabs } from './Tabs'
import { TaskList } from './TaskList'

type TaskPanelProps = {
  today: string
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
  onToggleTask: (id: string) => void
  onRemoveTask: (id: string) => void
}

/** 列表区的内容：页眉、小结条、标签页，以及当前标签页的列表 / 空状态 / 已完成。 */
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
  onToggleTask,
  onRemoveTask
}: TaskPanelProps) {
  const view = buildTaskView(tasks, today)
  const progress = todayProgress(tasks, today)
  const group = view[tab]
  const counts = { today: view.today.pending.length, later: view.later.pending.length }
  const allDone = tab === 'today' && view.today.pending.length === 0 && view.today.done.length > 0

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
        onToggle={onToggleTask}
        onRemove={onRemoveTask}
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
      <Tabs active={tab} counts={counts} onChange={onTabChange} />
      {body}
      {group.done.length > 0 && (
        <DoneSection
          tasks={group.done}
          today={today}
          open={doneOpen}
          freshIds={freshIds}
          onToggleOpen={onToggleDone}
          onToggle={onToggleTask}
          onRemove={onRemoveTask}
        />
      )}
    </>
  )
}
