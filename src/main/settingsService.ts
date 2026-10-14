import { canonicalize, validate } from '@shared/accelerator'
import type { PublicSettings, Result, SettingsPatch } from '@shared/api'
import { fail, ok } from '@shared/result'
import type { HotkeyManager } from './hotkey'
import { setOpenAtLogin } from './loginItem'
import type { SettingsStore } from './store/settingsStore'

/** 设置变了以后要跟着变的东西：悬浮窗、托盘菜单、各窗口里的界面。 */
export type SettingsEffects = {
  hotkey: HotkeyManager
  applyWindows(): void
  broadcast(settings: PublicSettings): void
}

export type SettingsService = {
  get(): Promise<Result<PublicSettings>>
  save(patch: SettingsPatch): Promise<Result<PublicSettings>>
  setApiKey(key: string): Promise<Result<PublicSettings>>
  clearApiKey(): Promise<Result<PublicSettings>>
}

function resolveAccelerator(text: string | null): Result<string | null> {
  if (text === null) return ok(null)
  const check = validate(text)
  if (!check.ok) return fail('HOTKEY_INVALID', check.reason)
  const accelerator = canonicalize(text)
  if (accelerator === null) return fail('HOTKEY_INVALID', '快捷键格式不正确')
  return ok(accelerator)
}

export function createSettingsService(store: SettingsStore, effects: SettingsEffects): SettingsService {
  const { hotkey } = effects

  function changed(result: Result<PublicSettings>): Result<PublicSettings> {
    if (result.ok) {
      effects.applyWindows()
      effects.broadcast(result.data)
    }
    return result
  }

  // 启动时没读到设置（文件被短暂占用等）：之后用到时再读一次，读到了就把快捷键和窗口按文件里的值重新应用。
  async function ensureLoaded(): Promise<Result<null>> {
    if (store.isLoaded()) return ok(null)
    const loaded = await store.load()
    if (loaded.ok) {
      hotkey.change(store.getVoiceHotkey())
      changed(ok(store.toPublic()))
    }
    return loaded
  }

  async function save(patch: SettingsPatch): Promise<Result<PublicSettings>> {
    const loaded = await ensureLoaded()
    if (!loaded.ok) return loaded

    let accelerator: string | null | undefined
    if (patch.voiceHotkey !== undefined) {
      const resolved = resolveAccelerator(patch.voiceHotkey)
      if (!resolved.ok) return resolved
      accelerator = resolved.data
    }

    const hotkeyBefore = hotkey.snapshot()
    if (accelerator !== undefined) {
      const change = hotkey.change(accelerator)
      if (!change.ok) return change
    }

    const previousOpenAtLogin = store.toPublic().openAtLogin
    if (patch.openAtLogin !== undefined) {
      const applied = setOpenAtLogin(patch.openAtLogin)
      if (!applied.ok) {
        hotkey.restore(hotkeyBefore)
        return applied
      }
    }

    const saved = await store.save({ ...patch, voiceHotkey: accelerator })
    if (!saved.ok) {
      hotkey.restore(hotkeyBefore)
      if (patch.openAtLogin !== undefined) setOpenAtLogin(previousOpenAtLogin)
    }
    return changed(saved)
  }

  return {
    async get(): Promise<Result<PublicSettings>> {
      const loaded = await ensureLoaded()
      if (!loaded.ok) return loaded
      return ok(store.toPublic())
    },
    save,
    async setApiKey(key: string): Promise<Result<PublicSettings>> {
      const loaded = await ensureLoaded()
      if (!loaded.ok) return loaded
      return changed(await store.setApiKey(key))
    },
    async clearApiKey(): Promise<Result<PublicSettings>> {
      const loaded = await ensureLoaded()
      if (!loaded.ok) return loaded
      return changed(await store.clearApiKey())
    }
  }
}
