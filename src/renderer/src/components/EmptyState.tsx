import './EmptyState.css'

type EmptyKind = 'allDone' | 'emptyToday' | 'emptyLater'

type EmptyStateProps = {
  kind: EmptyKind
}

function Sprout() {
  return (
    <svg className="empty-state-art" width="132" height="116" viewBox="0 0 168 148" fill="none" aria-hidden="true">
      <circle className="empty-state-disc" cx="84" cy="78" r="62" />
      <path className="empty-state-line" d="M84 90V54" strokeWidth="2.5" strokeLinecap="round" />
      <path
        className="empty-state-leaf empty-state-line"
        d="M84 72c-12 0-22-8-24-20 12-2 22 6 24 20z"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        className="empty-state-leaf empty-state-line"
        d="M84 62c2-14 12-22 26-22 0 14-10 22-26 22z"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        className="empty-state-pot empty-state-line"
        d="M60 98h48l-5 30a3 3 0 0 1-3 2H68a3 3 0 0 1-3-2z"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect className="empty-state-pot empty-state-line" x="55" y="88" width="58" height="11" rx="4" strokeWidth="2.5" />
      <path className="empty-state-spark" d="M130 34v12M124 40h12" strokeWidth="2.5" strokeLinecap="round" />
      <path className="empty-state-spark" d="M38 58v8M34 62h8" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState({ kind }: EmptyStateProps) {
  if (kind === 'allDone') {
    return (
      <div className="empty-state">
        <Sprout />
        <p className="empty-state-title">今天的事都做完啦</p>
        <p className="empty-state-sub">去喝杯茶，晒晒太阳吧</p>
      </div>
    )
  }
  return (
    <p className="empty-state-text">
      {kind === 'emptyToday' ? '今天还没有待办，在下面输入一句就能添加' : '之后还没有安排'}
    </p>
  )
}
