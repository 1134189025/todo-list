import { useState } from 'react'
import type { PublicSettings, SettingsPatch } from '@shared/api'
import type { SettingsActions } from '../state/useSettings'
import { SettingRow } from './SettingRow'
import { Switch } from './Switch'

type WindowSettingsProps = {
  settings: PublicSettings
  save: SettingsActions['save']
}

/** 设置里的「窗口」：最小化到托盘、悬浮窗开关、置顶、固定。 */
export function WindowSettings({ settings, save }: WindowSettingsProps) {
  const [error, setError] = useState<string | null>(null)
  const { floatWindow } = settings

  async function apply(patch: SettingsPatch): Promise<void> {
    const result = await save(patch)
    setError(result.ok ? null : result.error.message)
  }

  return (
    <>
      <div className="settings-card">
        <SettingRow
          title="最小化到托盘"
          description={
            settings.trayAvailable
              ? '点最小化时隐藏到任务栏右下角的托盘，点托盘图标就能找回'
              : '现在没有托盘图标，最小化照常留在任务栏'
          }
          control={
            <Switch
              checked={settings.minimizeToTray}
              label="最小化到托盘"
              onChange={(next) => void apply({ minimizeToTray: next })}
            />
          }
        />
        <SettingRow
          title="悬浮窗"
          description="在桌面上用小窗口显示今天的待办，可以直接勾选和添加"
          control={
            <Switch
              checked={floatWindow.open}
              label="悬浮窗"
              onChange={(next) => void apply({ floatWindow: { open: next } })}
            />
          }
        />
        <SettingRow
          title="悬浮窗置顶"
          description="悬浮窗始终显示在其它窗口上面"
          control={
            <Switch
              checked={floatWindow.alwaysOnTop}
              label="悬浮窗置顶"
              onChange={(next) => void apply({ floatWindow: { alwaysOnTop: next } })}
            />
          }
        />
        <SettingRow
          title="固定悬浮窗"
          description="固定后不能拖动、不能改大小，免得误碰"
          control={
            <Switch
              checked={floatWindow.locked}
              label="固定悬浮窗"
              onChange={(next) => void apply({ floatWindow: { locked: next } })}
            />
          }
        />
      </div>
      {error !== null && (
        <p className="settings-feedback is-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
