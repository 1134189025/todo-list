import type { ReactNode } from 'react'
import './Notice.css'

type NoticeProps = {
  tone: 'peach' | 'danger' | 'muted'
  children: ReactNode
  onDismiss?: () => void
}

export function Notice({ tone, children, onDismiss }: NoticeProps) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'muted' ? 'status' : 'alert'}>
      <span className="notice-text">{children}</span>
      {onDismiss !== undefined && (
        <button type="button" className="notice-dismiss" onClick={onDismiss}>
          知道了
        </button>
      )}
    </div>
  )
}
