import { app } from 'electron'
import { isAbsolute } from 'node:path'
import { fail, ok } from '@shared/result'
import type { Result } from '@shared/api'

const SANDBOX_ENV = 'QINGXIN_SANDBOX'
const DATA_DIR_ENV = 'QINGXIN_DATA_DIR'
const QUIET_ENV = 'QINGXIN_SANDBOX_QUIET'
const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

export const isSandbox = process.env[SANDBOX_ENV] === '1'

/**
 * 挡板安静模式（只在挡板模式下生效）：窗口放在所有屏幕之外、不抢焦点、不进任务栏，
 * 给自动化验收反复启动用，不打扰正在用电脑的人。界面照常绘制，截图和 CDP 操作不受影响。
 */
export const isQuietSandbox = isSandbox && process.env[QUIET_ENV] === '1'

export function configureSandbox(): boolean {
  if (!isSandbox) return true
  const dataDir = process.env[DATA_DIR_ENV]
  if (dataDir === undefined || dataDir === '' || !isAbsolute(dataDir)) {
    process.stderr.write(`挡板模式需要同时设置 ${DATA_DIR_ENV}（绝对路径），程序已退出。\n`)
    return false
  }
  app.setPath('userData', dataDir)
  // 窗口在屏幕外时 Windows 会把它当成被遮挡、停止绘制，截图就是空白；安静模式下关掉这项检测。
  if (isQuietSandbox) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  return true
}

export function checkSandboxUrl(baseUrl: string): Result<null> {
  if (!isSandbox) return ok(null)
  try {
    if (ALLOWED_HOSTNAMES.has(new URL(baseUrl).hostname)) return ok(null)
  } catch {
    return fail('SANDBOX_BLOCKED', '挡板模式下只允许连接本机的 AI 服务地址')
  }
  return fail('SANDBOX_BLOCKED', '挡板模式下只允许连接本机的 AI 服务地址')
}
