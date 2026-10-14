import { globalShortcut, type BrowserWindow } from 'electron'
import { IPC, type HotkeyStatus, type Result } from '@shared/api'
import { fail, ok } from '@shared/result'
import { isSandbox } from './sandbox'

export type HotkeyManager = {
  start(accelerator: string | null): void
  change(accelerator: string | null): Result<null>
  status(): HotkeyStatus
  unregisterAll(): void
}

export function createHotkeyManager(getWindow: () => BrowserWindow | null): HotkeyManager {
  let registered: string | null = null
  let state: HotkeyStatus = 'off'

  function onPress(): void {
    const win = getWindow()
    if (win === null || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send(IPC.voiceHotkey)
  }

  function tryRegister(accelerator: string): boolean {
    try {
      return globalShortcut.register(accelerator, onPress)
    } catch {
      return false
    }
  }

  function unregisterCurrent(): void {
    if (registered !== null) globalShortcut.unregister(registered)
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
        return fail('HOTKEY_TAKEN', '这个组合被其它程序占用了，换一个吧')
      }
      unregisterCurrent()
      registered = accelerator
      state = 'registered'
      return ok(null)
    },
    status(): HotkeyStatus {
      return isSandbox ? 'sandbox' : state
    },
    unregisterAll(): void {
      if (isSandbox) return
      globalShortcut.unregisterAll()
      registered = null
    }
  }
}
