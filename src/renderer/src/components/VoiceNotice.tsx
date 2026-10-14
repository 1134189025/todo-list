import { useEffect, useRef } from 'react'
import { MicIcon } from './icons'
import './VoiceNotice.css'

type VoiceNoticeProps = {
  onDismiss: () => void
}

export function VoiceNotice({ onDismiss }: VoiceNoticeProps) {
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    okRef.current?.focus()
  }, [])

  return (
    <section className="voice-notice" aria-labelledby="voice-notice-title">
      <div className="voice-notice-head">
        <span className="voice-notice-icon">
          <MicIcon size={18} />
        </span>
        <div className="voice-notice-text">
          <h2 id="voice-notice-title" className="voice-notice-title">
            语音识别还没接入
          </h2>
          <p className="voice-notice-body">现在可以先打字，AI 一样会帮你拆成待办</p>
        </div>
      </div>
      <div className="voice-notice-actions">
        <button ref={okRef} type="button" className="voice-notice-ok" onClick={onDismiss}>
          知道了
        </button>
      </div>
    </section>
  )
}
