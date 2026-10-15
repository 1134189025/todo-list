import type { Task } from '@shared/types'
import { formatDayLabel } from './labels'
import type { TaskView } from './taskView'

// 小结条上点名的那一件：今天未完成列表已经按「紧急度 → 进行中 → 过期 → 时间」排好，直接取第一件。
// 说法带上它为什么排在前面：正在做的、过期的（带原来的日期，免得「18:00」读成今天）、有时间的。
function nameOf(task: Task, today: string): string {
  const title = `「${task.title}」`
  if (task.inProgress) return `正在做的${title}`
  if (task.dueDate !== null && task.dueDate < today) {
    const when = task.dueTime === null ? formatDayLabel(task.dueDate, today) : `${formatDayLabel(task.dueDate, today)} ${task.dueTime}`
    return `已过期的${title}（${when}）`
  }
  if (task.dueTime !== null) return `${task.dueTime} 的${title}`
  return title
}

/** 小结条上的一句话：本地计算，不调用 AI。 */
export function localSummaryLine(view: TaskView, today: string): string {
  const pending = view.today.pending
  const [first] = pending
  if (first !== undefined) return `还剩 ${pending.length} 件，${nameOf(first, today)}最该先做`
  if (view.today.done.length > 0) return '今天都完成啦，看看接下来的安排'
  return '今天还没有待办，说一句话就能添加'
}
