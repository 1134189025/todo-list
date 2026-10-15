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
import {
  applyTaskPatch,
  remapTask,
  type TaskPatch,
  type TasksSnapshot,
  type TasksState
} from '@shared/taskPatch'
import { isRecord, validateCategory, validateTask } from '@shared/validate'
import { sameCategoryName } from '@shared/text'
import { CATEGORY_LIMIT, type Category, type Task } from '@shared/types'

const FILE_VERSION = 1

export type LoadedTasks = TasksSnapshot & { corruptBackup: string | null; skipped: number }

export type TasksStore = {
  initialize(): Promise<Result<null>>
  load(): Promise<Result<LoadedTasks>>
  /** 把改动合并到内存里的最新数据（同步完成）再写盘；返回写完时内存里的数据。 */
  apply(patch: TaskPatch): Promise<Result<TasksSnapshot & { saveError: string | null }>>
  /** 只要任务，给 AI 命令和总结用（它们不认识分类）。 */
  snapshot(): Task[]
  /** 任务 + 分类的一份拷贝。 */
  state(): TasksState
  versioned(): TasksSnapshot
  flush(): Promise<void>
}

type FileOutcome =
  | { kind: 'corrupt' }
  | { kind: 'readable'; state: TasksState; aliases: Map<string, string>; skipped: number }

// 整个文件读不懂（坏 JSON、不是对象、版本不对、tasks 不是数组）才算 corrupt；
// 单条不合法或 id 重复的只跳过那一条，重复保留第一条；categories 字段不是数组时当成空分类列表，计一条跳过。
// 旧任务缺 urgency / inProgress / categoryId 由 validateTask 补默认值，不算不合法；
// 分类名字规范化后为空、id 重复、超出 CATEGORY_LIMIT 的跳过。
// 和前面某个分类重名（不区分大小写）的也跳过，但记成别名（它的 id → 留下的那个分类 id），
// 指向它的任务改指留下的那个；超出上限的不记别名，任务保留原值（界面显示未分类）。
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
  // 没有 categories 字段 = 空列表（旧文件就是这样）。字段存在但不是数组：当成空分类列表，并计一条跳过，
  // 任务照常保留；这样会走「先备份原文件再写回」的逻辑，不会把待办全空。
  const categoriesIsArray = Array.isArray(data.categories)
  const categoryEntries: unknown[] = categoriesIsArray ? (data.categories as unknown[]) : []
  const tasks: Task[] = []
  const categories: Category[] = []
  const seenIds = new Set<string>()
  const seenCategoryIds = new Set<string>()
  const aliases = new Map<string, string>()
  let skipped = data.categories === undefined || categoriesIsArray ? 0 : 1
  for (const entry of data.tasks as unknown[]) {
    const checked = validateTask(entry)
    if (!checked.ok || seenIds.has(checked.value.id)) {
      skipped += 1
      continue
    }
    seenIds.add(checked.value.id)
    tasks.push(checked.value)
  }
  for (const entry of categoryEntries) {
    const checked = validateCategory(entry)
    if (!checked.ok || seenCategoryIds.has(checked.value.id)) {
      skipped += 1
      continue
    }
    const duplicate = categories.find((category) => sameCategoryName(category.name, checked.value.name))
    if (duplicate !== undefined) {
      aliases.set(checked.value.id, duplicate.id)
      skipped += 1
      continue
    }
    if (categories.length >= CATEGORY_LIMIT) {
      skipped += 1
      continue
    }
    seenCategoryIds.add(checked.value.id)
    categories.push(checked.value)
  }
  // 重名被跳过的分类，指向它的任务改指留下的那个（任务本身不跳过）。
  const remapped = tasks.map((task) => remapTask(task, aliases))
  return { kind: 'readable', state: { tasks: remapped, categories }, aliases, skipped }
}

function serialize(state: TasksState): string {
  return `${JSON.stringify({ version: FILE_VERSION, tasks: state.tasks, categories: state.categories }, null, 2)}\n`
}

export function createTasksStore(filePath: string): TasksStore {
  const writer: QueuedWriter = createQueuedWriter(filePath)
  let state: TasksState = { tasks: [], categories: [] }
  // 分类 id 别名表（只在内存里）：删掉 / 去重过的分类 id → 留下的分类 id（null = 未分类）。见 taskPatch.ts 的 CategoryAliases。
  let aliases: Map<string, string | null> = new Map()
  let revision = 0
  let writable = false
  let corruptBackup: string | null = null
  let skipped = 0
  // 部分条目被跳过、且原文件还没备份成功时为 true：此时不允许覆盖原文件。
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
    state = { tasks: [], categories: [] }
    aliases = new Map()
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
        state = { tasks: [], categories: [] }
        writable = true
        return ok(null)
      }
      return fail('IO', '读取任务数据失败')
    }
    const outcome = parseTasksFile(raw)
    if (outcome.kind === 'corrupt') return recoverWholeFile()
    state = outcome.state
    aliases = new Map(outcome.aliases)
    skipped = outcome.skipped
    writable = true
    if (skipped === 0) return ok(null)
    if (!(await backupOriginal())) {
      backupPending = true
      return ok(null)
    }
    // 备份已存在，写回清理后的数据；写回失败时原文件和备份都还在，之后的保存会再写。
    await writer.write(serialize(state))
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

  async function save(next: TasksState): Promise<Result<null>> {
    if (!writable) return fail('IO', '任务数据还没有读取成功，暂不保存')
    state = next
    revision += 1
    if (backupPending && !(await backupOriginal())) {
      return fail('IO', '数据文件还没有备份，为保护原文件暂不保存')
    }
    // 等备份时可能又来了新的保存：总是写内存里最新的一份，不按到达顺序写旧的。
    const result = await writer.write(serialize(state))
    return result.ok ? ok(null) : fail('IO', result.message)
  }

  return {
    initialize(): Promise<Result<null>> {
      return ensureInitialized()
    },
    async load(): Promise<Result<LoadedTasks>> {
      const result = await ensureInitialized()
      if (!result.ok) return result
      return ok({ tasks: [...state.tasks], categories: [...state.categories], revision, corruptBackup, skipped })
    },
    async apply(patch: TaskPatch): Promise<Result<TasksSnapshot & { saveError: string | null }>> {
      if (!writable) return fail('IO', '任务数据还没有读取成功，暂不保存')
      const merged = applyTaskPatch(state, patch, (task) => validateTask(task).ok, aliases)
      aliases = new Map(merged.aliases)
      const saved = await save(merged.state)
      // 写盘期间可能又合并了别的窗口的改动：返回此刻内存里的数据，它比之前推给任何窗口的都新。
      return ok({
        tasks: [...state.tasks],
        categories: [...state.categories],
        revision,
        saveError: saved.ok ? null : saved.error.message
      })
    },
    snapshot(): Task[] {
      return [...state.tasks]
    },
    state(): TasksState {
      return { tasks: [...state.tasks], categories: [...state.categories] }
    },
    versioned(): TasksSnapshot {
      return { tasks: [...state.tasks], categories: [...state.categories], revision }
    },
    flush(): Promise<void> {
      return writer.flush()
    }
  }
}
