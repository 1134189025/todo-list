import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
import iconPath from '../../build/icon.png?asset'
import { isQuietSandbox } from './sandbox'

const TOOLTIP = '清新待办'

export type TrayController = {
  /** 托盘图标是否存在；不存在时最小化不能隐藏窗口，否则找不回来。 */
  available(): boolean
  /** 设置变了以后重建菜单（悬浮窗的勾选状态）。 */
  refresh(): void
  destroy(): void
}

type TrayOptions = {
  floatOpen: () => boolean
  onShowMain: () => void
  onToggleFloat: () => void
  onQuit: () => void
}

// 托盘图标 16px，高 DPI 下用 32px，都从同一张大图缩出来。
function trayImage(): NativeImage {
  const source = nativeImage.createFromPath(iconPath)
  const image = nativeImage.createEmpty()
  for (const scaleFactor of [1, 2]) {
    const size = 16 * scaleFactor
    image.addRepresentation({
      scaleFactor,
      width: size,
      height: size,
      dataURL: source.resize({ width: size, height: size, quality: 'best' }).toDataURL()
    })
  }
  return image
}

const NO_TRAY: TrayController = { available: () => false, refresh: () => undefined, destroy: () => undefined }

export function createTray(options: TrayOptions): TrayController {
  // 挡板安静模式给自动化验收用，不往用户的任务栏通知区域放图标。
  if (isQuietSandbox) return NO_TRAY
  let tray: Tray
  try {
    tray = new Tray(trayImage())
  } catch {
    return NO_TRAY
  }
  tray.setToolTip(TOOLTIP)
  tray.on('click', options.onShowMain)

  function refresh(): void {
    if (tray.isDestroyed()) return
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开清新待办', click: options.onShowMain },
        { label: '悬浮窗', type: 'checkbox', checked: options.floatOpen(), click: options.onToggleFloat },
        { type: 'separator' },
        { label: '退出', click: options.onQuit }
      ])
    )
  }

  refresh()
  return {
    available: () => !tray.isDestroyed(),
    refresh,
    destroy(): void {
      if (!tray.isDestroyed()) tray.destroy()
    }
  }
}
