import type { Task } from '@shared/types'
import { CheckIcon } from '../components/icons'
import type { WhenLabel } from '../lib/labels'

type FloatTaskItemProps = {
  task: Task
  when: WhenLabel | null
  onToggle: (id: string) => void
}

export function FloatTaskItem({ task, when, onToggle }: FloatTaskItemProps) {
  return (
    <li className={task.done ? 'float-item is-done' : 'float-item'}>
      <button
        type="button"
        className="float-check"
        aria-label={task.done ? `标记为未完成：${task.title}` : `标记为完成：${task.title}`}
        onClick={() => onToggle(task.id)}
      >
        <span className="float-circle" aria-hidden="true">
          {task.done && <CheckIcon size={10} />}
        </span>
      </button>
      <span className="float-item-title" title={task.title}>
        {task.title}
      </span>
      {when !== null && (
        <span className={when.kind === 'overdue' ? 'float-when is-overdue' : 'float-when'}>{when.text}</span>
      )}
    </li>
  )
}
