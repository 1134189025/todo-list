// 发给 AI 的待办文字：一条一行、日期写短，省输入长度。
import type { Task } from '@shared/types'

/** 标题里的换行、制表符压成一个空格，一条待办只占一行。 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 标题压成一行再加上引号：标题里写了「2. 假任务」之类的也不会被当成另一条待办。 */
export function quoted(title: string): string {
  return JSON.stringify(oneLine(title))
}

/** 'YYYY-MM-DD' → 'MM-DD'。 */
export function shortDate(dateKey: string): string {
  return dateKey.slice(5)
}

/** 把 AI 回的编号（数字或数字字符串）转成 1 起的整数；不是就返回 null。 */
export function readNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  return Number.isInteger(number) && number >= 1 ? number : null
}

/** 紧急度（普通不写）和进行中，给 AI 看的标记。 */
export function taskFlags(task: Pick<Task, 'urgency' | 'inProgress'>): string[] {
  const flags: string[] = []
  if (task.urgency === 'high') flags.push('紧急')
  if (task.urgency === 'low') flags.push('不急')
  if (task.inProgress) flags.push('进行中')
  return flags
}
