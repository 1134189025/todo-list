import { useRef, useState } from 'react'
import type { AiCommandResult, ErrorCode } from '@shared/api'
import type { Task } from '@shared/types'
import { truncateTitle } from '@shared/text'
import { callApi } from '../lib/callApi'
import {
  applyDirectActions,
  changesMessage,
  type DeleteDraft,
  isDirectAction,
  removeTasks,
  revertChanges,
  type TaskChange,
  toDeleteDraft
} from '../lib/aiActions'
import { type DraftItem, type DraftPatch, draftToTask, pickableItems, toDraftItem } from '../lib/aiDraft'
import { createTask, restoreAt, withoutIds } from '../lib/taskOps'
import type { TasksController } from './useTasks'

/** 已经直接执行的改动和提示文字。 */
export type Applied = { message: string; changes: TaskChange[] }

export type AiStage =
  | { kind: 'idle' }
  | { kind: 'thinking'; script: string; requestId: string }
  // 新建和删除要确认；applied 是已经直接执行的那部分（没有就为 null），撤销时和这一步一起撤。
  | {
      kind: 'confirm'
      script: string
      items: DraftItem[]
      deletes: DeleteDraft[]
      unmatched: string[]
      applied: Applied | null
    }
  | { kind: 'unmatched'; script: string; unmatched: string[]; applied: Applied | null }
  | { kind: 'empty'; script: string }
  | { kind: 'failed'; script: string; code: ErrorCode; message: string }

export type AiFlow = {
  stage: AiStage
  /** 发起一次 AI 指令（原话已经 trim、非空）。 */
  start: (script: string) => void
  /** 思考中点「取消」：通知主进程，并把原话放回输入框。 */
  cancelThinking: () => void
  /** 「重新输入」：把原话放回输入框。 */
  reenter: () => void
  /** 「取消」：丢弃待确认的部分（已经直接执行的不受影响，可以用提示条撤销）。 */
  dismiss: () => void
  retry: () => void
  /** 「先存成 1 条」「直接存为待办」：把原话存成一条手动待办。 */
  saveAsOne: () => void
  updateItem: (key: string, patch: DraftPatch) => void
  removeItem: (key: string) => void
  toggleDelete: (key: string, include: boolean) => void
  /** 执行确认卡片里勾选的新建和删除。 */
  confirmItems: () => void
}

type Options = {
  tasks: Pick<TasksController, 'snapshot' | 'replaceWithUndo' | 'offerUndo'>
  restoreDraft: (text: string) => void
  today: string
}

/** 确认卡片里要执行的条数：勾选且标题非空的新建 + 勾选的删除。 */
export function confirmCount(stage: Extract<AiStage, { kind: 'confirm' }>): number {
  return pickableItems(stage.items).length + stage.deletes.filter((item) => item.include).length
}

function resultMessage(added: number, deleted: number): string {
  if (deleted === 0) return `已添加 ${added} 件待办`
  if (added === 0) return `已删除 ${deleted} 件待办`
  return `已添加 ${added} 件、删除 ${deleted} 件待办`
}

/**
 * AI 指令的状态机。只接受当前这次请求的结果：取消过、又发了新的、或已经离开，都直接丢掉。
 * 完成 / 取消完成 / 改时间 / 改标题直接执行（提示条可撤销）；新建和删除进确认卡片。
 */
export function useAiFlow({ tasks, restoreDraft, today }: Options): AiFlow {
  const [stage, setStage] = useState<AiStage>({ kind: 'idle' })
  const requestRef = useRef<string | null>(null)

  function cancelRequest(requestId: string): void {
    requestRef.current = null
    void callApi(() => window.api.ai.cancel(requestId))
  }

  // 直接执行的部分作用在收到结果时的当前列表上；什么都没改时返回 null。
  function applyDirect(result: AiCommandResult): Applied | null {
    const current = tasks.snapshot()
    if (current === null) return null
    const direct = result.actions.filter(isDirectAction)
    const { next, changes } = applyDirectActions(current, direct, new Date().toISOString(), today)
    if (changes.length === 0) return null
    const message = changesMessage(changes, today)
    tasks.replaceWithUndo(next, message, (now) => revertChanges(now, changes))
    return { message, changes }
  }

  // 关掉确认 / 提示卡片时，直接执行的那部分可能已经过了提示条的 5 秒：再给一次撤销的机会。
  function reofferApplied(applied: Applied | null): void {
    if (applied !== null) tasks.offerUndo(applied.message, (now) => revertChanges(now, applied.changes))
  }

  function receive(script: string, result: AiCommandResult): void {
    const applied = applyDirect(result)
    const current = tasks.snapshot() ?? []
    const items = result.actions.flatMap((action) => (action.op === 'add' ? [toDraftItem(action.item)] : []))
    const deletes = result.actions.flatMap((action) => {
      if (action.op !== 'delete') return []
      const draft = toDeleteDraft(action.id, current)
      return draft === null ? [] : [draft]
    })
    if (items.length > 0 || deletes.length > 0) {
      setStage({ kind: 'confirm', script, items, deletes, unmatched: result.unmatched, applied })
    } else if (result.unmatched.length > 0) {
      setStage({ kind: 'unmatched', script, unmatched: result.unmatched, applied })
    } else if (applied === null) {
      setStage({ kind: 'empty', script })
    } else {
      setStage({ kind: 'idle' })
    }
  }

  function start(script: string): void {
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setStage({ kind: 'thinking', script, requestId })
    void callApi(() => window.api.ai.command({ requestId, text: script })).then((result) => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      if (result.ok) {
        receive(script, result.data)
        return
      }
      if (result.error.code === 'CANCELLED') return
      setStage({ kind: 'failed', script, code: result.error.code, message: result.error.message })
    })
  }

  function cancelThinking(): void {
    if (stage.kind !== 'thinking') return
    cancelRequest(stage.requestId)
    restoreDraft(stage.script)
    setStage({ kind: 'idle' })
  }

  function reenter(): void {
    if (stage.kind === 'idle') return
    if (stage.kind === 'thinking') cancelRequest(stage.requestId)
    if (stage.kind === 'confirm' || stage.kind === 'unmatched') reofferApplied(stage.applied)
    restoreDraft(stage.script)
    setStage({ kind: 'idle' })
  }

  function dismiss(): void {
    if (stage.kind === 'thinking') cancelRequest(stage.requestId)
    if (stage.kind === 'confirm' || stage.kind === 'unmatched') reofferApplied(stage.applied)
    setStage({ kind: 'idle' })
  }

  function retry(): void {
    if (stage.kind === 'failed') start(stage.script)
  }

  function saveAsOne(): void {
    if (stage.kind !== 'failed' && stage.kind !== 'empty') return
    const current = tasks.snapshot()
    if (current === null) return
    const created = createTask(
      { title: truncateTitle(stage.script), dueDate: null, dueTime: null, source: 'manual' },
      new Date().toISOString()
    )
    tasks.replaceWithUndo([created, ...current], '已添加 1 件待办', (now) => withoutIds(now, new Set([created.id])))
    setStage({ kind: 'idle' })
  }

  function updateItem(key: string, patch: DraftPatch): void {
    setStage((current) =>
      current.kind === 'confirm'
        ? { ...current, items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }
        : current
    )
  }

  function removeItem(key: string): void {
    setStage((current) =>
      current.kind === 'confirm' ? { ...current, items: current.items.filter((item) => item.key !== key) } : current
    )
  }

  function toggleDelete(key: string, include: boolean): void {
    setStage((current) =>
      current.kind === 'confirm'
        ? { ...current, deletes: current.deletes.map((item) => (item.key === key ? { ...item, include } : item)) }
        : current
    )
  }

  function confirmItems(): void {
    if (stage.kind !== 'confirm' || confirmCount(stage) === 0) return
    const current = tasks.snapshot()
    if (current === null) return
    const nowIso = new Date().toISOString()
    const created: Task[] = pickableItems(stage.items).map((item) => draftToTask(item, nowIso))
    const deleteIds = new Set(stage.deletes.filter((item) => item.include).map((item) => item.taskId))
    const { next, removed } = removeTasks(current, deleteIds)
    const createdIds = new Set(created.map((task) => task.id))
    const directChanges = stage.applied?.changes ?? []
    const extra = directChanges.length === 0 ? '' : `，另有 ${directChanges.length} 项已直接处理`
    // 撤销 = 撤销这整句指令：先撤新建和删除，再撤直接执行的改动。
    tasks.replaceWithUndo([...created, ...next], `${resultMessage(created.length, removed.length)}${extra}`, (now) =>
      revertChanges(
        removed.reduce((list, entry) => restoreAt(list, entry.task, entry.index), withoutIds(now, createdIds)),
        directChanges
      )
    )
    setStage({ kind: 'idle' })
  }

  return {
    stage,
    start,
    cancelThinking,
    reenter,
    dismiss,
    retry,
    saveAsOne,
    updateItem,
    removeItem,
    toggleDelete,
    confirmItems
  }
}
