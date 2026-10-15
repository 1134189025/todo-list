import type { Category, Task } from '@shared/types'
import { TaskRow, type TaskActions } from './TaskRow'
import './TaskList.css'

type TaskListProps = {
  tasks: Task[]
  today: string
  freshIds: ReadonlySet<string>
  categories: readonly Category[]
  actions: TaskActions
}

export function TaskList({ tasks, today, freshIds, categories, actions }: TaskListProps) {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          fresh={freshIds.has(task.id)}
          categories={categories}
          actions={actions}
        />
      ))}
    </ul>
  )
}
