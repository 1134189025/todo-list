import { CloudOffIcon, SparkIcon } from './icons'
import './NoticeCard.css'

type CardAction = { label: string; onClick: () => void }

type NoticeCardProps = {
  tone: 'peach' | 'ai'
  title: string
  body?: string
  quote?: string
  primary: CardAction
  secondary?: CardAction
}

export function NoticeCard({ tone, title, body, quote, primary, secondary }: NoticeCardProps) {
  return (
    <section className={`notice-card is-${tone}`} aria-label={title}>
      <div className="notice-card-head">
        <span className="notice-card-icon">{tone === 'peach' ? <CloudOffIcon size={20} /> : <SparkIcon size={20} />}</span>
        <div className="notice-card-text">
          <p className="notice-card-title">{title}</p>
          {body !== undefined && <p className="notice-card-body">{body}</p>}
        </div>
      </div>
      {quote !== undefined && <p className="notice-card-quote">{quote}</p>}
      <div className="notice-card-actions">
        <button type="button" className="ai-card-button" onClick={primary.onClick}>
          {primary.label}
        </button>
        {secondary !== undefined && (
          <button type="button" className="ai-card-button is-secondary" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )}
      </div>
    </section>
  )
}
