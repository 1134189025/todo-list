import { useEffect, useRef, useState } from 'react'
import { DEFAULT_URGENCY, type Category, type Task, type Urgency } from '@shared/types'
import { todayProgress } from '@shared/dates'
import { TITLE_MAX, truncateTitle } from '@shared/text'
import { AiCard } from './components/AiCard'
import { AppShell } from './components/AppShell'
import { AssistantPanel, type AssistantTab } from './components/AssistantPanel'
import { Composer, type ComposerMode, type ComposerWhen, type SubmitMode } from './components/Composer'
import { Dialog } from './components/Dialog'
import { NavPanel } from './components/NavPanel'
import { Notice } from './components/Notice'
import { SettingsDialog } from './components/SettingsDialog'
import { SummaryPanel } from './components/SummaryPanel'
import type { TaskActions } from './components/TaskRow'
import { TaskPanel } from './components/TaskPanel'
import { TitleBar } from './components/TitleBar'
import { Toast } from './components/Toast'
import { VoiceCard } from './components/VoiceCard'
import { isAiConfigured } from './lib/aiForm'
import { categoryIdOrNull, countCategories, filterTasks } from './lib/categoryFilter'
import { localSummaryLine } from './lib/localSummary'
import { createTask, restoreAt, toggleDone, toggleInProgress, withoutIds } from './lib/taskOps'
import { buildTaskView, type TabKey } from './lib/taskView'
import { useAiFlow } from './state/useAiFlow'
import { useCategories } from './state/useCategories'
import { useFloatToggle } from './state/useFloatToggle'
import { useSettings } from './state/useSettings'
import { useSummary } from './state/useSummary'
import { useTasks } from './state/useTasks'
import { useToast } from './state/useToast'
import { useToday } from './state/useToday'
import { useVoice, type VoiceAvailability } from './state/useVoice'

const NO_WHEN: ComposerWhen = { date: null, time: null }
const NO_CATEGORIES: Category[] = []

function timeGreeting(hour: number): string {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 13) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

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
  const catalog = useCategories(tasks)
  const settings = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('today')
  const [doneOpen, setDoneOpen] = useState(false)
  const [assistantTab, setAssistantTab] = useState<AssistantTab>('chat')
  const summaryOpen = assistantTab === 'summary'
  // null = 还没手动选过：配置了 AI 默认「AI 整理」，没配置默认「手动添加」。
  const [chosenMode, setChosenMode] = useState<ComposerMode | null>(null)
  const [when, setWhen] = useState<ComposerWhen>(NO_WHEN)
  // 手动添加时选的分类：null = 还没选过，跟随当前筛选的分类；选过就用选的（{ id: null } 表示未分类）。
  const [categoryPick, setCategoryPick] = useState<{ id: string | null } | null>(null)
  const [urgency, setUrgency] = useState<Urgency>(DEFAULT_URGENCY)
  const fallbackHinted = useRef(false)

  const list = tasks.tasks
  const categories = tasks.categories ?? NO_CATEGORIES
  const categoryCounts = countCategories(list ?? [], categories)
  const filterCategoryId = catalog.filter.kind === 'category' ? catalog.filter.id : null
  const composerCategory = categoryPick === null ? filterCategoryId : categoryIdOrNull(categoryPick.id, categories)
  const configured = isAiConfigured(settings.settings)
  const accelerator = settings.settings === null ? null : settings.settings.voiceHotkey.accelerator
  const composerMode: ComposerMode = chosenMode ?? (configured ? 'ai' : 'manual')
  const voiceAvailability: VoiceAvailability = !configured
    ? 'not-configured'
    : settings.settings?.ai.apiFormat === 'gemini'
      ? 'ok'
      : 'needs-gemini'
  const floatToggle = useFloatToggle(settings.settings, settings.save)

  function addTasks(created: Task[], message: string): void {
    const current = tasks.snapshot()
    if (current === null) return
    const ids = new Set(created.map((task) => task.id))
    tasks.replaceWithUndo([...created, ...current], message, (now) => withoutIds(now, ids))
  }

  const aiFlow = useAiFlow({ tasks, restoreDraft: setDraft, today })
  const voice = useVoice({
    accelerator,
    blocked: settingsOpen || aiFlow.stage.kind !== 'idle',
    availability: voiceAvailability,
    onClip: (clip) => {
      setNotice(null)
      aiFlow.startVoice(clip)
    }
  })
  const summary = useSummary(list, today)

  useEffect(() => window.api.events.onSummaryShow((shown) => {
    summary.receive(shown)
    setAssistantTab('summary')
  }), [summary.receive])

  function openSummary(): void {
    setAssistantTab('summary')
    if (configured && !summary.fresh) summary.generate()
  }

  function closeSummary(): void {
    summary.cancel()
    setAssistantTab('chat')
  }

  function changeAssistantTab(next: AssistantTab): void {
    if (next === 'summary') openSummary()
    else closeSummary()
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
    // 只有手动添加模式用输入区选的日期、分类和紧急度。AI 模式下这些胶囊不显示，
    // Ctrl+Enter 直接添加和没配置 AI 时的直接添加：日期用没有，分类用当前筛选的，紧急度用普通。
    const manual = composerMode === 'manual'
    const picked = mode === 'direct' && manual ? when : NO_WHEN
    const created = createTask(
      {
        title,
        dueDate: picked.date,
        dueTime: picked.date === null ? null : picked.time,
        source: 'manual',
        urgency: manual ? urgency : DEFAULT_URGENCY,
        categoryId: manual ? composerCategory : filterCategoryId
      },
      new Date().toISOString()
    )
    addTasks([created], '已添加 1 件待办')
    setDraft('')
    setWhen(NO_WHEN)
    setCategoryPick(null)
    setUrgency(DEFAULT_URGENCY)
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

  function patchTask(id: string, change: (task: Task) => Task): void {
    const current = tasks.snapshot()
    if (current === null) return
    tasks.replace(current.map((task) => (task.id === id ? change(task) : task)))
  }

  const taskActions: TaskActions = {
    onToggle: toggleTask,
    onRemove: removeTask,
    onToggleProgress: (id) => patchTask(id, toggleInProgress),
    onSetUrgency: (id, value) => patchTask(id, (task) => ({ ...task, urgency: value })),
    onSetCategory: (id, value) => patchTask(id, (task) => ({ ...task, categoryId: value })),
    onCreateCategory: catalog.create
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
          categories={categories}
          categoryCounts={categoryCounts}
          filter={catalog.filter}
          onFilterChange={catalog.setFilter}
          actions={taskActions}
        />
      </>
    )

  const bottom = (
    <>
      {toast.toast !== null && <Toast message={toast.toast.message} onUndo={toast.undo} />}
      {voice.state.kind !== 'idle' ? (
        <VoiceCard voice={voice} accelerator={accelerator} onOpenSettings={() => setSettingsOpen(true)} />
      ) : aiFlow.stage.kind !== 'idle' ? (
        <AiCard
          flow={aiFlow}
          today={today}
          onOpenSettings={() => setSettingsOpen(true)}
          onVoiceAgain={voice.toggle}
        />
      ) : (
        <Composer
          value={draft}
          notice={notice}
          voiceShortcut={accelerator}
          disabled={list === null}
          mode={composerMode}
          when={when}
          today={today}
          categories={categories}
          category={composerCategory}
          urgency={urgency}
          onChange={(value) => {
            setDraft(value)
            setNotice(null)
          }}
          onModeChange={setChosenMode}
          onWhenChange={setWhen}
          onCategoryChange={(id) => setCategoryPick({ id })}
          onUrgencyChange={setUrgency}
          onCreateCategory={catalog.create}
          onSubmit={submitDraft}
          onVoice={voice.toggle}
        />
      )}
    </>
  )

  const view = buildTaskView(list ?? [], today)
  // 左栏的计数跟着分类筛选走；页眉的进度和小结仍然是全部待办。
  const listView = buildTaskView(filterTasks(list ?? [], catalog.filter, categories), today)
  const progress = todayProgress(list ?? [], today)
  const greeting = `${timeGreeting(new Date().getHours())}！${summaryHeadline ?? localSummaryLine(view)}`

  const summaryPanel = (
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
  )

  return (
    <>
      <TitleBar
        floatOpen={floatToggle.state.open}
        onToggleFloat={() => floatToggle.toggle('open')}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <AppShell
        nav={
          <NavPanel
            tab={tab}
            counts={{ today: listView.today.pending.length, later: listView.later.pending.length }}
            done={progress.done}
            total={progress.total}
            floatOpen={floatToggle.state.open}
            onTabChange={setTab}
            onToggleFloat={() => floatToggle.toggle('open')}
            categories={categories}
            categoryCounts={categoryCounts}
            filter={catalog.filter}
            onFilterChange={catalog.setFilter}
            categoryActions={catalog}
            categoryNotice={catalog.notice}
          />
        }
        main={main}
        assistant={
          <AssistantPanel
            tab={assistantTab}
            onTabChange={changeAssistantTab}
            greeting={greeting}
            log={aiFlow.log}
            summary={summaryPanel}
            bottom={bottom}
          />
        }
      />
      <Dialog open={settingsOpen} title="设置" onRequestClose={() => setSettingsOpen(false)}>
        {settingsOpen ? (
          <SettingsDialog settings={settings.settings} loadError={settings.loadError} actions={settings} />
        ) : null}
      </Dialog>
    </>
  )
}
