import { useId, type ReactNode } from 'react'
import type { Category, Task } from '@shared/types'
import { ChevronRightIcon } from '../components/icons'
import { formatTaskWhen } from '../lib/labels'
import { FloatTaskItem } from './FloatTaskItem'
import { DONE_SECTION_KEY, buildFloatView, doneGroupKey, pendingGroupKey, type FloatSection } from './floatGroups'

type FloatTaskListProps = {
  /** 今天的全部待办；null 表示还没读完。 */
  list: Task[] | null
  categories: Category[] | null
  today: string
  isOpen: (key: string) => boolean
  onToggleGroup: (key: string) => void
  onToggle: (id: string) => void
}

/**
 * 悬浮窗的待办列表：未完成按分类折叠分组；已完成收在最下面的「已完成 · N」里（默认收起），
 * 展开后再按分类分组，每组默认收起。
 */
export function FloatTaskList({ list, categories, today, isOpen, onToggleGroup, onToggle }: FloatTaskListProps) {
  if (list === null) return <p className="float-empty">正在读取待办…</p>
  const view = buildFloatView(list, categories, today)
  if (view.pendingCount === 0 && view.doneCount === 0) {
    return <p className="float-empty">今天还没有待办</p>
  }
  return (
    <div className="float-groups">
      {view.pendingCount === 0 && <p className="float-empty">今天的事都做完啦</p>}
      <PendingSection section={view.pending} today={today} isOpen={isOpen} onToggleGroup={onToggleGroup} onToggle={onToggle} />
      {view.doneCount > 0 && (
        <Fold
          storageKey={DONE_SECTION_KEY}
          label={`已完成 · ${view.doneCount}`}
          count={null}
          open={isOpen(DONE_SECTION_KEY)}
          onToggle={onToggleGroup}
        >
          <DoneSection section={view.done} today={today} isOpen={isOpen} onToggleGroup={onToggleGroup} onToggle={onToggle} />
        </Fold>
      )}
    </div>
  )
}

type SectionProps = {
  section: FloatSection
  today: string
  isOpen: (key: string) => boolean
  onToggleGroup: (key: string) => void
  onToggle: (id: string) => void
}

function PendingSection({ section, today, isOpen, onToggleGroup, onToggle }: SectionProps) {
  if (!section.grouped) return <TaskItems tasks={section.tasks} today={today} onToggle={onToggle} />
  return (
    <>
      {section.groups.map((group) => {
        const key = pendingGroupKey(group.categoryId)
        return (
          <Fold
            key={key}
            storageKey={key}
            label={group.name}
            count={group.tasks.length}
            open={isOpen(key)}
            onToggle={onToggleGroup}
          >
            <TaskItems tasks={group.tasks} today={today} onToggle={onToggle} />
          </Fold>
        )
      })}
    </>
  )
}

function DoneSection({ section, today, isOpen, onToggleGroup, onToggle }: SectionProps) {
  if (!section.grouped) return <TaskItems tasks={section.tasks} today={today} onToggle={onToggle} />
  return (
    <>
      {section.groups.map((group) => {
        const key = doneGroupKey(group.categoryId)
        return (
          <Fold
            key={key}
            storageKey={key}
            label={group.name}
            count={group.tasks.length}
            open={isOpen(key)}
            nested
            onToggle={onToggleGroup}
          >
            <TaskItems tasks={group.tasks} today={today} onToggle={onToggle} />
          </Fold>
        )
      })}
    </>
  )
}

type TaskItemsProps = {
  tasks: Task[]
  today: string
  onToggle: (id: string) => void
}

function TaskItems({ tasks, today, onToggle }: TaskItemsProps) {
  return (
    <ul className="float-list">
      {tasks.map((task) => (
        <FloatTaskItem key={task.id} task={task} when={formatTaskWhen(task, today)} onToggle={onToggle} />
      ))}
    </ul>
  )
}

type FoldProps = {
  storageKey: string
  label: string
  /** 右边的件数；为 null 时不显示（「已完成 · N」已经把件数写在标题里）。 */
  count: number | null
  open: boolean
  /** 已完成里面的分组，缩进一点。 */
  nested?: boolean
  onToggle: (key: string) => void
  children: ReactNode
}

/** 一个可以折叠的标题行加内容。标题行是按钮，aria-controls 指向内容区；收起时内容区 hidden。 */
function Fold({ storageKey, label, count, open, nested = false, onToggle, children }: FoldProps) {
  const bodyId = useId()
  return (
    <div className={nested ? 'float-fold is-nested' : 'float-fold'}>
      <button
        type="button"
        className="float-fold-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(storageKey)}
      >
        <ChevronRightIcon size={12} className={open ? 'float-fold-chevron is-open' : 'float-fold-chevron'} />
        <span className="float-fold-name">{label}</span>
        {count !== null && <span className="float-fold-count">{count}</span>}
      </button>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </div>
  )
}
