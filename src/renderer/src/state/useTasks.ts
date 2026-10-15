import { useCallback, useEffect, useRef, useState } from 'react'
import { diffTasks, isEmptyPatch, type TasksSnapshot, type TasksState } from '@shared/taskPatch'

import type { Category, Task } from '@shared/types'
import { callApi } from '../lib/callApi'

type ShowToast = (message: string, onUndo?: () => void) => void

export type TasksController = {
  tasks: Task[] | null
  /** 分类：和任务一起加载、一起随别的窗口的改动更新；还没读到时为 null。 */
  categories: Category[] | null
  loadError: string | null
  corruptBackup: string | null
  /** 本次启动跳过的不合法待办条数（任务和分类都算）。 */
  skipped: number
  saveError: string | null
  /** 本次运行内新加入的 AI 待办 id，用来显示底色。 */
  freshIds: ReadonlySet<string>
  snapshot: () => Task[] | null
  categoriesSnapshot: () => Category[] | null
  /**
   * 替换任务列表；nextCategories 不传 = 分类不变。不传时也要明确表示「分类不变」，
   * 免得分类列表被当成变化发一次没必要的补丁。
   */
  replace: (next: Task[], nextCategories?: Category[]) => void
  /**
   * 替换并弹出「撤销」。撤销只做这一次操作的逆操作，作用在撤销时的当前列表上，
   * 不回滚整份数据，避免把期间的勾选、别的修改一起抹掉。撤销只撤任务，本次一起新建的分类保留。
   */
  replaceWithUndo: (
    next: Task[],
    message: string,
    undoChange: (current: Task[]) => Task[],
    nextCategories?: Category[]
  ) => void
  /** 只弹出带「撤销」的提示，不改列表（改动已经做过了）。 */
  offerUndo: (message: string, undoChange: (current: Task[]) => Task[]) => void
  /**
   * 替换任务和分类（整份）并弹出「撤销」。撤销时对撤销时的当前整份数据做逆操作，任务和分类一起撤回。
   * 删除分类用它：撤销时把分类放回，并把那几件待办改回原来的分类。
   */
  replaceWithUndoState: (
    next: TasksState,
    message: string,
    undoState: (current: TasksState) => TasksState
  ) => void
  /** 只弹出提示，不带撤销（改动已经做过、而且撤不掉，例如新建分类）。 */
  notify: (message: string) => void
  dismissCorruptNotice: () => void
}

export function useTasks(showToast: ShowToast): TasksController {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [corruptBackup, setCorruptBackup] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set())
  // 当前显示的整份数据（任务 + 分类），保存时用它的上一份算补丁。
  const latest = useRef<TasksState | null>(null)
  // 收到过的主进程数据里版本号最大的一份，和还没收到结果的保存次数。
  // 保存结果和推送的到达顺序不保证，只认版本号更大的；自己没有在途保存时就换成它，
  // 两个窗口同时保存时各自也能拿到合并后的结果，不会一直对不上。
  const serverLatest = useRef<TasksSnapshot | null>(null)
  const pendingSaves = useRef(0)
  const loaded = useRef(false)

  // 读取完成、且自己没有在途保存时，显示收到过的最新一份。
  const showNewest = useCallback((): void => {
    const newest = serverLatest.current
    if (!loaded.current || pendingSaves.current > 0 || newest === null) return
    latest.current = { tasks: newest.tasks, categories: newest.categories }
    setTasks(newest.tasks)
    setCategories(newest.categories)
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
      receive({ tasks: result.data.tasks, categories: result.data.categories, revision: result.data.revision })
      setCorruptBackup(result.data.corruptBackup)
      setSkipped(result.data.skipped)
    })
    return () => {
      cancelled = true
    }
  }, [receive])

  // 另一个窗口（主窗口 / 悬浮窗）保存了任务。读取完成前、或自己还有在途保存时先记下，之后再换。
  useEffect(() => window.api.events.onTasksChanged(receive), [receive])

  const replace = useCallback(
    (next: Task[], nextCategories?: Category[]): void => {
      const previous = latest.current
      if (previous === null) return
      const nextState: TasksState = { tasks: next, categories: nextCategories ?? previous.categories }
      const known = new Set(previous.tasks.map((task) => task.id))
      const added = next.filter((task) => task.source === 'ai' && !known.has(task.id)).map((task) => task.id)
      if (added.length > 0) setFreshIds((current) => new Set([...current, ...added]))
      latest.current = nextState
      setTasks(nextState.tasks)
      setCategories(nextState.categories)
      // 只发改动，由主进程合并到它的最新数据上。
      const patch = diffTasks(previous, nextState)
      if (isEmptyPatch(patch)) return
      pendingSaves.current += 1
      void callApi(() => window.api.tasks.apply(patch)).then((result) => {
        pendingSaves.current -= 1
        setSaveError(result.ok ? result.data.saveError : result.error.message)
        if (result.ok) {
          receive({
            tasks: result.data.tasks,
            categories: result.data.categories,
            revision: result.data.revision
          })
        }
        // 在途保存都回来了就换成最新一份；被主进程拒绝的改动这时也就撤回了。
        else showNewest()
      })
    },
    [receive, showNewest]
  )

  const offerUndo = useCallback(
    (message: string, undoChange: (current: Task[]) => Task[]): void => {
      showToast(message, () => {
        const current = latest.current
        if (current !== null) replace(undoChange(current.tasks))
      })
    },
    [replace, showToast]
  )

  const notify = useCallback((message: string): void => showToast(message), [showToast])

  const replaceWithUndo = useCallback(
    (next: Task[], message: string, undoChange: (current: Task[]) => Task[], nextCategories?: Category[]): void => {
      if (latest.current === null) return
      replace(next, nextCategories)
      offerUndo(message, undoChange)
    },
    [replace, offerUndo]
  )

  const replaceWithUndoState = useCallback(
    (next: TasksState, message: string, undoState: (current: TasksState) => TasksState): void => {
      if (latest.current === null) return
      replace(next.tasks, next.categories)
      showToast(message, () => {
        const current = latest.current
        if (current === null) return
        const restored = undoState(current)
        replace(restored.tasks, restored.categories)
      })
    },
    [replace, showToast]
  )

  const snapshot = useCallback(() => latest.current?.tasks ?? null, [])

  const categoriesSnapshot = useCallback(() => latest.current?.categories ?? null, [])

  const dismissCorruptNotice = useCallback(() => {
    setCorruptBackup(null)
    setSkipped(0)
  }, [])

  return {
    tasks,
    categories,
    loadError,
    corruptBackup,
    skipped,
    saveError,
    freshIds,
    snapshot,
    categoriesSnapshot,
    replace,
    replaceWithUndo,
    offerUndo,
    replaceWithUndoState,
    notify,
    dismissCorruptNotice
  }
}
