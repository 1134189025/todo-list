import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle } from 'electron'
import { isQuietSandbox } from './sandbox'
import type { WindowBounds } from './store/settingsStore'
import {
  currentBounds,
  fitsAnyDisplay,
  loadRenderer,
  offscreen,
  secureWebPreferences,
  type Size
} from './windowShared'

const DEFAULT_SIZE = { width: 1240, height: 780 }
const MIN_SIZE = { width: 480, height: 560 }
const MAX_WORK_AREA_RATIO = 0.9
const BACKGROUND = '#EDF3EE'
const TITLE_BAR_HEIGHT = 44

type WindowOptions = {
  savedBounds: WindowBounds | null
  onBoundsChanged: (bounds: WindowBounds) => void
  /** 主窗口 close 事件：判断放行还是拦下，见 mainClose.ts。 */
  onClose: (win: BrowserWindow, event: Electron.Event) => void
}

type Placement = Rectangle

function clampSize(size: Size, workArea: Rectangle): Size {
  const maxWidth = Math.floor(workArea.width * MAX_WORK_AREA_RATIO)
  const maxHeight = Math.floor(workArea.height * MAX_WORK_AREA_RATIO)
  return {
    width: Math.max(MIN_SIZE.width, Math.min(size.width, maxWidth)),
    height: Math.max(MIN_SIZE.height, Math.min(size.height, maxHeight))
  }
}

function centered(size: Size, workArea: Rectangle): Placement {
  return {
    x: workArea.x + Math.round((workArea.width - size.width) / 2),
    y: workArea.y + Math.round((workArea.height - size.height) / 2),
    width: size.width,
    height: size.height
  }
}

function placementFor(saved: WindowBounds | null): Placement {
  const primaryArea = screen.getPrimaryDisplay().workArea
  if (saved === null) return centered(clampSize(DEFAULT_SIZE, primaryArea), primaryArea)

  const savedArea = screen.getDisplayMatching(saved).workArea
  const size = clampSize(saved, savedArea)
  const candidate: Placement = { x: saved.x, y: saved.y, width: size.width, height: size.height }
  if (fitsAnyDisplay(candidate)) return candidate
  return centered(clampSize(saved, primaryArea), primaryArea)
}

export function createMainWindow(options: WindowOptions): BrowserWindow {
  const fitted = placementFor(options.savedBounds)
  const placement = isQuietSandbox ? offscreen(fitted) : fitted
  const windowOptions: BrowserWindowConstructorOptions = {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    skipTaskbar: isQuietSandbox,
    backgroundColor: BACKGROUND,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BACKGROUND, symbolColor: '#24332C', height: TITLE_BAR_HEIGHT },
    webPreferences: secureWebPreferences(!isQuietSandbox)
  }
  const win = new BrowserWindow(windowOptions)

  win.on('ready-to-show', () => (isQuietSandbox ? win.showInactive() : win.show()))
  // 先保存窗口位置（隐藏到托盘时也要记），再交给关闭判断。
  win.on('close', (event) => {
    options.onBoundsChanged(currentBounds(win))
    options.onClose(win, event)
  })
  loadRenderer(win, null)
  return win
}
