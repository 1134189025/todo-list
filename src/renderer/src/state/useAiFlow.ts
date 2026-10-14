import { useRef, useState } from 'react'
import type { AiCommandResult, ErrorCode, VoiceClip } from '@shared/api'
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

/** 助理面板里的一来一回：用户说了什么（带引号的原话或「一段 N 秒的语音」）和助理回的话。 */
export type Exchange = { id: string; said: string; reply: string }

// 只留最近这么多条，只在内存里，不发给 AI。
const LOG_LIMIT = 30

/** 已经直接执行的改动和提示文字；id 用来在用户从提示条撤销后把它从卡片上去掉。 */
export type Applied = { id: string; message: string; changes: TaskChange[] }

/**
 * 这句指令说了什么。script：打字的原话，或 AI 从录音里听写出的原话（还没听写、没听清时为空）；
 * clip：语音指令的录音，打字时为 null。
 */
export type Said = { script: string; clip: VoiceClip | null }

export type AiStage =
  | { kind: 'idle' }
  | ({ kind: 'thinking'; requestId: string } & Said)
  // 新建和删除要确认；applied 是已经直接执行的那部分（没有就为 null），撤销时和这一步一起撤。
  | ({
      kind: 'confirm'
      items: DraftItem[]
      deletes: DeleteDraft[]
      unmatched: string[]
      applied: Applied | null
    } & Said)
  | ({ kind: 'unmatched'; unmatched: string[]; applied: Applied | null } & Said)
  | ({ kind: 'empty' } & Said)
  | ({ kind: 'failed'; code: ErrorCode; message: string } & Said)

export type AiFlow = {
  stage: AiStage
  /** 这次打开程序以来的对话，最早的在前。 */
  log: Exchange[]
  /** 发起一次 AI 指令（原话已经 trim、非空）。 */
  start: (script: string) => void
  /** 用一段录音发起 AI 指令。 */
  startVoice: (clip: VoiceClip) => void
  /** 思考中点「取消」：通知主进程，并把原话放回输入框。 */
  cancelThinking: () => void
  /** 「重新输入」：把原话（语音时是听写出的原话）放回输入框。 */
  reenter: () => void
  /** 「取消」：丢弃待确认的部分（已经直接执行的不受影响，可以用提示条撤销）。 */
  dismiss: () => void
  retry: () => void
  /** 「先存成 1 条」「直接存为待办」：把原话存成一条手动待办（没有原话时不做）。 */
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

/** 卡片上引用的原话（带引号）；语音还没听写或没听清时说是一段几秒的语音。 */
export function quoteOf(said: Said): string {
  if (said.script !== '' || said.clip === null) return `“${said.script}”`
  return `（一段 ${said.clip.seconds} 秒的语音）`
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
  const [log, setLog] = useState<Exchange[]>([])
  const requestRef = useRef<string | null>(null)

  // AI 没写回复时，用直接执行的说明顶上；都没有就不记。
  function remember(said: Said, reply: string | null): void {
    if (reply === null || reply === '') return
    const entry: Exchange = { id: crypto.randomUUID(), said: quoteOf(said), reply }
    setLog((current) => [...current, entry].slice(-LOG_LIMIT))
  }

  function cancelRequest(requestId: string): void {
    requestRef.current = null
    void callApi(() => window.api.ai.cancel(requestId))
  }

  // 用户从提示条撤销了直接执行的部分：卡片上不再提它，执行时也不再连带撤销、不再说「另有 N 项」。
  function forgetApplied(id: string): void {
    setStage((current) =>
      (current.kind === 'confirm' || current.kind === 'unmatched') && current.applied?.id === id
        ? { ...current, applied: null }
        : current
    )
  }

  function undoApplied(applied: Applied): (now: Task[]) => Task[] {
    return (now) => {
      forgetApplied(applied.id)
      return revertChanges(now, applied.changes)
    }
  }

  // 直接执行的部分作用在收到结果时的当前列表上；什么都没改时返回 null。
  function applyDirect(result: AiCommandResult): Applied | null {
    const current = tasks.snapshot()
    if (current === null) return null
    const direct = result.actions.filter(isDirectAction)
    const { next, changes } = applyDirectActions(current, direct, new Date().toISOString(), today)
    if (changes.length === 0) return null
    const applied: Applied = { id: crypto.randomUUID(), message: changesMessage(changes, today), changes }
    tasks.replaceWithUndo(next, applied.message, undoApplied(applied))
    return applied
  }

  // 关掉确认 / 提示卡片时，直接执行的那部分可能已经过了提示条的 5 秒：再给一次撤销的机会（已经撤销过就不再给）。
  function reofferApplied(applied: Applied | null): void {
    if (applied !== null) tasks.offerUndo(applied.message, undoApplied(applied))
  }

  // 语音指令没有可以放回去的原话时，输入框里原来打的字保持不动。
  function restoreScript(said: Said): void {
    if (said.script !== '') restoreDraft(said.script)
  }

  function receive(said: Said, result: AiCommandResult): void {
    const applied = applyDirect(result)
    remember(said, result.reply ?? applied?.message ?? null)
    const current = tasks.snapshot() ?? []
    const items = result.actions.flatMap((action) => (action.op === 'add' ? [toDraftItem(action.item)] : []))
    const deletes = result.actions.flatMap((action) => {
      if (action.op !== 'delete') return []
      const draft = toDeleteDraft(action.id, current)
      return draft === null ? [] : [draft]
    })
    if (items.length > 0 || deletes.length > 0) {
      setStage({ kind: 'confirm', ...said, items, deletes, unmatched: result.unmatched, applied })
    } else if (result.unmatched.length > 0) {
      setStage({ kind: 'unmatched', ...said, unmatched: result.unmatched, applied })
    } else if (applied === null) {
      setStage({ kind: 'empty', ...said })
    } else {
      setStage({ kind: 'idle' })
    }
  }

  function run(said: Said): void {
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setStage({ kind: 'thinking', requestId, ...said })
    const request = said.clip === null ? { requestId, text: said.script } : { requestId, audio: said.clip }
    void callApi(() => window.api.ai.command(request)).then((result) => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      if (result.ok) {
        receive(said.clip === null ? said : { script: result.data.heard ?? '', clip: said.clip }, result.data)
        return
      }
      if (result.error.code === 'CANCELLED') return
      setStage({ kind: 'failed', ...said, code: result.error.code, message: result.error.message })
    })
  }

  function start(script: string): void {
    run({ script, clip: null })
  }

  function startVoice(clip: VoiceClip): void {
    run({ script: '', clip })
  }

  function cancelThinking(): void {
    if (stage.kind !== 'thinking') return
    cancelRequest(stage.requestId)
    restoreScript(stage)
    setStage({ kind: 'idle' })
  }

  function reenter(): void {
    if (stage.kind === 'idle') return
    if (stage.kind === 'thinking') cancelRequest(stage.requestId)
    if (stage.kind === 'confirm' || stage.kind === 'unmatched') reofferApplied(stage.applied)
    restoreScript(stage)
    setStage({ kind: 'idle' })
  }

  function dismiss(): void {
    if (stage.kind === 'thinking') cancelRequest(stage.requestId)
    if (stage.kind === 'confirm' || stage.kind === 'unmatched') reofferApplied(stage.applied)
    setStage({ kind: 'idle' })
  }

  function retry(): void {
    if (stage.kind === 'failed') run({ script: stage.script, clip: stage.clip })
  }

  function saveAsOne(): void {
    if ((stage.kind !== 'failed' && stage.kind !== 'empty') || stage.script === '') return
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
    // 要删的已经被别处删掉、也没有新建：什么都不用做，只把直接执行那部分的撤销再给一次。
    if (created.length === 0 && removed.length === 0) {
      reofferApplied(stage.applied)
      setStage({ kind: 'idle' })
      return
    }
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
    log,
    start,
    startVoice,
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
