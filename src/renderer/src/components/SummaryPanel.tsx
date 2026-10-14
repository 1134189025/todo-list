import type { ReactNode } from 'react'
import type { SummaryResult } from '@shared/api'
import { dateKeyFromIso } from '@shared/dates'
import type { Task } from '@shared/types'
import { formatClock } from '../lib/labels'
import { orderRows, summaryPlainText } from '../lib/summaryView'
import { useSpeech, type SpeechController } from '../state/useSpeech'
import { CloseIcon, SparkIcon } from './icons'
import { SummaryActions } from './SummaryActions'
import { SummaryBody } from './SummaryBody'
import './SummaryPanel.css'

type SummaryPanelProps = {
  configured: boolean
  summary: SummaryResult | null
  loading: boolean
  error: string | null
  fresh: boolean
  tasks: Task[]
  today: string
  onRegenerate: () => void
  onClose: () => void
  onOpenSettings: () => void
}

function Skeleton() {
  return (
    <div className="summary-panel-skeleton" role="status">
      <span className="sr-only">正在生成总结</span>
      <span className="summary-panel-bar is-tall" />
      <span className="summary-panel-bar is-title" />
      <span className="summary-panel-bar" />
      <span className="summary-panel-bar" />
      <span className="summary-panel-bar is-short" />
    </div>
  )
}

function metaText(loading: boolean, summary: SummaryResult | null): string {
  if (loading) return '正在阅读你的待办…'
  if (summary === null) return ''
  return `基于 ${summary.basedOnCount} 件待办 · ${formatClock(summary.generatedAt)} 生成`
}

function renderContent(props: SummaryPanelProps, speech: SpeechController): ReactNode {
  const { configured, summary, loading, error, fresh, tasks, today, onRegenerate, onOpenSettings } = props
  if (!configured) {
    return (
      <div className="summary-panel-notice">
        <p className="summary-panel-notice-text">还没配置 AI 服务</p>
        <button type="button" className="summary-panel-button is-primary" onClick={onOpenSettings}>
          去设置
        </button>
      </div>
    )
  }
  if (loading || (summary === null && error === null)) return <Skeleton />
  return (
    <>
      {error !== null && (
        <div className="summary-panel-notice is-error">
          <p className="summary-panel-notice-text" role="alert">
            {error}
          </p>
          <button type="button" className="summary-panel-button is-primary" onClick={onRegenerate}>
            重试
          </button>
        </div>
      )}
      {summary !== null && !fresh && (
        <div className="summary-panel-stale">
          <span className="summary-panel-stale-text">
            {dateKeyFromIso(summary.generatedAt) === today ? '待办有变化' : '这是之前生成的总结'}
          </span>
          <button type="button" className="summary-panel-button" onClick={onRegenerate}>
            重新生成
          </button>
        </div>
      )}
      {summary !== null && (
        <>
          <SummaryBody summary={summary} tasks={tasks} today={today} />
          <SummaryActions
            text={summaryPlainText(summary.overview, orderRows(summary, tasks))}
            speech={speech}
            onRegenerate={onRegenerate}
          />
        </>
      )}
    </>
  )
}

export function SummaryPanel(props: SummaryPanelProps) {
  const speech = useSpeech()
  // 重新生成和关闭时都先停止朗读，旧的结果不再念出来。
  const regenerate = (): void => {
    speech.stop()
    props.onRegenerate()
  }
  const close = (): void => {
    speech.stop()
    props.onClose()
  }
  const panel: SummaryPanelProps = { ...props, onRegenerate: regenerate, onClose: close }
  return (
    <div className="summary-panel">
      <header className="summary-panel-head">
        <span className="summary-panel-icon">
          <SparkIcon size={18} />
        </span>
        <div className="summary-panel-titles">
          <h2 className="summary-panel-title">今日总结</h2>
          <span className="summary-panel-meta">{metaText(props.loading, props.summary)}</span>
        </div>
        <button type="button" className="summary-panel-close" aria-label="关闭总结" onClick={close}>
          <CloseIcon size={14} />
        </button>
      </header>
      {renderContent(panel, speech)}
    </div>
  )
}
