export type TaskSource = 'manual' | 'ai'

export type Task = {
  id: string
  title: string
  done: boolean
  dueDate: string | null
  dueTime: string | null
  createdAt: string
  completedAt: string | null
  source: TaskSource
}
