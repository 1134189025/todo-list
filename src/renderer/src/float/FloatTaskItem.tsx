import type { Task } from '@shared/types'
import { CheckIcon, FlagIcon } from '../components/icons'
import type { WhenLabel } from '../lib/labels'

type FloatTaskItemProps = {
  task: Task
  when: WhenLabel | null
  onToggle: (id: string) => void
}

/** 悬浮窗里的一条待办：紧急用小旗标出，进行中整行淡绿底加左侧竖条。分类在这里不显示（窗口太窄）。 */
export function FloatTaskItem({ task, when, onToggle }: FloatTaskItemProps) {
  const classes = ['float-item']
  if (task.done) classes.push('is-done')
  if (task.inProgress) classes.push('is-progress')
  const urgent = !task.done && task.urgency === 'high'
  return (
    <li className={classes.join(' ')}>
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
      {urgent && (
        <span className="float-flag" title="紧急">
          <FlagIcon size={12} />
          <span className="sr-only">紧急</span>
        </span>
      )}
      {when !== null && (
        <span className={when.kind === 'overdue' ? 'float-when is-overdue' : 'float-when'}>{when.text}</span>
      )}
    </li>
  )
}
