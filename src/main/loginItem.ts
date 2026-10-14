import { app } from 'electron'
import type { Result } from '@shared/api'
import { fail, ok } from '@shared/result'
import { isSandbox } from './sandbox'

// 挡板模式下没有真实的开机启动项，状态以保存的设置为准。
export function openAtLoginStatus(stored: boolean): boolean {
  if (isSandbox) return stored
  return app.getLoginItemSettings().openAtLogin
}

export function setOpenAtLogin(enabled: boolean): Result<null> {
  if (isSandbox) return ok(null)
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return ok(null)
  } catch {
    return fail('IO', '无法设置开机自动打开')
  }
}
