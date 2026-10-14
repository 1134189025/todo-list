import type { SummaryResult } from '@shared/api'
import type { Task } from '@shared/types'
import { formatTaskWhen } from '../lib/labels'
import { orderRows } from '../lib/summaryView'
import { buildTaskView } from '../lib/taskView'
import { CheckIcon } from './icons'
import './SummaryBody.css'

const UPCOMING_LIMIT = 3

type SummaryBodyProps = {
  summary: SummaryResult
  tasks: Task[]
  today: string
}

/** 总结的正文：概述、建议顺序由 AI 给出；已完成、接下来由本地计算。 */
export function SummaryBody({ summary, tasks, today }: SummaryBodyProps) {
  const rows = orderRows(summary, tasks)
  const view = buildTaskView(tasks, today)
  const done = view.today.done
  const upcoming = view.later.pending.slice(0, UPCOMING_LIMIT)

  return (
    <div className="summary-body">
      {summary.overview !== '' && <p className="summary-body-overview">{summary.overview}</p>}

      {rows.length > 0 && (
        <section className="summary-body-section">
          <h3 className="summary-body-heading">建议顺序</h3>
          <ol className="summary-body-order">
            {rows.map((row) => (
              <li key={`${row.n}-${row.title}`} className="summary-body-order-item">
                <span className="summary-body-index">{row.n}</span>
                <span className="summary-body-order-text">
                  <span className="summary-body-order-title">{row.title}</span>
                  {row.reason !== '' && <span className="summary-body-order-reason">{row.reason}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {done.length > 0 && (
        <section className="summary-body-section">
          <h3 className="summary-body-heading">已完成 · {done.length}</h3>
          <ul className="summary-body-list">
            {done.map((task) => (
              <li key={task.id} className="summary-body-done">
                <span className="summary-body-check">
                  <CheckIcon size={12} strokeWidth={2.4} />
                </span>
                <span className="summary-body-done-title">{task.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="summary-body-section">
          <h3 className="summary-body-heading">接下来</h3>
          <ul className="summary-body-list">
            {upcoming.map((task) => (
              <li key={task.id} className="summary-body-upcoming">
                <span className="summary-body-date">{formatTaskWhen(task, today)?.text ?? ''}</span>
                <span className="summary-body-upcoming-title">{task.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
