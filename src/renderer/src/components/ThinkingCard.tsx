import { SparkIcon } from './icons'
import './ThinkingCard.css'

type ThinkingCardProps = {
  script: string
  onCancel: () => void
}

export function ThinkingCard({ script, onCancel }: ThinkingCardProps) {
  return (
    <section className="thinking-card" aria-label="AI 正在整理">
      <div className="thinking-card-head">
        <span className="thinking-card-icon">
          <SparkIcon size={18} />
        </span>
        <span className="thinking-card-title" role="status">
          AI 正在把你说的话整理成待办…
        </span>
      </div>
      <p className="thinking-card-quote">“{script}”</p>
      <div className="thinking-card-bars" aria-hidden="true">
        <span className="thinking-card-bar" />
        <span className="thinking-card-bar is-delay-1" />
        <span className="thinking-card-bar is-short is-delay-2" />
      </div>
      <div className="thinking-card-actions">
        <button type="button" className="ai-card-button is-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </section>
  )
}
