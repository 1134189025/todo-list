import { formatTaskWhen } from '../lib/labels'
import type { Task } from '@shared/types'
import { CalendarIcon, CheckIcon, ClockIcon, SparkIcon, TrashIcon } from './icons'
import './TaskRow.css'

type TaskRowProps = {
  task: Task
  today: string
  fresh: boolean
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function TaskRow({ task, today, fresh, onToggle, onRemove }: TaskRowProps) {
  const when = formatTaskWhen(task, today)
  const classes = ['task-row']
  if (task.done) classes.push('is-done')
  if (fresh && task.source === 'ai') classes.push('is-fresh')

  return (
    <li className={classes.join(' ')}>
      <button
        type="button"
        className="task-row-check"
        aria-label={task.done ? `标记为未完成：${task.title}` : `标记为完成：${task.title}`}
        onClick={() => onToggle(task.id)}
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
        {when !== null && (
          <span className={when.kind === 'overdue' ? 'task-row-when is-overdue' : 'task-row-when'}>
            {when.kind === 'time' ? <ClockIcon size={13} /> : <CalendarIcon size={13} />}
            {when.text}
          </span>
        )}
      </div>
      <button
        type="button"
        className="task-row-delete"
        aria-label={`删除：${task.title}`}
        title="删除"
        onClick={() => onRemove(task.id)}
      >
        <TrashIcon size={16} />
      </button>
    </li>
  )
}
