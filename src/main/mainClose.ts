import { dialog, type BrowserWindow } from 'electron'
import type { CloseAction } from '@shared/api'

export type MainCloseOptions = {
  /** 程序已经在退出（托盘「退出」、对话框选了退出、系统关机注销等）：关闭直接放行。 */
  isQuitting(): boolean
  trayAvailable(): boolean
  closeAction(): CloseAction
  /** 把「记住的选择」存进设置；只会收到 'tray' 或 'quit'。 */
  remember(action: 'tray' | 'quit'): Promise<unknown>
  quit(): void
}

export type MainCloseHandler = (win: BrowserWindow, event: Electron.Event) => void

const TRAY_BUTTON = 0
const CANCEL_BUTTON = 2

/**
 * 主窗口 close 事件的判断顺序：
 * 1. 程序正在退出 → 放行；
 * 2. 托盘不可用 → 放行（隐藏后就找不回来了）；
 * 3. 设置为直接退出 → 放行；
 * 4. 设置为收到托盘 → 拦下并隐藏；
 * 5. 设置为每次询问 → 拦下并弹对话框；对话框还开着时再次关闭只拦下、不再叠一个。
 */
export function createMainCloseHandler(options: MainCloseOptions): MainCloseHandler {
  let asking = false

  async function remember(action: 'tray' | 'quit'): Promise<void> {
    try {
      await options.remember(action)
    } catch {
      // 保存设置失败不影响这次关闭。
    }
  }

  async function ask(win: BrowserWindow): Promise<void> {
    asking = true
    try {
      // 窗口最小化时对话框可能看不见，先还原。
      if (win.isMinimized()) win.restore()
      const { response, checkboxChecked } = await dialog.showMessageBox(win, {
        type: 'question',
        title: '关闭清新待办',
        message: '要把清新待办收到任务栏右下角的托盘里，还是直接退出？收到托盘后语音键和悬浮窗照常可用。',
        buttons: ['最小化到托盘', '退出程序', '取消'],
        defaultId: TRAY_BUTTON,
        cancelId: CANCEL_BUTTON,
        noLink: true,
        checkboxLabel: '记住我的选择，不再询问',
        checkboxChecked: false
      })
      if (response === CANCEL_BUTTON) return
      if (response === TRAY_BUTTON) {
        if (!win.isDestroyed()) win.hide()
        if (checkboxChecked) void remember('tray')
        return
      }
      if (checkboxChecked) await remember('quit')
      options.quit()
    } finally {
      asking = false
    }
  }

  return (win, event) => {
    if (options.isQuitting() || !options.trayAvailable()) return
    const action = options.closeAction()
    if (action === 'quit') return
    event.preventDefault()
    if (action === 'tray') {
      win.hide()
      return
    }
    if (!asking) void ask(win)
  }
}
