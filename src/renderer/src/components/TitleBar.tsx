import { FloatIcon, LeafIcon, SettingsIcon } from './icons'
import './TitleBar.css'

type TitleBarProps = {
  floatOpen: boolean
  onToggleFloat: () => void
  onOpenSettings: () => void
}

export function TitleBar({ floatOpen, onToggleFloat, onOpenSettings }: TitleBarProps) {
  const floatLabel = floatOpen ? '关闭悬浮窗' : '打开悬浮窗'
  return (
    <header className="title-bar">
      <span className="title-bar-logo">
        <LeafIcon size={14} />
      </span>
      <span className="title-bar-name">清新待办</span>
      <button
        type="button"
        className={floatOpen ? 'title-bar-button is-on' : 'title-bar-button'}
        aria-label="悬浮窗"
        aria-pressed={floatOpen}
        title={floatLabel}
        onClick={onToggleFloat}
      >
        <FloatIcon size={18} />
      </button>
      <button type="button" className="title-bar-button" aria-label="设置" title="设置" onClick={onOpenSettings}>
        <SettingsIcon />
      </button>
    </header>
  )
}
