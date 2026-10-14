import { useEffect, useRef, type ReactNode } from 'react'
import type { Exchange } from '../state/useAiFlow'
import { SparkIcon } from './icons'
import './AssistantPanel.css'

export type AssistantTab = 'chat' | 'summary'

type AssistantPanelProps = {
  tab: AssistantTab
  onTabChange: (tab: AssistantTab) => void
  /** 对话最上面助理先说的一句：打招呼 + 今天的情况。 */
  greeting: string
  log: Exchange[]
  /** 今日总结的内容。 */
  summary: ReactNode
  /** 底部：提示条、AI / 录音卡片或输入框。 */
  bottom: ReactNode
}

const TABS: { key: AssistantTab; label: string }[] = [
  { key: 'chat', label: '对话' },
  { key: 'summary', label: '今日总结' }
]

/** 右栏 AI 助理：对话记录、今日总结，底部是输入框。 */
export function AssistantPanel({ tab, onTabChange, greeting, log, summary, bottom }: AssistantPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 有新的一来一回时滚到最下面。
  useEffect(() => {
    const element = scrollRef.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [log.length, tab])

  return (
    <aside className="assistant" aria-label="AI 助理">
      <div className="assistant-head">
        <span className="assistant-icon">
          <SparkIcon size={16} />
        </span>
        <span className="assistant-title">AI 助理</span>
        <div className="assistant-tabs" role="group" aria-label="助理内容">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === tab ? 'assistant-tab is-active' : 'assistant-tab'}
              aria-pressed={item.key === tab}
              onClick={() => onTabChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'summary' ? (
        <div className="assistant-summary">{summary}</div>
      ) : (
        <div ref={scrollRef} className="assistant-log" aria-live="polite">
          <p className="assistant-bubble is-ai">{greeting}</p>
          {log.map((entry) => (
            <div key={entry.id} className="assistant-exchange">
              <p className="assistant-bubble is-user">{entry.said}</p>
              <p className="assistant-bubble is-ai">{entry.reply}</p>
            </div>
          ))}
        </div>
      )}
      <div className="assistant-bottom">{bottom}</div>
    </aside>
  )
}
