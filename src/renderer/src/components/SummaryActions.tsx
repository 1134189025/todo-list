import { useEffect, useState } from 'react'
import type { SpeechController } from '../state/useSpeech'
import { CopyIcon, RefreshIcon, SpeakIcon } from './icons'
import './SummaryActions.css'

const FEEDBACK_MS = 2000

type SummaryActionsProps = {
  text: string
  speech: SpeechController
  onRegenerate: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABEL: Record<CopyState, string> = { idle: '复制', copied: '已复制', failed: '复制失败' }

export function SummaryActions({ text, speech, onRegenerate }: SummaryActionsProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="summary-actions">
      <button
        type="button"
        className="summary-actions-button"
        aria-pressed={speech.speaking}
        onClick={() => speech.toggle(text)}
      >
        <SpeakIcon size={16} />
        {speech.speaking ? '停止朗读' : '朗读'}
      </button>
      <button type="button" className="summary-actions-button" onClick={() => void copy()}>
        <CopyIcon size={16} />
        {COPY_LABEL[copyState]}
      </button>
      <button type="button" className="summary-actions-button" onClick={onRegenerate}>
        <RefreshIcon size={16} />
        重新生成
      </button>
      {speech.error !== null && (
        <p className="summary-actions-note" role="status">
          {speech.error}
        </p>
      )}
    </div>
  )
}
