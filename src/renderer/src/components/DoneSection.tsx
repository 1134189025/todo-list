import type { Task } from '@shared/types'
import { ChevronRightIcon } from './icons'
import { TaskList } from './TaskList'
import './DoneSection.css'

type DoneSectionProps = {
  tasks: Task[]
  today: string
  open: boolean
  freshIds: ReadonlySet<string>
  onToggleOpen: () => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function DoneSection({ tasks, today, open, freshIds, onToggleOpen, onToggle, onRemove }: DoneSectionProps) {
  return (
    <section className="done-section">
      <button type="button" className="done-section-toggle" aria-expanded={open} onClick={onToggleOpen}>
        <ChevronRightIcon size={16} className={open ? 'done-section-chevron is-open' : 'done-section-chevron'} />
        已完成 · {tasks.length}
      </button>
      {open && (
        <TaskList tasks={tasks} today={today} freshIds={freshIds} onToggle={onToggle} onRemove={onRemove} />
      )}
    </section>
  )
}
