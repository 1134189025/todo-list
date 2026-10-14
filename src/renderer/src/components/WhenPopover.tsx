import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isDateKey, isTimeKey } from '@shared/dates'
import { type DayPreset, presetDate } from '../lib/aiDraft'
import './WhenPopover.css'

const WIDTH = 264
const MARGIN = 8
const GAP = 6

const PRESETS: { key: DayPreset; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'tomorrow', label: '明天' },
  { key: 'dayAfter', label: '后天' }
]

type WhenPopoverProps = {
  anchor: HTMLElement | null
  date: string | null
  time: string | null
  today: string
  onChange: (date: string | null, time: string | null) => void
  onClose: () => void
}

function placement(anchor: HTMLElement, height: number): { top: number; left: number } {
  const rect = anchor.getBoundingClientRect()
  const above = rect.top - height - GAP
  const top = above >= MARGIN ? above : rect.bottom + GAP
  const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - WIDTH - MARGIN)
  return { top, left }
}

/** 修改时间的弹层：Esc、点外面、滚动或窗口变化时关闭。 */
export function WhenPopover({ anchor, date, time, today, onChange, onClose }: WhenPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const selected = date ?? today

  useLayoutEffect(() => {
    if (anchor === null || ref.current === null) return
    setPosition(placement(anchor, ref.current.offsetHeight))
  }, [anchor])

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    function close(): void {
      closeRef.current()
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    function onPointerDown(event: PointerEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])

  return (
    <div
      ref={ref}
      className="when-popover"
      role="dialog"
      aria-label="修改时间"
      tabIndex={-1}
      style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
    >
      <span className="when-popover-label">日期</span>
      <div className="when-popover-presets">
        {PRESETS.map((preset) => {
          const pressed = presetDate(preset.key, today) === selected
          return (
            <button
              key={preset.key}
              type="button"
              className={pressed ? 'when-popover-preset is-on' : 'when-popover-preset'}
              aria-pressed={pressed}
              onClick={() => onChange(presetDate(preset.key, today), time)}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <input
        type="date"
        className="when-popover-input"
        aria-label="选择日期"
        value={selected}
        onChange={(event) => {
          if (isDateKey(event.target.value)) onChange(event.target.value, time)
        }}
      />
      <span className="when-popover-label">时间</span>
      <div className="when-popover-time">
        <input
          type="time"
          className="when-popover-input"
          aria-label="提醒时间"
          value={time ?? ''}
          onChange={(event) => {
            if (isTimeKey(event.target.value)) onChange(selected, event.target.value)
          }}
        />
        <button type="button" className="when-popover-none" onClick={() => onChange(date, null)}>
          不设时间
        </button>
      </div>
    </div>
  )
}
