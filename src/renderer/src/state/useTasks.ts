import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task } from '@shared/types'
import { callApi } from '../lib/callApi'

type ShowToast = (message: string, onUndo?: () => void) => void

export type TasksController = {
  tasks: Task[] | null
  loadError: string | null
  corruptBackup: string | null
  /** 本次启动跳过的不合法待办条数。 */
  skipped: number
  saveError: string | null
  /** 本次运行内新加入的 AI 待办 id，用来显示底色。 */
  freshIds: ReadonlySet<string>
  snapshot: () => Task[] | null
  replace: (next: Task[]) => void
  /**
   * 替换并弹出「撤销」。撤销只做这一次操作的逆操作，作用在撤销时的当前列表上，
   * 不回滚整份数据，避免把期间的勾选、别的修改一起抹掉。
   */
  replaceWithUndo: (next: Task[], message: string, undoChange: (current: Task[]) => Task[]) => void
  dismissCorruptNotice: () => void
}

export function useTasks(showToast: ShowToast): TasksController {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [corruptBackup, setCorruptBackup] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set())
  const latest = useRef<Task[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void callApi(() => window.api.tasks.load()).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadError(result.error.message)
        return
      }
      latest.current = result.data.tasks
      setTasks(result.data.tasks)
      setCorruptBackup(result.data.corruptBackup)
      setSkipped(result.data.skipped)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 另一个窗口（主窗口 / 悬浮窗）保存了任务：换成主进程里的最新列表。读取完成前收到的忽略，读取结果本身就是最新的。
  useEffect(
    () =>
      window.api.events.onTasksChanged((next) => {
        if (latest.current === null) return
        latest.current = next
        setTasks(next)
      }),
    []
  )

  const replace = useCallback((next: Task[]): void => {
    const previous = latest.current
    if (previous === null) return
    const known = new Set(previous.map((task) => task.id))
    const added = next.filter((task) => task.source === 'ai' && !known.has(task.id)).map((task) => task.id)
    if (added.length > 0) setFreshIds((current) => new Set([...current, ...added]))
    latest.current = next
    setTasks(next)
    void callApi(() => window.api.tasks.save(next)).then((result) => {
      setSaveError(result.ok ? null : result.error.message)
    })
  }, [])

  const replaceWithUndo = useCallback(
    (next: Task[], message: string, undoChange: (current: Task[]) => Task[]): void => {
      if (latest.current === null) return
      replace(next)
      showToast(message, () => {
        const current = latest.current
        if (current !== null) replace(undoChange(current))
      })
    },
    [replace, showToast]
  )

  const snapshot = useCallback(() => latest.current, [])

  const dismissCorruptNotice = useCallback(() => {
    setCorruptBackup(null)
    setSkipped(0)
  }, [])

  return {
    tasks,
    loadError,
    corruptBackup,
    skipped,
    saveError,
    freshIds,
    snapshot,
    replace,
    replaceWithUndo,
    dismissCorruptNotice
  }
}
