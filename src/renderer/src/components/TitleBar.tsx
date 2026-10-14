import { LeafIcon, SettingsIcon } from './icons'
import './TitleBar.css'

type TitleBarProps = {
  onOpenSettings: () => void
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
  return (
    <header className="title-bar">
      <span className="title-bar-logo">
        <LeafIcon size={14} />
      </span>
      <span className="title-bar-name">清新待办</span>
      <button type="button" className="title-bar-button" aria-label="设置" title="设置" onClick={onOpenSettings}>
        <SettingsIcon />
      </button>
    </header>
  )
}
