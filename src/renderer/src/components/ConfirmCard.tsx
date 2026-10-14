import { useState } from 'react'
import { type AiFlow, type AiStage, confirmCount, quoteOf } from '../state/useAiFlow'
import { ConfirmDeleteRow } from './ConfirmDeleteRow'
import { ConfirmRow } from './ConfirmRow'
import { SparkIcon } from './icons'
import './ConfirmCard.css'

type ConfirmCardProps = {
  flow: AiFlow
  stage: Extract<AiStage, { kind: 'confirm' }>
  today: string
}

function headline(added: number, deleted: number): string {
  if (deleted === 0) return `整理出 ${added} 件待办`
  if (added === 0) return `要删除 ${deleted} 件待办`
  return `新建 ${added} 件、删除 ${deleted} 件`
}

/** AI 指令里要确认的部分：新建（可改标题和时间）和删除（勾选才删）；直接执行过的和没对上的在上面说明。 */
export function ConfirmCard({ flow, stage, today }: ConfirmCardProps) {
  // 语音指令默认展开 AI 听到的原话，方便核对有没有听错。
  const [showRaw, setShowRaw] = useState(stage.clip !== null)
  const { items, deletes, applied, unmatched } = stage
  const count = confirmCount(stage)
  const hasDeletes = deletes.length > 0

  return (
    <section className="confirm-card" aria-label="确认 AI 识别的操作">
      <div className="confirm-card-head">
        <span className="confirm-card-icon">
          <SparkIcon size={18} />
        </span>
        <div className="confirm-card-text">
          <span className="confirm-card-title">{headline(items.length, deletes.length)}</span>
          <span className="confirm-card-sub">
            {hasDeletes ? '删除要你确认：勾选后点执行，执行后也能撤销' : '勾选要添加的，标题和时间都能改'}
          </span>
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
      {showRaw && <p className="confirm-card-raw">{quoteOf(stage)}</p>}
      {applied !== null && (
        <p className="confirm-card-note" role="status">
          {applied.message}
        </p>
      )}
      {unmatched.length > 0 && <p className="confirm-card-note is-warn">没找到：{unmatched.join('、')}</p>}
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
        {deletes.map((item) => (
          <ConfirmDeleteRow key={item.key} item={item} onToggle={(include) => flow.toggleDelete(item.key, include)} />
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
        <button type="button" className="ai-card-button" disabled={count === 0} onClick={flow.confirmItems}>
          {hasDeletes ? `执行 ${count} 项` : `添加 ${count} 件`}
        </button>
      </div>
    </section>
  )
}
