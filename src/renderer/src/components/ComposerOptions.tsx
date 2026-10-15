import { useState, type MouseEvent } from 'react'
import type { Category, Urgency } from '@shared/types'
import { categoryName } from '../lib/categoryFilter'
import { whenPillText } from '../lib/aiDraft'
import { URGENCY_LABEL } from '../lib/urgency'
import type { CategoryResult } from '../state/useCategories'
import { CategoryChoice } from './CategoryChoice'
import { ClockIcon, FlagIcon, TagIcon } from './icons'
import { FloatingPopover } from './FloatingPopover'
import { UrgencyChoice } from './UrgencyChoice'
import { WhenPopover } from './WhenPopover'
import './ComposerOptions.css'

/** 手动添加时选的日期和时间；date 为 null 表示今天、没定日期。 */
export type ComposerWhen = { date: string | null; time: string | null }

type ComposerOptionsProps = {
  when: ComposerWhen
  today: string
  onWhenChange: (when: ComposerWhen) => void
  categories: readonly Category[]
  /** 当前选中的分类；null = 未分类。 */
  categoryId: string | null
  onCategoryChange: (id: string | null) => void
  onCreateCategory: (name: string) => CategoryResult
  urgency: Urgency
  onUrgencyChange: (urgency: Urgency) => void
}

type Picker = 'when' | 'category' | 'urgency'

type OpenPicker = { kind: Picker; anchor: HTMLButtonElement }

/** 手动添加模式下输入框下面的三个胶囊：日期时间、分类、紧急度。点开各自的浮层选。 */
export function ComposerOptions(props: ComposerOptionsProps) {
  const { when, today, categories, categoryId, urgency } = props
  const [open, setOpen] = useState<OpenPicker | null>(null)
  const whenText = whenPillText(when.date, when.time, today)
  const catName = categoryName(categoryId, categories) ?? '未分类'

  function toggle(kind: Picker, event: MouseEvent<HTMLButtonElement>): void {
    const anchor = event.currentTarget
    setOpen((current) => (current?.kind === kind ? null : { kind, anchor }))
  }

  const close = (): void => setOpen(null)

  return (
    <div className="composer-options" role="group" aria-label="待办选项">
      <button
        type="button"
        className="composer-pill"
        aria-label={`日期和时间：${whenText}`}
        aria-haspopup="dialog"
        aria-expanded={open?.kind === 'when'}
        onClick={(event) => toggle('when', event)}
      >
        <ClockIcon size={13} />
        <span className="composer-pill-text">{whenText}</span>
      </button>
      <button
        type="button"
        className="composer-pill"
        aria-label={`分类：${catName}`}
        aria-haspopup="dialog"
        aria-expanded={open?.kind === 'category'}
        onClick={(event) => toggle('category', event)}
      >
        <TagIcon size={13} />
        <span className="composer-pill-text">{catName}</span>
      </button>
      <button
        type="button"
        className={urgency === 'high' ? 'composer-pill is-urgent' : 'composer-pill'}
        aria-label={`紧急度：${URGENCY_LABEL[urgency]}`}
        aria-haspopup="dialog"
        aria-expanded={open?.kind === 'urgency'}
        onClick={(event) => toggle('urgency', event)}
      >
        <FlagIcon size={13} />
        <span className="composer-pill-text">{URGENCY_LABEL[urgency]}</span>
      </button>

      {open?.kind === 'when' && (
        <WhenPopover
          anchor={open.anchor}
          date={when.date}
          time={when.time}
          today={today}
          onChange={(date, time) => props.onWhenChange({ date, time: date === null ? null : time })}
          onClose={close}
        />
      )}
      {open?.kind === 'category' && (
        <FloatingPopover anchor={open.anchor} label="选择分类" onClose={close}>
          <span className="popover-label">分类</span>
          <CategoryChoice
            categories={categories}
            value={categoryId}
            onSelect={(id) => {
              props.onCategoryChange(id)
              close()
            }}
            onCreate={props.onCreateCategory}
          />
        </FloatingPopover>
      )}
      {open?.kind === 'urgency' && (
        <FloatingPopover anchor={open.anchor} label="选择紧急度" onClose={close}>
          <span className="popover-label">紧急度</span>
          <UrgencyChoice value={urgency} onChange={props.onUrgencyChange} />
        </FloatingPopover>
      )}
    </div>
  )
}
