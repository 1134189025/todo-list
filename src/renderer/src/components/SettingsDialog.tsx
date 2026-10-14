import type { PublicSettings } from '@shared/api'
import type { SettingsActions } from '../state/useSettings'
import { AiServiceForm } from './AiServiceForm'
import { AutoSummaryRow } from './AutoSummaryRow'
import { HotkeySetting } from './HotkeySetting'
import { Notice } from './Notice'
import { OpenAtLoginRow } from './OpenAtLoginRow'
import { WindowSettings } from './WindowSettings'
import './SettingsDialog.css'

type SettingsDialogProps = {
  settings: PublicSettings | null
  loadError: string | null
  actions: SettingsActions
}

export function SettingsDialog({ settings, loadError, actions }: SettingsDialogProps) {
  if (settings === null) {
    return loadError === null ? (
      <Notice tone="muted">正在读取设置…</Notice>
    ) : (
      <Notice tone="danger">无法读取设置：{loadError}</Notice>
    )
  }

  return (
    <div className="settings">
      <section className="settings-section" aria-labelledby="settings-ai-title">
        <h3 id="settings-ai-title" className="settings-title">
          AI 服务
        </h3>
        <AiServiceForm ai={settings.ai} encryptionAvailable={settings.encryptionAvailable} actions={actions} />
      </section>
      <section className="settings-section" aria-labelledby="settings-window-title">
        <h3 id="settings-window-title" className="settings-title">
          窗口
        </h3>
        <WindowSettings settings={settings} save={actions.save} />
      </section>
      <div className="settings-card">
        <AutoSummaryRow autoSummary={settings.autoSummary} save={actions.save} />
        <OpenAtLoginRow checked={settings.openAtLogin} save={actions.save} />
        <HotkeySetting hotkey={settings.voiceHotkey} save={actions.save} />
      </div>
      <p className="settings-footnote">语音识别本版还没接入，按下快捷键会先提示</p>
    </div>
  )
}
