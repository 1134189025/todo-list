import { useEffect, useRef, useState } from 'react'
import { toLabel } from '@shared/accelerator'
import { VOICE_MAX_SECONDS, type VoiceController } from '../state/useVoice'
import { MicIcon } from './icons'
import './AiCard.css'
import './VoiceCard.css'

type VoiceCardProps = {
  voice: VoiceController
  accelerator: string | null
  onOpenSettings: () => void
}

const TICK_MS = 250

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** 录音中的计时和音量条；音量条直接改样式，不跟着每一帧重新渲染。 */
function RecordingMeter({ voice, startedAt }: { voice: VoiceController; startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  const levelRef = useRef<HTMLSpanElement>(null)
  const { level } = voice

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), TICK_MS)
    let frame = 0
    const draw = (): void => {
      if (levelRef.current !== null) levelRef.current.style.transform = `scaleX(${Math.max(0.04, level())})`
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => {
      window.clearInterval(timer)
      window.cancelAnimationFrame(frame)
    }
  }, [level, startedAt])

  return (
    <div className="voice-card-meter">
      <span className="voice-card-track" aria-hidden="true">
        <span ref={levelRef} className="voice-card-level" />
      </span>
      <span className="voice-card-clock">
        {clock(elapsed)} / {clock(VOICE_MAX_SECONDS)}
      </span>
    </div>
  )
}

/** 输入区的位置：打开麦克风、录音中、整理录音、以及录音相关的提示。 */
export function VoiceCard({ voice, accelerator, onOpenSettings }: VoiceCardProps) {
  const { state } = voice
  const primaryRef = useRef<HTMLButtonElement>(null)

  // 换到新的一步时把焦点放到主按钮上：Enter / 空格就能「说完了」或「知道了」。
  useEffect(() => {
    primaryRef.current?.focus()
  }, [state.kind])

  if (state.kind === 'idle') return null

  if (state.kind === 'notice') {
    const { notice } = state
    return (
      <section className="voice-card is-notice" aria-labelledby="voice-card-title">
        <div className="voice-card-head">
          <span className="voice-card-icon">
            <MicIcon size={18} />
          </span>
          <div className="voice-card-text">
            <h2 id="voice-card-title" className="voice-card-title">
              {notice.title}
            </h2>
            <p className="voice-card-body">{notice.body}</p>
          </div>
        </div>
        <div className="voice-card-actions">
          {notice.toSettings && (
            <button type="button" className="ai-card-button is-secondary" onClick={voice.dismiss}>
              知道了
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            className="ai-card-button"
            onClick={() => {
              voice.dismiss()
              if (notice.toSettings) onOpenSettings()
            }}
          >
            {notice.toSettings ? '去设置' : '知道了'}
          </button>
        </div>
      </section>
    )
  }

  const recording = state.kind === 'recording'
  const title = recording ? '正在听…' : state.kind === 'starting' ? '正在打开麦克风…' : '正在整理录音…'
  const again = accelerator === null ? '' : `或再按 ${toLabel(accelerator)}`
  return (
    <section className="voice-card" aria-labelledby="voice-card-title">
      <div className="voice-card-head">
        <span className={recording ? 'voice-card-icon is-live' : 'voice-card-icon'}>
          <MicIcon size={18} />
        </span>
        <div className="voice-card-text">
          <h2 id="voice-card-title" className="voice-card-title" role="status">
            {title}
          </h2>
          <p className="voice-card-body">
            {recording
              ? `说完点「说完了」${again}，Esc 放弃；最长 ${VOICE_MAX_SECONDS} 秒`
              : '说一句话：加待办、标记完成、改时间、删除都行'}
          </p>
        </div>
      </div>
      {recording && <RecordingMeter voice={voice} startedAt={state.startedAt} />}
      <div className="voice-card-actions">
        <button type="button" className="ai-card-button is-ghost" onClick={voice.cancel}>
          取消
        </button>
        {recording && (
          <button ref={primaryRef} type="button" className="ai-card-button" onClick={voice.toggle}>
            说完了
          </button>
        )}
      </div>
    </section>
  )
}
