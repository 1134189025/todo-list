import { useState, type KeyboardEvent } from 'react'
import { todayProgress } from '@shared/dates'
import { truncateTitle } from '@shared/text'
import type { Task } from '@shared/types'
import { CloseIcon, LockIcon, OpenMainIcon, PinIcon } from '../components/icons'
import { callApi } from '../lib/callApi'
import { formatTaskWhen } from '../lib/labels'
import { createTodayTask, toggleDone } from '../lib/taskOps'
import { buildTaskView } from '../lib/taskView'
import { useFloatToggle } from '../state/useFloatToggle'
import { useSettings } from '../state/useSettings'
import { useTasks } from '../state/useTasks'
import { useToday } from '../state/useToday'
import { FloatTaskItem } from './FloatTaskItem'
import './FloatApp.css'

const MAX_LENGTH = 200

// 悬浮窗里没有撤销提示条：勾选可以再点一次取消，添加的可以在主窗口删。
function noToast(): void {}

/** 悬浮窗：今天的待办，可以勾选、直接添加；标题栏上切换置顶、固定，打开主窗口，关闭悬浮窗。 */
export function FloatApp() {
  const today = useToday()
  const tasks = useTasks(noToast)
  const settings = useSettings()
  const [draft, setDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const floatToggle = useFloatToggle(settings.settings, settings.save)
  const float = floatToggle.state
  const list = tasks.tasks

  async function openMain(): Promise<void> {
    const result = await callApi(() => window.api.app.showMain())
    setActionError(result.ok ? null : result.error.message)
  }

  function toggleTask(id: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const nowIso = new Date().toISOString()
    tasks.replace(current.map((task) => (task.id === id ? toggleDone(task, nowIso) : task)))
  }

  function addTask(): void {
    const current = tasks.snapshot()
    const title = truncateTitle(draft)
    if (current === null || title === '') return
    tasks.replace([createTodayTask(title, new Date().toISOString()), ...current])
    setDraft('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    addTask()
  }

  const progress = list === null ? null : todayProgress(list, today)
  const error = actionError ?? floatToggle.error ?? tasks.saveError ?? tasks.loadError

  return (
    <div className={float.locked ? 'float is-locked' : 'float'}>
      <header className="float-head">
        <span className="float-title">今天</span>
        {progress !== null && (
          <span className="float-count" aria-label={`今日完成 ${progress.done} / ${progress.total}`}>
            {progress.done} / {progress.total}
          </span>
        )}
        <div className="float-actions">
          <button
            type="button"
            className="float-action"
            aria-label="置顶"
            aria-pressed={float.alwaysOnTop}
            title={float.alwaysOnTop ? '取消置顶' : '置顶'}
            onClick={() => floatToggle.toggle('alwaysOnTop')}
          >
            <PinIcon size={15} />
          </button>
          <button
            type="button"
            className="float-action"
            aria-label="固定"
            aria-pressed={float.locked}
            title={float.locked ? '取消固定' : '固定位置和大小'}
            onClick={() => floatToggle.toggle('locked')}
          >
            <LockIcon size={15} />
          </button>
          <button
            type="button"
            className="float-action"
            aria-label="打开主窗口"
            title="打开主窗口"
            onClick={() => void openMain()}
          >
            <OpenMainIcon size={15} />
          </button>
          <button
            type="button"
            className="float-action"
            aria-label="关闭悬浮窗"
            title="关闭悬浮窗"
            onClick={() => floatToggle.toggle('open')}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      </header>
      <main className="float-body">{renderList(list, today, toggleTask)}</main>
      {error !== null && (
        <p className="float-error" role="alert">
          {error}
        </p>
      )}
      <div className="float-add">
        <label htmlFor="float-input" className="sr-only">
          添加今天的待办
        </label>
        <input
          id="float-input"
          className="float-input"
          type="text"
          autoComplete="off"
          maxLength={MAX_LENGTH}
          placeholder="添加今天的待办，Enter 保存"
          value={draft}
          disabled={list === null}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  )
}

function renderList(list: Task[] | null, today: string, onToggle: (id: string) => void) {
  if (list === null) return <p className="float-empty">正在读取待办…</p>
  const view = buildTaskView(list, today).today
  if (view.pending.length === 0 && view.done.length === 0) {
    return <p className="float-empty">今天还没有待办</p>
  }
  return (
    <>
      {view.pending.length === 0 && <p className="float-empty">今天的事都做完啦</p>}
      <ul className="float-list">
        {view.pending.map((task) => (
          <FloatTaskItem key={task.id} task={task} when={formatTaskWhen(task, today)} onToggle={onToggle} />
        ))}
        {view.done.map((task) => (
          <FloatTaskItem key={task.id} task={task} when={null} onToggle={onToggle} />
        ))}
      </ul>
    </>
  )
}
