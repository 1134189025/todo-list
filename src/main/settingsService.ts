import { canonicalize, validate } from '@shared/accelerator'
import type { PublicSettings, Result, SettingsPatch } from '@shared/api'
import { fail, ok } from '@shared/result'
import type { HotkeyManager } from './hotkey'
import { setOpenAtLogin } from './loginItem'
import type { SettingsStore } from './store/settingsStore'

function resolveAccelerator(text: string | null): Result<string | null> {
  if (text === null) return ok(null)
  const check = validate(text)
  if (!check.ok) return fail('HOTKEY_INVALID', check.reason)
  const accelerator = canonicalize(text)
  if (accelerator === null) return fail('HOTKEY_INVALID', '快捷键格式不正确')
  return ok(accelerator)
}

export async function saveSettings(
  store: SettingsStore,
  hotkey: HotkeyManager,
  patch: SettingsPatch
): Promise<Result<PublicSettings>> {
  let accelerator: string | null | undefined
  if (patch.voiceHotkey !== undefined) {
    const resolved = resolveAccelerator(patch.voiceHotkey)
    if (!resolved.ok) return resolved
    accelerator = resolved.data
  }

  const previousHotkey = store.getVoiceHotkey()
  if (accelerator !== undefined) {
    const change = hotkey.change(accelerator)
    if (!change.ok) return change
  }

  const previousOpenAtLogin = store.toPublic().openAtLogin
  if (patch.openAtLogin !== undefined) {
    const applied = setOpenAtLogin(patch.openAtLogin)
    if (!applied.ok) {
      if (accelerator !== undefined) hotkey.change(previousHotkey)
      return applied
    }
  }

  const rollback = (): void => {
    if (accelerator !== undefined) hotkey.change(previousHotkey)
    if (patch.openAtLogin !== undefined) setOpenAtLogin(previousOpenAtLogin)
  }

  const saved = await store.save({ ...patch, voiceHotkey: accelerator })
  if (!saved.ok) rollback()
  return saved
}
