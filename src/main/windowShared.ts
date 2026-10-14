import { screen, type BrowserWindow, type Rectangle, type WebPreferences } from 'electron'
import { join } from 'node:path'
import type { WindowBounds } from './store/settingsStore'

const OFFSCREEN_GAP = 200

export type Size = { width: number; height: number }

/** 主窗口和悬浮窗共用的安全设置。 */
export function secureWebPreferences(backgroundThrottling: boolean): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    backgroundThrottling
  }
}

/** 不跳转、不开新窗口，再加载渲染进程页面；hash 用来区分主窗口和悬浮窗。 */
export function loadRenderer(win: BrowserWindow, hash: string | null): void {
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined) {
    void win.loadURL(hash === null ? devUrl : `${devUrl}#${hash}`)
  } else {
    const file = join(__dirname, '../renderer/index.html')
    void win.loadFile(file, hash === null ? undefined : { hash })
  }
}

export function fitsWithin(rect: Rectangle, workArea: Rectangle): boolean {
  return (
    rect.x >= workArea.x &&
    rect.y >= workArea.y &&
    rect.x + rect.width <= workArea.x + workArea.width &&
    rect.y + rect.height <= workArea.y + workArea.height
  )
}

/** 窗口必须整个落在某个显示器的工作区内。 */
export function fitsAnyDisplay(rect: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => fitsWithin(rect, display.workArea))
}

// 安静模式：同样的尺寸，放到所有显示器的左边之外。
export function offscreen(size: Size): Rectangle {
  const displays = screen.getAllDisplays().map((display) => display.bounds)
  const left = Math.min(...displays.map((bounds) => bounds.x))
  const top = Math.min(...displays.map((bounds) => bounds.y))
  return { x: left - size.width - OFFSCREEN_GAP, y: top, width: size.width, height: size.height }
}

export function currentBounds(win: BrowserWindow): WindowBounds {
  const bounds = win.isMaximized() || win.isMinimized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}
