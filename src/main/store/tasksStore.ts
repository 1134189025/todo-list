import { promises as fs } from 'node:fs'
import {
  copyToCorruptBackup,
  createQueuedWriter,
  errorCode,
  quarantineCorruptFile,
  stripBom,
  type QueuedWriter
} from './atomicFile'
import { fail, ok } from '@shared/result'
import type { Result } from '@shared/api'
import { applyTaskPatch, type TaskPatch, type TasksSnapshot } from '@shared/taskPatch'
import { isRecord, validateTask } from '@shared/validate'
import type { Task } from '@shared/types'

const FILE_VERSION = 1

export type LoadedTasks = TasksSnapshot & { corruptBackup: string | null; skipped: number }

export type TasksStore = {
  initialize(): Promise<Result<null>>
  load(): Promise<Result<LoadedTasks>>
  /** 把改动合并到内存里的最新列表（同步完成）再写盘；返回写完时内存里的列表。 */
  apply(patch: TaskPatch): Promise<Result<TasksSnapshot & { saveError: string | null }>>
  snapshot(): Task[]
  versioned(): TasksSnapshot
  flush(): Promise<void>
}

type FileOutcome = { kind: 'corrupt' } | { kind: 'readable'; tasks: Task[]; skipped: number }

// 整个文件读不懂（坏 JSON、不是对象、版本不对、tasks 不是数组）才算 corrupt；
// 单条不合法或 id 重复的只跳过那一条，重复保留第一条。
function parseTasksFile(raw: string): FileOutcome {
  let data: unknown
  try {
    data = JSON.parse(stripBom(raw))
  } catch {
    return { kind: 'corrupt' }
  }
  if (!isRecord(data) || data.version !== FILE_VERSION || !Array.isArray(data.tasks)) {
    return { kind: 'corrupt' }
  }
  const entries: unknown[] = data.tasks
  const tasks: Task[] = []
  const seenIds = new Set<string>()
  let skipped = 0
  for (const entry of entries) {
    const checked = validateTask(entry)
    if (!checked.ok || seenIds.has(checked.value.id)) {
      skipped += 1
      continue
    }
    seenIds.add(checked.value.id)
    tasks.push(checked.value)
  }
  return { kind: 'readable', tasks, skipped }
}

function serialize(tasks: Task[]): string {
  return `${JSON.stringify({ version: FILE_VERSION, tasks }, null, 2)}\n`
}

export function createTasksStore(filePath: string): TasksStore {
  const writer: QueuedWriter = createQueuedWriter(filePath)
  let tasks: Task[] = []
  let revision = 0
  let writable = false
  let corruptBackup: string | null = null
  let skipped = 0
  // 部分任务被跳过、且原文件还没备份成功时为 true：此时不允许覆盖原文件。
  let backupPending = false
  let initialized: Promise<Result<null>> | null = null

  async function backupOriginal(): Promise<boolean> {
    try {
      corruptBackup = await copyToCorruptBackup(filePath)
      backupPending = false
      return true
    } catch {
      return false
    }
  }

  async function recoverWholeFile(): Promise<Result<null>> {
    try {
      corruptBackup = await quarantineCorruptFile(filePath)
    } catch {
      return fail('IO', '数据文件已损坏且无法备份，为保护原文件已暂停保存')
    }
    tasks = []
    skipped = 0
    writable = true
    return ok(null)
  }

  async function readAndRecover(): Promise<Result<null>> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        tasks = []
        writable = true
        return ok(null)
      }
      return fail('IO', '读取任务数据失败')
    }
    const outcome = parseTasksFile(raw)
    if (outcome.kind === 'corrupt') return recoverWholeFile()
    tasks = outcome.tasks
    skipped = outcome.skipped
    writable = true
    if (skipped === 0) return ok(null)
    if (!(await backupOriginal())) {
      backupPending = true
      return ok(null)
    }
    // 备份已存在，写回清理后的列表；写回失败时原文件和备份都还在，之后的保存会再写。
    await writer.write(serialize(tasks))
    return ok(null)
  }

  function ensureInitialized(): Promise<Result<null>> {
    if (initialized === null) {
      initialized = readAndRecover().then((result) => {
        if (!result.ok) initialized = null
        return result
      })
    }
    return initialized
  }

  async function save(next: Task[]): Promise<Result<null>> {
    if (!writable) return fail('IO', '任务数据还没有读取成功，暂不保存')
    tasks = next
    revision += 1
    if (backupPending && !(await backupOriginal())) {
      return fail('IO', '数据文件还没有备份，为保护原文件暂不保存')
    }
    // 等备份时可能又来了新的保存：总是写内存里最新的一份，不按到达顺序写旧的。
    const result = await writer.write(serialize(tasks))
    return result.ok ? ok(null) : fail('IO', result.message)
  }

  return {
    initialize(): Promise<Result<null>> {
      return ensureInitialized()
    },
    async load(): Promise<Result<LoadedTasks>> {
      const result = await ensureInitialized()
      if (!result.ok) return result
      return ok({ tasks: [...tasks], revision, corruptBackup, skipped })
    },
    async apply(patch: TaskPatch): Promise<Result<TasksSnapshot & { saveError: string | null }>> {
      if (!writable) return fail('IO', '任务数据还没有读取成功，暂不保存')
      const saved = await save(applyTaskPatch(tasks, patch, (task) => validateTask(task).ok))
      // 写盘期间可能又合并了别的窗口的改动：返回此刻内存里的列表，它比之前推给任何窗口的都新。
      return ok({ tasks: [...tasks], revision, saveError: saved.ok ? null : saved.error.message })
    },
    snapshot(): Task[] {
      return [...tasks]
    },
    versioned(): TasksSnapshot {
      return { tasks: [...tasks], revision }
    },
    flush(): Promise<void> {
      return writer.flush()
    }
  }
}
