import { toLabel } from '@shared/accelerator'
import type { HotkeyStatus } from '@shared/api'

export function hotkeyKeys(accelerator: string): string[] {
  return toLabel(accelerator).split(' + ')
}

export function hotkeyStatusText(status: HotkeyStatus, accelerator: string | null): string {
  if (accelerator === null) return '未使用，可以设置一个组合键'
  switch (status) {
    case 'registered':
      return '已生效，在任何窗口按下即可说话'
    case 'failed':
      return '被其它程序占用，请换一个组合键'
    case 'sandbox':
      return '挡板模式不注册，只保存设置'
    case 'off':
      return '未使用，可以设置一个组合键'
  }
}
