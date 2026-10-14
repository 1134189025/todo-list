import { useState } from 'react'
import { type DraftItem, pickableItems } from '../lib/aiDraft'
import type { AiFlow } from '../state/useAiFlow'
import { ConfirmRow } from './ConfirmRow'
import { SparkIcon } from './icons'
import './ConfirmCard.css'

type ConfirmCardProps = {
  flow: AiFlow
  items: DraftItem[]
  script: string
  today: string
}

export function ConfirmCard({ flow, items, script, today }: ConfirmCardProps) {
  const [showRaw, setShowRaw] = useState(false)
  const pickCount = pickableItems(items).length

  return (
    <section className="confirm-card" aria-label="确认 AI 整理的待办">
      <div className="confirm-card-head">
        <span className="confirm-card-icon">
          <SparkIcon size={18} />
        </span>
        <div className="confirm-card-text">
          <span className="confirm-card-title">整理出 {items.length} 件待办</span>
          <span className="confirm-card-sub">勾选要添加的，标题和时间都能改</span>
        </div>
        <button
          type="button"
          className="confirm-card-raw-toggle"
          aria-expanded={showRaw}
          onClick={() => setShowRaw((open) => !open)}
        >
          {showRaw ? '收起原话' : '查看原话'}
        </button>
      </div>
      {showRaw && <p className="confirm-card-raw">“{script}”</p>}
      <ul className="confirm-card-list">
        {items.map((item) => (
          <ConfirmRow
            key={item.key}
            item={item}
            today={today}
            onPatch={(patch) => flow.updateItem(item.key, patch)}
            onRemove={() => flow.removeItem(item.key)}
          />
        ))}
      </ul>
      <div className="confirm-card-actions">
        <button type="button" className="ai-card-button is-ghost" onClick={flow.reenter}>
          重新输入
        </button>
        <span className="confirm-card-spacer" />
        <button type="button" className="ai-card-button is-ghost" onClick={flow.dismiss}>
          取消
        </button>
        <button type="button" className="ai-card-button" disabled={pickCount === 0} onClick={flow.confirmItems}>
          添加 {pickCount} 件
        </button>
      </div>
    </section>
  )
}
