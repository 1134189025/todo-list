import type { UiohookMouseEvent } from 'uiohook-napi'
import { hookButtonOf } from '@shared/accelerator'

// 鼠标侧键当语音键：Electron 的全局快捷键不支持鼠标，用 uiohook-napi（系统级输入钩子）全局监听。
// 只听不拦：侧键原来的功能（比如浏览器里后退）照常生效，这是用户选定的。

type UiohookModule = typeof import('uiohook-napi')
type Hook = UiohookModule['uIOhook']

// 有的鼠标按一下会连发两次按下事件；300 毫秒内的重复当成一次。
const REPEAT_GUARD_MS = 300

export type MouseHook = {
  /** 开始监听这个侧键；已经在听别的侧键时换成这个。加载或启动失败返回 false。 */
  start(accelerator: string, onPress: () => void): boolean
  /** 正在听的是这个侧键时停下；已经换成别的就不动。 */
  stop(accelerator: string): void
  stopAll(): void
}

export function createMouseHook(): MouseHook {
  let hook: Hook | null = null
  let running = false
  let current: string | null = null
  let listener: ((event: UiohookMouseEvent) => void) | null = null

  // 用到时才加载：原生模块加载失败（缺系统库、被杀毒软件拦下）不影响程序启动，只是侧键用不了。
  function load(): Hook | null {
    if (hook !== null) return hook
    try {
      hook = (require('uiohook-napi') as UiohookModule).uIOhook
    } catch {
      return null
    }
    return hook
  }

  function detach(instance: Hook): void {
    if (listener !== null) instance.removeListener('mousedown', listener)
    listener = null
    current = null
  }

  function stopAll(): void {
    if (hook === null) return
    detach(hook)
    if (running) {
      try {
        hook.stop()
      } catch {
        // 退出时停不下来也没关系，进程马上结束。
      }
      running = false
    }
  }

  return {
    start(accelerator, onPress) {
      const button = hookButtonOf(accelerator)
      const instance = load()
      if (button === null || instance === null) return false
      detach(instance)
      let last = 0
      const next = (event: UiohookMouseEvent): void => {
        if (event.button !== button) return
        const now = Date.now()
        if (now - last < REPEAT_GUARD_MS) return
        last = now
        onPress()
      }
      instance.on('mousedown', next)
      if (!running) {
        try {
          instance.start()
          running = true
        } catch {
          instance.removeListener('mousedown', next)
          return false
        }
      }
      listener = next
      current = accelerator
      return true
    },
    stop(accelerator) {
      if (current === accelerator) stopAll()
    },
    stopAll
  }
}
