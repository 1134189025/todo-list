import type { Task } from './types'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

// 紧急度和进行中也算进去：改了这两样，之前生成的总结就算过期（渲染进程据此重新生成）。
// 分类不进指纹：总结的内容里没有分类，改了分类不该让总结过期。
type FingerprintRow = readonly [string, string, boolean, string | null, string | null, string, boolean]

export function fnv1a32(text: string): string {
  let hash = FNV_OFFSET_BASIS
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function tasksFingerprint(tasks: Task[]): string {
  const rows: FingerprintRow[] = tasks
    .map((task): FingerprintRow => [
      task.id,
      task.title,
      task.done,
      task.dueDate,
      task.dueTime,
      task.urgency,
      task.inProgress
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return fnv1a32(JSON.stringify(rows))
}
