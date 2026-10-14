import { isInLaterList, isInTodayList, sortLaterOpenTasks, sortOpenTasks } from '@shared/dates'
import type { Task } from '@shared/types'

export type TabKey = 'today' | 'later'

export type ListGroup = { pending: Task[]; done: Task[] }

export type TaskView = Record<TabKey, ListGroup>

/**
 * 按第 4 节的规则把任务分进「今天」「之后」两个列表，并排好未完成的顺序。
 * 之后列表的已完成排除已经在今天列表里的任务，一条任务只出现在一个列表里。
 */
export function buildTaskView(tasks: readonly Task[], today: string): TaskView {
  const todayTasks = tasks.filter((task) => isInTodayList(task, today))
  const laterTasks = tasks.filter((task) => isInLaterList(task, today))
  const laterDone = laterTasks.filter((task) => task.done && !isInTodayList(task, today))
  return {
    today: {
      pending: sortOpenTasks(
        todayTasks.filter((task) => !task.done),
        today
      ),
      done: todayTasks.filter((task) => task.done)
    },
    later: {
      pending: sortLaterOpenTasks(laterTasks.filter((task) => !task.done)),
      done: laterDone
    }
  }
}
