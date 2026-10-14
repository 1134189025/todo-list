import type { Task } from '@shared/types'
import { TaskRow } from './TaskRow'
import './TaskList.css'

type TaskListProps = {
  tasks: Task[]
  today: string
  freshIds: ReadonlySet<string>
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function TaskList({ tasks, today, freshIds, onToggle, onRemove }: TaskListProps) {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          fresh={freshIds.has(task.id)}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      ))}
    </ul>
  )
}
