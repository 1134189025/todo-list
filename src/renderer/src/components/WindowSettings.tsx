import { useEffect, useRef, useState } from 'react'
import { FLOAT_OPACITY_MIN, type CloseAction, type PublicSettings, type SettingsPatch } from '@shared/api'
import type { SettingsActions } from '../state/useSettings'
import { SettingRow } from './SettingRow'
import { Switch } from './Switch'

type WindowSettingsProps = {
  settings: PublicSettings
  save: SettingsActions['save']
}

const OPACITY_SAVE_DELAY_MS = 200

const CLOSE_ACTION_OPTIONS: { value: CloseAction; label: string }[] = [
  { value: 'ask', label: '每次询问' },
  { value: 'tray', label: '最小化到托盘' },
  { value: 'quit', label: '直接退出' }
]

/** 设置里的「窗口」：关闭主窗口时的处理、悬浮窗开关、置顶、固定、不透明度。 */
export function WindowSettings({ settings, save }: WindowSettingsProps) {
  const [error, setError] = useState<string | null>(null)
  const { floatWindow } = settings
  // 拖动滑块时先改显示，停一下再保存（悬浮窗跟着变），不用每动一格写一次设置文件。
  const [opacity, setOpacity] = useState(floatWindow.opacity)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => setOpacity(floatWindow.opacity), [floatWindow.opacity])
  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    },
    []
  )

  async function apply(patch: SettingsPatch): Promise<void> {
    const result = await save(patch)
    setError(result.ok ? null : result.error.message)
  }

  function changeOpacity(percent: number): void {
    const next = Math.min(1, Math.max(FLOAT_OPACITY_MIN, percent / 100))
    setOpacity(next)
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void apply({ floatWindow: { opacity: next } }), OPACITY_SAVE_DELAY_MS)
  }

  return (
    <>
      <div className="settings-card">
        <SettingRow
          title="关闭主窗口时"
          description={
            settings.trayAvailable
              ? '点 × 关闭时：每次询问，或收到托盘（点托盘图标可以找回），或直接退出'
              : '现在没有托盘图标，关闭主窗口会直接退出'
          }
          control={
            <select
              className="settings-input settings-select"
              aria-label="关闭主窗口时"
              value={settings.closeAction}
              onChange={(event) => {
                const next = CLOSE_ACTION_OPTIONS.find((item) => item.value === event.target.value)
                if (next !== undefined) void apply({ closeAction: next.value })
              }}
            >
              {CLOSE_ACTION_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
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
        <SettingRow
          title="悬浮窗不透明度"
          description={`${Math.round(opacity * 100)}%，调低一点能透出后面的窗口`}
          control={
            <input
              type="range"
              className="settings-range"
              aria-label="悬浮窗不透明度"
              min={Math.round(FLOAT_OPACITY_MIN * 100)}
              max={100}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(event) => changeOpacity(Number(event.target.value))}
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
