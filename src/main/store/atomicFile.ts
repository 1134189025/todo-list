import { constants, promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const RETRY_ERROR_CODES = new Set(['EPERM', 'EBUSY'])
const RETRY_COUNT = 3
const RETRY_DELAY_MS = 100

export type WriteResult = { ok: true } | { ok: false; message: string }

export type QueuedWriter = {
  write(content: string): Promise<WriteResult>
  flush(): Promise<void>
}

export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      const code = errorCode(error)
      if (code === null || !RETRY_ERROR_CODES.has(code) || attempt >= RETRY_COUNT) throw error
      await sleep(RETRY_DELAY_MS)
    }
  }
}

// 尽力删除临时文件；删不掉也不抛错，原来的写入错误照常抛给调用方。
async function removeTempFile(tempPath: string): Promise<void> {
  await fs.rm(tempPath, { force: true }).catch(() => undefined)
}

export async function writeFileAtomic(target: string, content: string): Promise<void> {
  const tempPath = `${target}.tmp`
  await fs.mkdir(dirname(target), { recursive: true })
  try {
    const handle = await fs.open(tempPath, 'w')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await renameWithRetry(tempPath, target)
  } catch (error) {
    await removeTempFile(tempPath)
    throw error
  }
}

function corruptBackupName(target: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const extension = extname(target)
  return `${basename(target, extension)}.corrupt-${stamp}${extension}`
}

// 整个文件读不懂时使用：改名后原文件不再存在。
export async function quarantineCorruptFile(target: string): Promise<string> {
  const backupName = corruptBackupName(target)
  await renameWithRetry(target, join(dirname(target), backupName))
  return backupName
}

// 部分任务不合法时使用：只复制，原文件保持不动，COPYFILE_EXCL 保证不覆盖已有备份。
export async function copyToCorruptBackup(target: string): Promise<string> {
  const backupName = corruptBackupName(target)
  await fs.copyFile(target, join(dirname(target), backupName), constants.COPYFILE_EXCL)
  return backupName
}

export function createQueuedWriter(target: string): QueuedWriter {
  let pending: string | null = null
  let running: Promise<WriteResult> | null = null

  async function drain(): Promise<WriteResult> {
    let last: WriteResult = { ok: true }
    while (pending !== null) {
      const content = pending
      pending = null
      try {
        await writeFileAtomic(target, content)
        last = { ok: true }
      } catch {
        last = { ok: false, message: '写入数据文件失败' }
      }
    }
    running = null
    return last
  }

  return {
    write(content: string): Promise<WriteResult> {
      pending = content
      if (running === null) running = drain()
      return running
    },
    async flush(): Promise<void> {
      while (running !== null) await running
    }
  }
}
