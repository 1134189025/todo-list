import { ChevronRightIcon, SparkIcon } from './icons'
import './SummaryStrip.css'

type SummaryStripProps = {
  label: string
  text: string
  open: boolean
  onClick: () => void
}

export function SummaryStrip({ label, text, open, onClick }: SummaryStripProps) {
  return (
    <button
      type="button"
      className={open ? 'summary-strip is-open' : 'summary-strip'}
      aria-expanded={open}
      onClick={onClick}
    >
      <span className="summary-strip-icon">
        <SparkIcon size={18} />
      </span>
      <span className="summary-strip-text">
        <span className="summary-strip-label">{label}</span>
        <span className="summary-strip-line">{text}</span>
      </span>
      <span className="summary-strip-action">
        {open ? '收起总结' : '查看完整总结'}
        <ChevronRightIcon size={14} />
      </span>
    </button>
  )
}
