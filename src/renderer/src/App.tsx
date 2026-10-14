import { useEffect, useRef, useState } from 'react'
import type { Task } from '@shared/types'
import { TITLE_MAX, truncateTitle } from '@shared/text'
import { AiCard } from './components/AiCard'
import { AppShell } from './components/AppShell'
import { Composer, type ComposerMode, type ComposerWhen, type SubmitMode } from './components/Composer'
import { Dialog } from './components/Dialog'
import { Notice } from './components/Notice'
import { SettingsDialog } from './components/SettingsDialog'
import { SummaryPanel } from './components/SummaryPanel'
import { TaskPanel } from './components/TaskPanel'
import { TitleBar } from './components/TitleBar'
import { Toast } from './components/Toast'
import { VoiceNotice } from './components/VoiceNotice'
import { isAiConfigured } from './lib/aiForm'
import { createTask, restoreAt, toggleDone, withoutIds } from './lib/taskOps'
import { type TabKey } from './lib/taskView'
import { useAiFlow } from './state/useAiFlow'
import { useFloatToggle } from './state/useFloatToggle'
import { useSettings } from './state/useSettings'
import { useSummary } from './state/useSummary'
import { useTasks } from './state/useTasks'
import { useToast } from './state/useToast'
import { useToday } from './state/useToday'
import { useVoice } from './state/useVoice'

const NO_WHEN: ComposerWhen = { date: null, time: null }

// 计划 3.3：整个文件损坏是「数据文件损坏」；只跳过部分条目是「有 N 条…已跳过」。
function dataNotice(backup: string | null, skipped: number): string {
  if (skipped === 0) return `数据文件损坏，已备份为 ${backup ?? ''}`
  const backupText = backup === null ? '原文件未能备份，暂不覆盖' : `原文件备份为 ${backup}`
  return `有 ${skipped} 条待办数据无法读取，已跳过；${backupText}`
}

export function App() {
  const today = useToday()
  const toast = useToast()
  const tasks = useTasks(toast.show)
  const settings = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('today')
  const [doneOpen, setDoneOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  // null = 还没手动选过：配置了 AI 默认「AI 整理」，没配置默认「手动添加」。
  const [chosenMode, setChosenMode] = useState<ComposerMode | null>(null)
  const [when, setWhen] = useState<ComposerWhen>(NO_WHEN)
  const fallbackHinted = useRef(false)

  const list = tasks.tasks
  const configured = isAiConfigured(settings.settings)
  const accelerator = settings.settings === null ? null : settings.settings.voiceHotkey.accelerator
  const composerMode: ComposerMode = chosenMode ?? (configured ? 'ai' : 'manual')
  const floatToggle = useFloatToggle(settings.settings, settings.save)

  function addTasks(created: Task[], message: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const ids = new Set(created.map((task) => task.id))
    tasks.replaceWithUndo([...created, ...current], message, (now) => withoutIds(now, ids))
  }

  const aiFlow = useAiFlow({ addTasks, restoreDraft: setDraft })
  const voice = useVoice(accelerator, settingsOpen || aiFlow.stage.kind !== 'idle')
  const summary = useSummary(list, today)

  useEffect(() => window.api.events.onSummaryShow((shown) => {
    summary.receive(shown)
    setSummaryOpen(true)
  }), [summary.receive])

  function openSummary(): void {
    setSummaryOpen(true)
    if (configured && !summary.fresh) summary.generate()
  }

  function closeSummary(): void {
    summary.cancel()
    setSummaryOpen(false)
  }

  function submitDraft(text: string, mode: SubmitMode): void {
    const script = text.trim()
    if (tasks.snapshot() === null || script === '') return
    if (mode === 'ai' && configured) {
      setDraft('')
      setNotice(null)
      aiFlow.start(script)
      return
    }
    const title = truncateTitle(script)
    const fallback = mode === 'ai' && !fallbackHinted.current
    if (fallback) fallbackHinted.current = true
    // 只有手动添加模式用输入区选的日期和时间（AI 模式下时间胶囊不显示，Ctrl+Enter 和没配置 AI 时的直接添加都算今天）。
    const picked = mode === 'direct' && composerMode === 'manual' ? when : NO_WHEN
    const created = createTask(
      { title, dueDate: picked.date, dueTime: picked.date === null ? null : picked.time, source: 'manual' },
      new Date().toISOString()
    )
    addTasks([created], '已添加 1 件待办')
    setDraft('')
    setWhen(NO_WHEN)
    if (fallback) setNotice('还没配置 AI，已直接添加')
    else if (title.length < script.length) setNotice(`待办最多 ${TITLE_MAX} 字，超出的部分没有保存`)
    else setNotice(null)
  }

  function toggleTask(id: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const nowIso = new Date().toISOString()
    tasks.replace(current.map((task) => (task.id === id ? toggleDone(task, nowIso) : task)))
  }

  function removeTask(id: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const index = current.findIndex((task) => task.id === id)
    const target = current[index]
    if (target === undefined) return
    tasks.replaceWithUndo(
      current.filter((task) => task.id !== id),
      `已删除「${target.title}」`,
      (now) => restoreAt(now, target, index)
    )
  }

  const summaryHeadline = summary.fresh && summary.summary !== null ? summary.summary.headline : null

  const main =
    list === null ? (
      <Notice tone={tasks.loadError === null ? 'muted' : 'danger'}>
        {tasks.loadError === null ? '正在读取待办…' : `无法读取待办：${tasks.loadError}`}
      </Notice>
    ) : (
      <>
        {settings.loadError !== null && <Notice tone="danger">{`无法读取设置：${settings.loadError}`}</Notice>}
        {(tasks.corruptBackup !== null || tasks.skipped > 0) && (
          <Notice tone="peach" onDismiss={tasks.dismissCorruptNotice}>
            {dataNotice(tasks.corruptBackup, tasks.skipped)}
          </Notice>
        )}
        {tasks.saveError !== null && <Notice tone="danger">{`保存失败：${tasks.saveError}。最近的修改还没存下，下次修改时会再试一次。`}</Notice>}
        <TaskPanel
          today={today}
          tasks={list}
          summaryHeadline={summaryHeadline}
          tab={tab}
          onTabChange={setTab}
          summaryOpen={summaryOpen}
          onToggleSummary={() => (summaryOpen ? closeSummary() : openSummary())}
          doneOpen={doneOpen}
          onToggleDone={() => setDoneOpen((open) => !open)}
          freshIds={tasks.freshIds}
          onToggleTask={toggleTask}
          onRemoveTask={removeTask}
        />
      </>
    )

  const composer = (
    <>
      {toast.toast !== null && <Toast message={toast.toast.message} onUndo={toast.undo} />}
      {voice.voiceOpen ? (
        <VoiceNotice onDismiss={voice.closeVoice} />
      ) : aiFlow.stage.kind !== 'idle' ? (
        <AiCard flow={aiFlow} today={today} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <Composer
          value={draft}
          notice={notice}
          voiceShortcut={accelerator}
          disabled={list === null}
          mode={composerMode}
          when={when}
          today={today}
          onChange={(value) => {
            setDraft(value)
            setNotice(null)
          }}
          onModeChange={setChosenMode}
          onWhenChange={setWhen}
          onSubmit={submitDraft}
          onVoice={voice.openVoice}
        />
      )}
    </>
  )

  const drawer = summaryOpen ? (
    <SummaryPanel
      configured={configured}
      summary={summary.summary}
      loading={summary.loading}
      error={summary.error}
      fresh={summary.fresh}
      tasks={list ?? []}
      today={today}
      onRegenerate={summary.generate}
      onClose={closeSummary}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  ) : null

  return (
    <>
      <TitleBar
        floatOpen={floatToggle.state.open}
        onToggleFloat={() => floatToggle.toggle('open')}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <AppShell main={main} composer={composer} drawer={drawer} drawerLabel="AI 今日总结" />
      <Dialog open={settingsOpen} title="设置" onRequestClose={() => setSettingsOpen(false)}>
        {settingsOpen ? (
          <SettingsDialog settings={settings.settings} loadError={settings.loadError} actions={settings} />
        ) : null}
      </Dialog>
    </>
  )
}
