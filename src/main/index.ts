import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createFloatWindowManager } from './floatWindow'
import { createHotkeyManager } from './hotkey'
import { createMainCloseHandler } from './mainClose'
import { broadcastSettings, registerIpcHandlers } from './ipc'
import { restrictPermissions } from './permissions'
import { startScheduler } from './scheduler'
import { configureSandbox } from './sandbox'
import { createSettingsService } from './settingsService'
import { createSettingsStore } from './store/settingsStore'
import { createTasksStore } from './store/tasksStore'
import { createTray, type TrayController } from './tray'
import { createMainWindow } from './window'
import { createVoicePillManager } from './voicePill'

let mainWindow: BrowserWindow | null = null
let quitting = false

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function start(): Promise<void> {
  restrictPermissions()
  const userData = app.getPath('userData')
  let tray: TrayController | null = null
  const voicePill = createVoicePillManager()
  const hotkey = createHotkeyManager({ onVoiceHotkey: () => voicePill.trigger() })
  const tasks = createTasksStore(join(userData, 'tasks.json'))
  const settings = createSettingsStore(join(userData, 'settings.json'), {
    hotkeyStatus: () => hotkey.status(),
    trayAvailable: () => tray?.available() ?? false
  })
  await Promise.all([tasks.initialize(), settings.load()])

  const floatWindow = createFloatWindowManager({
    onUserClosed: () => void settingsService.save({ floatWindow: { open: false } }),
    onBoundsChanged: (bounds) => settings.setFloatBounds(bounds),
    isQuitting: () => quitting
  })
  const settingsService = createSettingsService(settings, {
    hotkey,
    applyWindows: () => {
      floatWindow.sync(settings.getFloatWindow())
      tray?.refresh()
    },
    broadcast: broadcastSettings
  })

  registerIpcHandlers({ tasks, settings, settingsService, showMain: focusMainWindow, voicePill })
  const scheduler = startScheduler({ tasks, settings, getWindow: () => mainWindow })
  hotkey.start(settings.getVoiceHotkey())
  const onMainClose = createMainCloseHandler({
    isQuitting: () => quitting,
    trayAvailable: () => tray?.available() ?? false,
    closeAction: () => settings.getCloseAction(),
    remember: (action) => settingsService.save({ closeAction: action }),
    quit: () => app.quit()
  })
  mainWindow = createMainWindow({
    savedBounds: settings.getWindowBounds(),
    onBoundsChanged: (bounds) => settings.setWindowBounds(bounds),
    onClose: onMainClose
  })
  // Windows 关机、注销时不能被「要不要退出」的询问拦住：查询阶段和真正结束时都标记为正在退出，关闭直接放行。
  // （query-session-end 可以 preventDefault 拖延关机，这里不调用它。）
  mainWindow.on('query-session-end', () => {
    quitting = true
  })
  mainWindow.on('session-end', () => {
    quitting = true
  })
  // 主窗口真正关闭（已放行）= 退出程序（悬浮窗还开着也一起退出）。
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })
  tray = createTray({
    floatOpen: () => settings.getFloatWindow().open,
    onShowMain: focusMainWindow,
    onToggleFloat: () => void settingsService.save({ floatWindow: { open: !settings.getFloatWindow().open } }),
    onQuit: () => app.quit()
  })
  floatWindow.sync(settings.getFloatWindow())

  let flushed = false
  app.on('will-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    scheduler.stop()
    hotkey.unregisterAll()
    tray?.destroy()
    void Promise.all([tasks.flush(), settings.flush()]).finally(() => {
      flushed = true
      app.quit()
    })
  })
}

function main(): void {
  if (!configureSandbox()) {
    app.exit(1)
    return
  }
  app.setAppUserModelId('com.qingxin.todo')
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', focusMainWindow)
  // 退出时悬浮窗也会被关掉，这时不能把「悬浮窗已关闭」记进设置，下次启动要照样打开。
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('window-all-closed', () => app.quit())
  app
    .whenReady()
    .then(start)
    .catch(() => {
      process.stderr.write('清新待办启动失败\n')
      app.exit(1)
    })
}

main()
