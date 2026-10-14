import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle } from 'electron'
import { join } from 'node:path'
import { isQuietSandbox } from './sandbox'
import type { WindowBounds } from './store/settingsStore'

const DEFAULT_SIZE = { width: 1100, height: 760 }
const MIN_SIZE = { width: 480, height: 560 }
const MAX_WORK_AREA_RATIO = 0.9
const BACKGROUND = '#EDF3EE'
const TITLE_BAR_HEIGHT = 44
const OFFSCREEN_GAP = 200

type WindowOptions = {
  savedBounds: WindowBounds | null
  onBoundsChanged: (bounds: WindowBounds) => void
}

type Size = { width: number; height: number }
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

function fitsWithin(rect: Placement, workArea: Rectangle): boolean {
  return (
    rect.x >= workArea.x &&
    rect.y >= workArea.y &&
    rect.x + rect.width <= workArea.x + workArea.width &&
    rect.y + rect.height <= workArea.y + workArea.height
  )
}

function placementFor(saved: WindowBounds | null): Placement {
  const primaryArea = screen.getPrimaryDisplay().workArea
  if (saved === null) return centered(clampSize(DEFAULT_SIZE, primaryArea), primaryArea)

  const savedArea = screen.getDisplayMatching(saved).workArea
  const size = clampSize(saved, savedArea)
  const candidate: Placement = { x: saved.x, y: saved.y, width: size.width, height: size.height }
  const fits = screen.getAllDisplays().some((display) => fitsWithin(candidate, display.workArea))
  if (fits) return candidate
  return centered(clampSize(saved, primaryArea), primaryArea)
}

// 安静模式：同样的尺寸，放到所有显示器的左边之外。
function offscreen(size: Size): Placement {
  const displays = screen.getAllDisplays().map((display) => display.bounds)
  const left = Math.min(...displays.map((bounds) => bounds.x))
  const top = Math.min(...displays.map((bounds) => bounds.y))
  return { x: left - size.width - OFFSCREEN_GAP, y: top, width: size.width, height: size.height }
}

function currentBounds(win: BrowserWindow): WindowBounds {
  const bounds = win.isMaximized() || win.isMinimized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds()
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: !isQuietSandbox
    }
  }
  const win = new BrowserWindow(windowOptions)

  win.on('ready-to-show', () => (isQuietSandbox ? win.showInactive() : win.show()))
  win.on('close', () => options.onBoundsChanged(currentBounds(win)))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
