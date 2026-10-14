import { useEffect, useRef, type KeyboardEvent } from 'react'
import { toLabel } from '@shared/accelerator'
import { MicIcon, SendIcon } from './icons'
import './Composer.css'

export type SubmitMode = 'ai' | 'direct'

const MAX_LENGTH = 500

type ComposerProps = {
  value: string
  notice: string | null
  voiceShortcut: string | null
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: (text: string, mode: SubmitMode) => void
  onVoice: () => void
}

export function Composer({ value, notice, voiceShortcut, disabled, onChange, onSubmit, onVoice }: ComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canSend = !disabled && value.trim() !== ''
  const micLabel = voiceShortcut === null ? '语音输入' : `语音输入（${toLabel(voiceShortcut)}）`

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!canSend) return
    onSubmit(value, event.ctrlKey ? 'direct' : 'ai')
  }

  return (
    <div className="composer">
      {notice !== null && (
        <p className="composer-notice" role="status">
          {notice}
        </p>
      )}
      <div className="composer-field">
        <button type="button" className="composer-mic" aria-label={micLabel} title={micLabel} onClick={onVoice}>
          <MicIcon size={20} />
        </button>
        <label htmlFor="composer-input" className="sr-only">
          输入待办
        </label>
        <input
          id="composer-input"
          ref={inputRef}
          className="composer-input"
          type="text"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          placeholder="说一句话，或直接输入待办…"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="composer-send"
          aria-label="发送"
          disabled={!canSend}
          onClick={() => onSubmit(value, 'ai')}
        >
          <SendIcon size={18} />
        </button>
      </div>
      <p className="composer-hint">Enter 让 AI 整理 · Ctrl+Enter 直接添加</p>
    </div>
  )
}
