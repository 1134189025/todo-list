import type { SummaryResult } from '@shared/api'
import type { Task } from '@shared/types'

export type OrderRow = { n: number; title: string; reason: string }

/** 建议顺序：id 映射到当前任务标题；已经不存在或已完成的跳过。 */
export function orderRows(summary: SummaryResult, tasks: readonly Task[]): OrderRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const rows: OrderRow[] = []
  for (const entry of summary.order) {
    const task = byId.get(entry.id)
    if (task === undefined || task.done) continue
    rows.push({ n: rows.length + 1, title: task.title, reason: entry.reason })
  }
  return rows
}

/** 复制和朗读用的同一段文字。 */
export function summaryPlainText(overview: string, rows: readonly OrderRow[]): string {
  const head = `今日总结：${overview}`
  if (rows.length === 0) return head
  const order = rows.map((row) => `${row.n}. ${row.title}`).join('；')
  return `${head} 建议顺序：${order}。`
}
