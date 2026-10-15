import { useEffect, useRef, type KeyboardEvent } from 'react'
import { toLabel } from '@shared/accelerator'
import type { Category, Urgency } from '@shared/types'
import { MicIcon, PlusIcon, SendIcon } from './icons'
import { ComposerOptions, type ComposerWhen } from './ComposerOptions'
import type { CategoryResult } from '../state/useCategories'
import './Composer.css'

export type { ComposerWhen } from './ComposerOptions'

export type SubmitMode = 'ai' | 'direct'

/** 输入区的模式：AI 指令（Enter 交给 AI：新建、完成、改时间、改标题、删除），或手动添加（Enter 直接添加，可以选日期、分类和紧急度）。 */
export type ComposerMode = 'ai' | 'manual'

const MAX_LENGTH = 500

const MODES: { key: ComposerMode; label: string }[] = [
  { key: 'ai', label: 'AI 指令' },
  { key: 'manual', label: '手动添加' }
]

const HINTS: Record<ComposerMode, string> = {
  ai: 'Enter 交给 AI：新建、完成、改时间、删除都行 · Ctrl+Enter 直接添加',
  manual: 'Enter 添加 · 可以设日期、分类和紧急度'
}

type ComposerProps = {
  value: string
  notice: string | null
  voiceShortcut: string | null
  disabled: boolean
  mode: ComposerMode
  when: ComposerWhen
  today: string
  categories: readonly Category[]
  /** 手动添加时选中的分类（null = 未分类）。 */
  category: string | null
  urgency: Urgency
  onChange: (value: string) => void
  onModeChange: (mode: ComposerMode) => void
  onWhenChange: (when: ComposerWhen) => void
  onCategoryChange: (id: string | null) => void
  onUrgencyChange: (urgency: Urgency) => void
  onCreateCategory: (name: string) => CategoryResult
  onSubmit: (text: string, mode: SubmitMode) => void
  onVoice: () => void
}

export function Composer(props: ComposerProps) {
  const { value, notice, voiceShortcut, disabled, mode, today } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const canSend = !disabled && value.trim() !== ''
  const manual = mode === 'manual'
  const micLabel = voiceShortcut === null ? '语音输入' : `语音输入（${toLabel(voiceShortcut)}）`

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
          placeholder={manual ? '输入待办，Enter 添加…' : '说一句话：加待办、标记完成、改时间、删除…'}
          value={value}
          disabled={disabled}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="composer-send"
          aria-label={manual ? '添加' : '交给 AI'}
          title={manual ? '添加' : '交给 AI'}
          disabled={!canSend}
          onClick={() => props.onSubmit(value, manual ? 'direct' : 'ai')}
        >
          {manual ? <PlusIcon size={18} /> : <SendIcon size={18} />}
        </button>
      </div>
      {manual && (
        <ComposerOptions
          when={props.when}
          today={today}
          onWhenChange={props.onWhenChange}
          categories={props.categories}
          categoryId={props.category}
          onCategoryChange={props.onCategoryChange}
          onCreateCategory={props.onCreateCategory}
          urgency={props.urgency}
          onUrgencyChange={props.onUrgencyChange}
        />
      )}
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
    </div>
  )
}
