import { session } from 'electron'

// 网页权限默认全给；这里收紧成两项：语音输入用的麦克风（只要声音，不要摄像头），
// 和「复制总结」用的剪贴板写入。都只给自己的页面，其它一律拒绝。

function isOwnPage(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined) return url.startsWith(new URL(devUrl).origin)
  return url.startsWith('file://')
}

export function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (!isOwnPage(details.requestingUrl)) {
      callback(false)
      return
    }
    if (permission === 'media') {
      const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
      callback(types.length > 0 && types.every((type) => type === 'audio'))
      return
    }
    callback(permission === 'clipboard-sanitized-write')
  })
}
