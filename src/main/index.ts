import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createHotkeyManager } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { startScheduler } from './scheduler'
import { configureSandbox } from './sandbox'
import { createSettingsStore } from './store/settingsStore'
import { createTasksStore } from './store/tasksStore'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function start(): Promise<void> {
  const userData = app.getPath('userData')
  const hotkey = createHotkeyManager(() => mainWindow)
  const tasks = createTasksStore(join(userData, 'tasks.json'))
  const settings = createSettingsStore(join(userData, 'settings.json'), () => hotkey.status())
  await Promise.all([tasks.initialize(), settings.load()])

  registerIpcHandlers({ tasks, settings, hotkey })
  const scheduler = startScheduler({ tasks, settings, getWindow: () => mainWindow })
  hotkey.start(settings.getVoiceHotkey())
  mainWindow = createMainWindow({
    savedBounds: settings.getWindowBounds(),
    onBoundsChanged: (bounds) => settings.setWindowBounds(bounds)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  let flushed = false
  app.on('will-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    scheduler.stop()
    hotkey.unregisterAll()
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
