import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { toLabel } from '@shared/accelerator'
import { whenPillText } from '../lib/aiDraft'
import { ClockIcon, MicIcon, PlusIcon, SendIcon } from './icons'
import { WhenPopover } from './WhenPopover'
import './Composer.css'

export type SubmitMode = 'ai' | 'direct'

/** 输入区的模式：AI 整理（Enter 交给 AI），或手动添加（Enter 直接添加，可以选日期和时间）。 */
export type ComposerMode = 'ai' | 'manual'

/** 手动添加时选的日期和时间；date 为 null 表示今天、没定日期。 */
export type ComposerWhen = { date: string | null; time: string | null }

const MAX_LENGTH = 500

const MODES: { key: ComposerMode; label: string }[] = [
  { key: 'ai', label: 'AI 整理' },
  { key: 'manual', label: '手动添加' }
]

const HINTS: Record<ComposerMode, string> = {
  ai: 'Enter 让 AI 整理 · Ctrl+Enter 直接添加',
  manual: 'Enter 添加 · 点时间可以改日期和提醒'
}

type ComposerProps = {
  value: string
  notice: string | null
  voiceShortcut: string | null
  disabled: boolean
  mode: ComposerMode
  when: ComposerWhen
  today: string
  onChange: (value: string) => void
  onModeChange: (mode: ComposerMode) => void
  onWhenChange: (when: ComposerWhen) => void
  onSubmit: (text: string, mode: SubmitMode) => void
  onVoice: () => void
}

export function Composer(props: ComposerProps) {
  const { value, notice, voiceShortcut, disabled, mode, when, today } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const canSend = !disabled && value.trim() !== ''
  const manual = mode === 'manual'
  const micLabel = voiceShortcut === null ? '语音输入' : `语音输入（${toLabel(voiceShortcut)}）`
  const whenText = whenPillText(when.date, when.time, today)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!canSend) return
    props.onSubmit(value, manual || event.ctrlKey ? 'direct' : 'ai')
  }

  function changeMode(next: ComposerMode): void {
    if (next !== 'manual') setPickerOpen(false)
    props.onModeChange(next)
    inputRef.current?.focus()
  }

  return (
    <div className="composer">
      {notice !== null && (
        <p className="composer-notice" role="status">
          {notice}
        </p>
      )}
      <div className="composer-field">
        <button type="button" className="composer-mic" aria-label={micLabel} title={micLabel} onClick={props.onVoice}>
          <MicIcon size={20} />
        </button>
        <label htmlFor="composer-input" className="sr-only">
          {manual ? '输入待办标题' : '输入待办'}
        </label>
        <input
          id="composer-input"
          ref={inputRef}
          className="composer-input"
          type="text"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          placeholder={manual ? '输入待办，Enter 添加…' : '说一句话，或直接输入待办…'}
          value={value}
          disabled={disabled}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {manual && (
          <button
            ref={pillRef}
            type="button"
            className="composer-when"
            aria-label={`日期和时间：${whenText}`}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <ClockIcon size={13} />
            <span className="composer-when-text">{whenText}</span>
          </button>
        )}
        <button
          type="button"
          className="composer-send"
          aria-label={manual ? '添加' : '让 AI 整理'}
          title={manual ? '添加' : '让 AI 整理'}
          disabled={!canSend}
          onClick={() => props.onSubmit(value, manual ? 'direct' : 'ai')}
        >
          {manual ? <PlusIcon size={18} /> : <SendIcon size={18} />}
        </button>
      </div>
      <div className="composer-meta">
        <div className="composer-modes" role="group" aria-label="添加方式">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === mode ? 'composer-mode is-active' : 'composer-mode'}
              aria-pressed={item.key === mode}
              onClick={() => changeMode(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="composer-hint">{HINTS[mode]}</p>
      </div>
      {manual && pickerOpen && (
        <WhenPopover
          anchor={pillRef.current}
          date={when.date}
          time={when.time}
          today={today}
          onChange={(date, time) => props.onWhenChange({ date, time: date === null ? null : time })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
