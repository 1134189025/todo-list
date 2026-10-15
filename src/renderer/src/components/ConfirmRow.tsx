import { useRef, useState } from 'react'
import { TITLE_MAX } from '@shared/text'
import { type DraftItem, type DraftPatch, whenPillText } from '../lib/aiDraft'
import { URGENCY_TEXT } from '../lib/labels'
import { ClockIcon, CloseIcon } from './icons'
import { WhenPopover } from './WhenPopover'
import './ConfirmRow.css'

type ConfirmRowProps = {
  item: DraftItem
  today: string
  onPatch: (patch: DraftPatch) => void
  onRemove: () => void
}

export function ConfirmRow({ item, today, onPatch, onRemove }: ConfirmRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)
  const when = whenPillText(item.date, item.time, today)

  return (
    <li className={item.include ? 'confirm-row' : 'confirm-row is-off'}>
      <label className="confirm-row-check">
        <input
          type="checkbox"
          checked={item.include}
          aria-label={`添加「${item.title}」`}
          onChange={(event) => onPatch({ include: event.target.checked })}
        />
      </label>
      <input
        type="text"
        className="confirm-row-title"
        aria-label="待办标题"
        value={item.title}
        maxLength={TITLE_MAX}
        onChange={(event) => onPatch({ title: event.target.value })}
      />
      {item.category !== null && (
        <span className="confirm-row-tag is-category" title={`分类：${item.category}`}>
          <span className="confirm-row-tag-text">{item.category}</span>
          <button
            type="button"
            className="confirm-row-tag-x"
            aria-label={`取消分类：${item.category}`}
            onClick={() => onPatch({ category: null })}
          >
            <CloseIcon size={10} />
          </button>
        </span>
      )}
      {item.urgency !== 'normal' && (
        <span className={`confirm-row-tag is-${item.urgency}`}>
          <span className="confirm-row-tag-text">{URGENCY_TEXT[item.urgency]}</span>
          <button
            type="button"
            className="confirm-row-tag-x"
            aria-label={`取消「${URGENCY_TEXT[item.urgency]}」，改为普通`}
            onClick={() => onPatch({ urgency: 'normal' })}
          >
            <CloseIcon size={10} />
          </button>
        </span>
      )}
      <button
        ref={pillRef}
        type="button"
        className="confirm-row-when"
        aria-label={`修改时间：${when}`}
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((open) => !open)}
      >
        <ClockIcon size={13} />
        {when}
      </button>
      <button
        type="button"
        className="confirm-row-remove"
        aria-label={`移除：${item.title}`}
        onClick={onRemove}
      >
        <CloseIcon size={12} />
      </button>
      {pickerOpen && (
        <WhenPopover
          anchor={pillRef.current}
          date={item.date}
          time={item.time}
          today={today}
          onChange={(date, time) => onPatch({ date, time })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </li>
  )
}
