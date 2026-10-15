import { globalShortcut } from 'electron'
import { type HotkeyStatus, type Result } from '@shared/api'
import { isMouseAccelerator } from '@shared/accelerator'
import { fail, ok } from '@shared/result'
import { createMouseHook } from './mouseHook'
import { isSandbox } from './sandbox'

/** 某一时刻真正注册着的组合和状态，用来在保存设置失败时原样恢复。 */
export type HotkeySnapshot = { registered: string | null; state: HotkeyStatus }

export type HotkeyManager = {
  start(accelerator: string | null): void
  change(accelerator: string | null): Result<null>
  snapshot(): HotkeySnapshot
  restore(snapshot: HotkeySnapshot): void
  status(): HotkeyStatus
  unregisterAll(): void
}

export function createHotkeyManager(options: { onVoiceHotkey: () => void }): HotkeyManager {
  let registered: string | null = null
  let state: HotkeyStatus = 'off'
  const mouseHook = createMouseHook()

  // 按下语音键：不再弹出主窗口，改为让屏幕底部的语音胶囊开始 / 结束录音。
  function onPress(): void {
    options.onVoiceHotkey()
  }

  function tryRegister(accelerator: string): boolean {
    if (isMouseAccelerator(accelerator)) return mouseHook.start(accelerator, onPress)
    try {
      return globalShortcut.register(accelerator, onPress)
    } catch {
      return false
    }
  }

  function unregisterCurrent(): void {
    if (registered !== null) {
      if (isMouseAccelerator(registered)) mouseHook.stop(registered)
      else globalShortcut.unregister(registered)
    }
    registered = null
  }

  return {
    start(accelerator: string | null): void {
      if (isSandbox) {
        state = 'sandbox'
        return
      }
      if (accelerator === null) {
        state = 'off'
        return
      }
      if (tryRegister(accelerator)) {
        registered = accelerator
        state = 'registered'
      } else {
        state = 'failed'
      }
    },
    change(accelerator: string | null): Result<null> {
      if (isSandbox) return ok(null)
      if (accelerator === registered) {
        state = registered === null ? 'off' : 'registered'
        return ok(null)
      }
      if (accelerator === null) {
        unregisterCurrent()
        state = 'off'
        return ok(null)
      }
      if (!tryRegister(accelerator)) {
        return fail(
          'HOTKEY_TAKEN',
          isMouseAccelerator(accelerator) ? '鼠标侧键监听没能启动，换个组合键试试' : '这个组合被其它程序占用了，换一个吧'
        )
      }
      unregisterCurrent()
      registered = accelerator
      state = 'registered'
      return ok(null)
    },
    snapshot(): HotkeySnapshot {
      return { registered, state }
    },
    restore(snapshot: HotkeySnapshot): void {
      if (isSandbox) return
      if (snapshot.registered !== registered) {
        unregisterCurrent()
        if (snapshot.registered !== null && tryRegister(snapshot.registered)) registered = snapshot.registered
      }
      state = snapshot.registered !== null && registered === null ? 'failed' : snapshot.state
    },
    status(): HotkeyStatus {
      return isSandbox ? 'sandbox' : state
    },
    unregisterAll(): void {
      if (isSandbox) return
      globalShortcut.unregisterAll()
      mouseHook.stopAll()
      registered = null
    }
  }
}
