import { useState, type MouseEvent } from 'react'
import type { Category, Task, Urgency } from '@shared/types'
import { categoryName } from '../lib/categoryFilter'
import { formatTaskWhen } from '../lib/labels'
import { URGENCY_LABEL } from '../lib/urgency'
import type { CategoryResult } from '../state/useCategories'
import { CalendarIcon, CheckIcon, ClockIcon, FlagIcon, MoreIcon, SparkIcon, TrashIcon } from './icons'
import { TaskEditPopover } from './TaskEditPopover'
import './TaskRow.css'

/** 一条待办可以做的操作，由 App 提供。 */
export type TaskActions = {
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onToggleProgress: (id: string) => void
  onSetUrgency: (id: string, urgency: Urgency) => void
  onSetCategory: (id: string, categoryId: string | null) => void
  onCreateCategory: (name: string) => CategoryResult
}

type TaskRowProps = {
  task: Task
  today: string
  fresh: boolean
  categories: readonly Category[]
  actions: TaskActions
}

export function TaskRow({ task, today, fresh, categories, actions }: TaskRowProps) {
  const [editAnchor, setEditAnchor] = useState<HTMLButtonElement | null>(null)
  const when = formatTaskWhen(task, today)
  const category = categoryName(task.categoryId, categories)
  // 已完成的待办不再标紧急和不急，免得完成了还显示着紧急。
  const urgencyTag = task.done ? null : task.urgency
  const classes = ['task-row']
  if (task.done) classes.push('is-done')
  if (task.inProgress) classes.push('is-progress')
  if (fresh && task.source === 'ai') classes.push('is-fresh')
  const hasMeta = when !== null || urgencyTag === 'high' || urgencyTag === 'low' || task.inProgress || category !== null

  function toggleEdit(event: MouseEvent<HTMLButtonElement>): void {
    // 先取出按钮：更新函数可能晚于事件执行，那时 currentTarget 已经不是它了。
    const button = event.currentTarget
    setEditAnchor((current) => (current === null ? button : null))
  }

  return (
    <li className={classes.join(' ')}>
      <button
        type="button"
        className="task-row-check"
        aria-label={task.done ? `标记为未完成：${task.title}` : `标记为完成：${task.title}`}
        onClick={() => actions.onToggle(task.id)}
      >
        <span className="task-row-circle" aria-hidden="true">
          {task.done && <CheckIcon size={12} />}
        </span>
      </button>
      <div className="task-row-body">
        <div className="task-row-title-line">
          <span className="task-row-title" title={task.title}>
            {task.title}
          </span>
          {task.source === 'ai' && (
            <span className="task-row-ai" title="由 AI 添加">
              <SparkIcon size={14} />
              <span className="sr-only">（由 AI 添加）</span>
            </span>
          )}
        </div>
        {hasMeta && (
          <div className="task-row-meta">
            {when !== null && (
              <span className={when.kind === 'overdue' ? 'task-row-when is-overdue' : 'task-row-when'}>
                {when.kind === 'time' ? <ClockIcon size={13} /> : <CalendarIcon size={13} />}
                {when.text}
              </span>
            )}
            {urgencyTag === 'high' && (
              <span className="task-tag is-urgent">
                <FlagIcon size={12} />
                {URGENCY_LABEL.high}
              </span>
            )}
            {urgencyTag === 'low' && <span className="task-tag is-calm">{URGENCY_LABEL.low}</span>}
            {task.inProgress && <span className="task-tag is-progress">进行中</span>}
            {category !== null && (
              <span className="task-tag is-category" title={category}>
                {category}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="task-row-actions">
        {!task.done && (
          <button
            type="button"
            className={task.inProgress ? 'task-row-start task-row-action is-on' : 'task-row-start task-row-action'}
            aria-label={task.inProgress ? `暂停（取消进行中）：${task.title}` : `开始做：${task.title}`}
            title={task.inProgress ? '暂停：取消进行中' : '开始做：设为进行中'}
            onClick={() => actions.onToggleProgress(task.id)}
          >
            {task.inProgress ? '暂停' : '开始做'}
          </button>
        )}
        <button
          type="button"
          className="task-row-more task-row-action"
          aria-label={`修改紧急度和分类：${task.title}`}
          aria-haspopup="dialog"
          aria-expanded={editAnchor !== null}
          title="紧急度和分类"
          onClick={toggleEdit}
        >
          <MoreIcon size={16} />
        </button>
        <button
          type="button"
          className="task-row-delete task-row-action"
          aria-label={`删除：${task.title}`}
          title="删除"
          onClick={() => actions.onRemove(task.id)}
        >
          <TrashIcon size={16} />
        </button>
      </div>
      {editAnchor !== null && (
        <TaskEditPopover
          anchor={editAnchor}
          task={task}
          categories={categories}
          actions={actions}
          onClose={() => setEditAnchor(null)}
        />
      )}
    </li>
  )
}
