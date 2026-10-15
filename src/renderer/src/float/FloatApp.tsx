import { useState, type KeyboardEvent } from 'react'
import { todayProgress } from '@shared/dates'
import { truncateTitle } from '@shared/text'
import { CloseIcon, LockIcon, MicIcon, OpenMainIcon, PinIcon } from '../components/icons'
import { callApi } from '../lib/callApi'
import { createTodayTask, toggleDone } from '../lib/taskOps'
import { useFloatToggle } from '../state/useFloatToggle'
import { useSettings } from '../state/useSettings'
import { useTasks } from '../state/useTasks'
import { useToday } from '../state/useToday'
import { FloatTaskList } from './FloatTaskList'
import { pendingGroupKey } from './floatGroups'
import { useOpenGroups } from './useOpenGroups'
import './FloatApp.css'

const MAX_LENGTH = 200

// 悬浮窗里没有撤销提示条：勾选可以再点一次取消，添加的可以在主窗口删。
function noToast(): void {}

/** 悬浮窗：今天的待办，可以勾选、直接添加；标题栏上切换置顶、固定，打开主窗口，关闭悬浮窗。 */
export function FloatApp() {
  const today = useToday()
  const tasks = useTasks(noToast)
  const settings = useSettings()
  const groups = useOpenGroups()
  const [draft, setDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const floatToggle = useFloatToggle(settings.settings, settings.save)
  const float = floatToggle.state
  const list = tasks.tasks

  async function openMain(): Promise<void> {
    const result = await callApi(() => window.api.app.showMain())
    setActionError(result.ok ? null : result.error.message)
  }

  /** 语音按钮：和语音键一样，在屏幕底部弹出录音胶囊。 */
  async function openVoicePill(): Promise<void> {
    await callApi(() => window.api.app.toggleVoicePill())
  }

  function toggleTask(id: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const nowIso = new Date().toISOString()
    tasks.replace(current.map((task) => (task.id === id ? toggleDone(task, nowIso) : task)))
  }

  function toggleGroup(key: string): void {
    groups.setOpen(key, !groups.isOpen(key))
  }

  function addTask(): void {
    const current = tasks.snapshot()
    const title = truncateTitle(draft)
    if (current === null || title === '') return
    tasks.replace([createTodayTask(title, new Date().toISOString()), ...current])
    setDraft('')
    // 新加的待办是未分类的：未分类组收着就展开它，免得加了看不见。
    const key = pendingGroupKey(null)
    if (!groups.isOpen(key)) groups.setOpen(key, true)
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
      <main className="float-body">
        <FloatTaskList
          list={list}
          categories={tasks.categories}
          today={today}
          isOpen={groups.isOpen}
          onToggleGroup={toggleGroup}
          onToggle={toggleTask}
        />
      </main>
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
        <button
          type="button"
          className="float-mic"
          aria-label="语音输入（在屏幕底部弹出录音胶囊）"
          title="语音输入"
          onClick={() => void openVoicePill()}
        >
          <MicIcon size={16} />
        </button>
      </div>
    </div>
  )
}
