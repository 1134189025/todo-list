import { useCallback, useEffect, useRef, useState } from 'react'
import { diffTasks, isEmptyPatch, type TasksSnapshot } from '@shared/taskPatch'
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
  // 收到过的主进程列表里版本号最大的一份，和还没收到结果的保存次数。
  // 保存结果和推送的到达顺序不保证，只认版本号更大的；自己没有在途保存时就换成它，
  // 两个窗口同时保存时各自也能拿到合并后的结果，不会一直对不上。
  const serverLatest = useRef<TasksSnapshot | null>(null)
  const pendingSaves = useRef(0)
  const loaded = useRef(false)

  // 读取完成、且自己没有在途保存时，显示收到过的最新一份。
  const showNewest = useCallback((): void => {
    const newest = serverLatest.current
    if (!loaded.current || pendingSaves.current > 0 || newest === null) return
    latest.current = newest.tasks
    setTasks(newest.tasks)
  }, [])

  const receive = useCallback(
    (snapshot: TasksSnapshot): void => {
      const known = serverLatest.current
      if (known === null || snapshot.revision > known.revision) serverLatest.current = snapshot
      showNewest()
    },
    [showNewest]
  )

  useEffect(() => {
    let cancelled = false
    void callApi(() => window.api.tasks.load()).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadError(result.error.message)
        return
      }
      loaded.current = true
      receive({ tasks: result.data.tasks, revision: result.data.revision })
      setCorruptBackup(result.data.corruptBackup)
      setSkipped(result.data.skipped)
    })
    return () => {
      cancelled = true
    }
  }, [receive])

  // 另一个窗口（主窗口 / 悬浮窗）保存了任务。读取完成前、或自己还有在途保存时先记下，之后再换。
  useEffect(() => window.api.events.onTasksChanged(receive), [receive])

  const replace = useCallback((next: Task[]): void => {
    const previous = latest.current
    if (previous === null) return
    const known = new Set(previous.map((task) => task.id))
    const added = next.filter((task) => task.source === 'ai' && !known.has(task.id)).map((task) => task.id)
    if (added.length > 0) setFreshIds((current) => new Set([...current, ...added]))
    latest.current = next
    setTasks(next)
    // 只发改动，由主进程合并到它的最新列表上。
    const patch = diffTasks(previous, next)
    if (isEmptyPatch(patch)) return
    pendingSaves.current += 1
    void callApi(() => window.api.tasks.apply(patch)).then((result) => {
      pendingSaves.current -= 1
      setSaveError(result.ok ? result.data.saveError : result.error.message)
      if (result.ok) receive({ tasks: result.data.tasks, revision: result.data.revision })
      // 在途保存都回来了就换成最新一份；被主进程拒绝的改动这时也就撤回了。
      else showNewest()
    })
  }, [receive, showNewest])

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
