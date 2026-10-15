import type { Category, Task } from '@shared/types'
import { categoryIdOrNull } from '../lib/categoryFilter'
import type { TaskActions } from './TaskRow'
import { CategoryChoice } from './CategoryChoice'
import { FloatingPopover } from './FloatingPopover'
import { UrgencyChoice } from './UrgencyChoice'

type TaskEditPopoverProps = {
  anchor: HTMLElement
  task: Task
  categories: readonly Category[]
  actions: TaskActions
  onClose: () => void
}

/** 修改一条待办的紧急度和分类。选中就立即生效，浮层不关，Esc 或点外面关闭。 */
export function TaskEditPopover({ anchor, task, categories, actions, onClose }: TaskEditPopoverProps) {
  return (
    <FloatingPopover anchor={anchor} label={`修改紧急度和分类：${task.title}`} onClose={onClose}>
      <span className="popover-label">紧急度</span>
      <UrgencyChoice value={task.urgency} onChange={(urgency) => actions.onSetUrgency(task.id, urgency)} />
      <span className="popover-label">分类</span>
      <CategoryChoice
        categories={categories}
        value={categoryIdOrNull(task.categoryId, categories)}
        onSelect={(id) => actions.onSetCategory(task.id, id)}
        onCreate={actions.onCreateCategory}
      />
    </FloatingPopover>
  )
}
