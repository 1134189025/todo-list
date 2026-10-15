import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { IPC, type PillSize } from '@shared/api'
import { isQuietSandbox } from './sandbox'
import { loadRenderer, offscreen, secureWebPreferences, type Size } from './windowShared'

// 语音胶囊：按语音键时在鼠标所在屏幕的底部弹出的小窗口。
// 它不抢焦点（用户可能正在别的程序里打字）、不进任务栏、压在全屏应用上面。
// 第一次用时创建，之后隐藏复用；页面按内容自己申请大小，主进程保持底边不动向上长。
// 每次显示、改大小后都重新置顶（见 raiseToTop）：Windows 上窗口隐藏再显示，topmost 可能被别的置顶窗口压住。

const DEFAULT_SIZE = { width: 260, height: 72 }
const EDGE_GAP = 48
const RENDERER_HASH = 'voice'

/** 窗口底边的中点和下沿：显示时按鼠标所在屏幕算，之后改大小都围绕这个位置。 */
type Anchor = { centerX: number; bottom: number }

export type VoicePillManager = {
  /** 语音键 / 悬浮窗的语音按钮：显示胶囊并让它开始或结束录音。 */
  trigger(): void
  /** 页面加载完，可以把排队等着的那次触发补发出去。 */
  ready(): void
  /** 页面按内容申请的大小；主进程已经校验过范围。 */
  resize(size: PillSize): void
  hide(): void
  webContents(): WebContents | null
}

function anchorFor(): Anchor {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  return { centerX: area.x + Math.round(area.width / 2), bottom: area.y + area.height - EDGE_GAP }
}

/** 安静挡板模式下放到所有屏幕之外；否则在锚点上水平居中、底边对齐。 */
function placementFor(size: Size, anchor: Anchor): Rectangle {
  if (isQuietSandbox) return offscreen(size)
  return {
    x: anchor.centerX - Math.round(size.width / 2),
    y: anchor.bottom - size.height,
    width: size.width,
    height: size.height
  }
}

/** 重新声明置顶并顶到最上面（不激活）：每次显示、改大小后调用，压住别的置顶窗口（任务栏、其它置顶程序）。 */
function raiseToTop(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, 'screen-saver')
  win.moveTop()
}

export function createVoicePillManager(): VoicePillManager {
  let win: BrowserWindow | null = null
  let ready = false
  // 页面还没加载完时收到的触发：加载完补发一次。
  let queued = false
  let anchor: Anchor | null = null

  function create(): BrowserWindow {
    const created = new BrowserWindow({
      ...DEFAULT_SIZE,
      x: -DEFAULT_SIZE.width,
      y: 0,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // 不抢焦点：按下语音键时用户正在别的程序里打字，焦点必须留在原处。
      focusable: false,
      hasShadow: false,
      title: '清新待办 · 语音',
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      webPreferences: secureWebPreferences(!isQuietSandbox)
    })
    // 全屏应用之上也要能看到。
    created.setAlwaysOnTop(true, 'screen-saver')
    created.on('closed', () => {
      if (win === created) {
        win = null
        ready = false
        queued = false
      }
    })
    loadRenderer(created, RENDERER_HASH)
    return created
  }

  function send(): void {
    if (win === null || win.isDestroyed()) return
    win.webContents.send(IPC.voiceHotkey)
  }

  return {
    trigger(): void {
      if (win === null || win.isDestroyed()) win = create()
      if (!ready) {
        queued = true
        return
      }
      const bounds = win.getBounds()
      anchor = anchorFor()
      win.setBounds(placementFor({ width: bounds.width, height: bounds.height }, anchor))
      // 出现时不从用户正在用的窗口抢走焦点。
      win.showInactive()
      raiseToTop(win)
      send()
    },
    ready(): void {
      ready = true
      if (!queued) return
      queued = false
      // 补发时要先把窗口摆到鼠标所在的屏幕上（触发时页面还没加载完，没摆过）。
      const current = win
      if (current !== null && !current.isDestroyed()) {
        const bounds = current.getBounds()
        anchor = anchorFor()
        current.setBounds(placementFor({ width: bounds.width, height: bounds.height }, anchor))
        current.showInactive()
        raiseToTop(current)
      }
      send()
    },
    resize(size: PillSize): void {
      const current = win
      if (current === null || current.isDestroyed()) return
      current.setBounds(placementFor(size, anchor ?? anchorFor()))
      raiseToTop(current)
    },
    hide(): void {
      if (win !== null && !win.isDestroyed()) win.hide()
    },
    webContents(): WebContents | null {
      return win === null || win.isDestroyed() ? null : win.webContents
    }
  }
}
