import type { Task } from '@shared/types'
import type { TaskView } from './taskView'

function nameOf(task: Task): string {
  const prefix = task.dueTime === null ? '' : `${task.dueTime} 的`
  return `${prefix}「${task.title}」`
}

/** 小结条上的一句话：本地计算，不调用 AI。 */
export function localSummaryLine(view: TaskView): string {
  const pending = view.today.pending
  if (pending.length > 0) {
    const first = pending.find((task) => task.dueTime !== null) ?? pending[0]
    if (first !== undefined) return `还剩 ${pending.length} 件，${nameOf(first)}最该先做`
  }
  if (view.today.done.length > 0) return '今天都完成啦，看看接下来的安排'
  return '今天还没有待办，说一句话就能添加'
}
