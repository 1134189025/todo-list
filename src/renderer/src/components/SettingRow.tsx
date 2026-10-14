import type { ReactNode } from 'react'
import './SettingRow.css'

type SettingRowProps = {
  title: string
  description?: string
  control?: ReactNode
  footer?: ReactNode
}

export function SettingRow({ title, description, control, footer }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row-main">
        <div className="setting-row-text">
          <span className="setting-row-title">{title}</span>
          {description !== undefined && <span className="setting-row-desc">{description}</span>}
        </div>
        {control !== undefined && <div className="setting-row-control">{control}</div>}
      </div>
      {footer !== undefined && footer !== null && <div className="setting-row-footer">{footer}</div>}
    </div>
  )
}
