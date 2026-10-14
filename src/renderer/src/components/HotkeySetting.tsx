import { useEffect, useState, type KeyboardEvent } from 'react'
import { DEFAULT_VOICE_HOTKEY, fromMouseButton } from '@shared/accelerator'
import type { PublicSettings } from '@shared/api'
import { hotkeyKeys, hotkeyStatusText } from '../lib/hotkeyText'
import { interpretRecordingKey } from '../lib/hotkeyRecord'
import type { SettingsActions } from '../state/useSettings'
import { SettingRow } from './SettingRow'
import './HotkeySetting.css'

type HotkeySettingProps = {
  hotkey: PublicSettings['voiceHotkey']
  save: SettingsActions['save']
}

export function HotkeySetting({ hotkey, save }: HotkeySettingProps) {
  const [recording, setRecording] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function apply(accelerator: string | null): Promise<void> {
    setBusy(true)
    const result = await save({ voiceHotkey: accelerator })
    setBusy(false)
    setRecording(false)
    setHint(null)
    setError(result.ok ? null : result.error.message)
  }

  // 录制时按鼠标侧键（在窗口里任何地方）就用这个侧键。
  useEffect(() => {
    if (!recording || busy) return
    function onMouseDown(event: MouseEvent): void {
      const accelerator = fromMouseButton(event.button)
      if (accelerator === null) return
      event.preventDefault()
      event.stopPropagation()
      void apply(accelerator)
    }
    window.addEventListener('mousedown', onMouseDown, true)
    return () => window.removeEventListener('mousedown', onMouseDown, true)
  })

  function stopRecording(): void {
    setRecording(false)
    setHint(null)
  }

  function startRecording(): void {
    if (recording || busy) return
    setRecording(true)
    setHint(null)
    setError(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!recording || busy || event.key === 'Tab') return
    event.preventDefault()
    if (event.nativeEvent.isComposing) return
    const action = interpretRecordingKey(event)
    switch (action.type) {
      case 'wait':
        return
      case 'cancel':
        stopRecording()
        return
      case 'clear':
        void apply(null)
        return
      case 'invalid':
        setHint(action.reason)
        return
      case 'set':
        void apply(action.accelerator)
        return
    }
  }

  const keys = hotkey.accelerator === null ? null : hotkeyKeys(hotkey.accelerator)

  return (
    <SettingRow
      title="语音快捷键"
      description={hotkeyStatusText(hotkey.status, hotkey.accelerator)}
      control={
        <>
          {keys === null ? (
            <span className="hotkey-none">未使用</span>
          ) : (
            <span className="hotkey-keys">
              {keys.map((key) => (
                <kbd key={key} className="hotkey-key">
                  {key}
                </kbd>
              ))}
            </span>
          )}
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={startRecording}
            onKeyDown={handleKeyDown}
            onBlur={stopRecording}
          >
            {recording ? '按键中…' : '修改'}
          </button>
          <button
            type="button"
            className="settings-button"
            disabled={busy || recording}
            onClick={() => void apply(DEFAULT_VOICE_HOTKEY)}
          >
            恢复默认
          </button>
        </>
      }
      footer={
        <>
          {recording && (
            <p className="settings-feedback" role="status">
              请按下新的组合键，或按一下鼠标侧键（Esc 取消，Backspace 不使用快捷键）
            </p>
          )}
          {hint !== null && (
            <p className="settings-feedback is-error" role="alert">
              {hint}
            </p>
          )}
          {error !== null && (
            <p className="settings-feedback is-error" role="alert">
              {error}
            </p>
          )}
        </>
      }
    />
  )
}
