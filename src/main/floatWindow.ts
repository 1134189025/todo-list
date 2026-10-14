import { BrowserWindow, screen, type Rectangle, type WebContents } from 'electron'
import { isQuietSandbox } from './sandbox'
import type { StoredFloatWindow, WindowBounds } from './store/settingsStore'
import { currentBounds, fitsAnyDisplay, loadRenderer, offscreen, secureWebPreferences } from './windowShared'

const DEFAULT_SIZE = { width: 300, height: 420 }
const MIN_SIZE = { width: 240, height: 240 }
const EDGE_GAP = 24
const BACKGROUND = '#F8FBF7'
const RENDERER_HASH = 'float'

export type FloatWindowManager = {
  /** 按设置打开 / 关闭悬浮窗，并应用置顶和固定。 */
  sync(state: StoredFloatWindow): void
  webContents(): WebContents | null
}

type FloatOptions = {
  /** 用户从悬浮窗自己关掉了它（Alt+F4 等），要把设置改成关闭。 */
  onUserClosed: () => void
  onBoundsChanged: (bounds: WindowBounds) => void
  isQuitting: () => boolean
}

// 没保存过位置、或保存的位置已不在任何屏幕内：放到主屏工作区右上角。
function placementFor(saved: WindowBounds | null): Rectangle {
  if (saved !== null) {
    const width = Math.max(MIN_SIZE.width, saved.width)
    const height = Math.max(MIN_SIZE.height, saved.height)
    const candidate = { x: saved.x, y: saved.y, width, height }
    if (fitsAnyDisplay(candidate)) return candidate
  }
  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(DEFAULT_SIZE.width, area.width)
  const height = Math.min(DEFAULT_SIZE.height, area.height)
  return { x: area.x + area.width - width - EDGE_GAP, y: area.y + EDGE_GAP, width, height }
}

function applyFlags(win: BrowserWindow, state: StoredFloatWindow): void {
  win.setAlwaysOnTop(state.alwaysOnTop, 'floating')
  // 固定：不能拖动也不能改大小；渲染进程同时去掉拖动区域。
  win.setMovable(!state.locked)
  win.setResizable(!state.locked)
  win.setOpacity(state.opacity)
}

export function createFloatWindowManager(options: FloatOptions): FloatWindowManager {
  let win: BrowserWindow | null = null
  // 由程序关掉的窗口（设置改成关闭）；用户自己关的不在这里。
  const closingByApp = new WeakSet<BrowserWindow>()

  function create(state: StoredFloatWindow): BrowserWindow {
    const fitted = placementFor(state.bounds)
    const placement = isQuietSandbox ? offscreen(fitted) : fitted
    const created = new BrowserWindow({
      ...placement,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      show: false,
      frame: false,
      title: '清新待办 · 悬浮窗',
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      resizable: !state.locked,
      movable: !state.locked,
      alwaysOnTop: state.alwaysOnTop,
      backgroundColor: BACKGROUND,
      webPreferences: secureWebPreferences(!isQuietSandbox)
    })
    // 悬浮窗出现时不抢走用户正在用的窗口的焦点。
    created.on('ready-to-show', () => created.showInactive())
    created.on('close', () => options.onBoundsChanged(currentBounds(created)))
    created.on('closed', () => {
      if (win === created) win = null
      if (!closingByApp.has(created) && !options.isQuitting()) options.onUserClosed()
    })
    applyFlags(created, state)
    loadRenderer(created, RENDERER_HASH)
    return created
  }

  return {
    sync(state: StoredFloatWindow): void {
      if (!state.open) {
        if (win !== null && !win.isDestroyed()) {
          const closing = win
          win = null
          closingByApp.add(closing)
          closing.close()
        }
        return
      }
      if (win === null || win.isDestroyed()) {
        win = create(state)
        return
      }
      applyFlags(win, state)
    },
    webContents(): WebContents | null {
      return win === null || win.isDestroyed() ? null : win.webContents
    }
  }
}
