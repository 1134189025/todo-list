import { useRef, useState } from 'react'
import type { ErrorCode } from '@shared/api'
import type { Task } from '@shared/types'
import { truncateTitle } from '@shared/text'
import { callApi } from '../lib/callApi'
import { type DraftItem, type DraftPatch, draftToTask, pickableItems, toDraftItem } from '../lib/aiDraft'
import { createTask } from '../lib/taskOps'

export type AiStage =
  | { kind: 'idle' }
  | { kind: 'thinking'; script: string; requestId: string }
  | { kind: 'confirm'; script: string; items: DraftItem[] }
  | { kind: 'empty'; script: string }
  | { kind: 'failed'; script: string; code: ErrorCode; message: string }

export type AiFlow = {
  stage: AiStage
  /** 发起一次整理（原话已经 trim、非空）。 */
  start: (script: string) => void
  /** 思考中点「取消」：通知主进程，并把原话放回输入框。 */
  cancelThinking: () => void
  /** 「重新输入」：把原话放回输入框。 */
  reenter: () => void
  /** 「取消」：丢弃这次结果。 */
  dismiss: () => void
  retry: () => void
  /** 「先存成 1 条」「直接存为待办」：把原话存成一条手动待办。 */
  saveAsOne: () => void
  updateItem: (key: string, patch: DraftPatch) => void
  removeItem: (key: string) => void
  confirmItems: () => void
}

type Options = {
  addTasks: (created: Task[], message: string) => void
  restoreDraft: (text: string) => void
}

/**
 * AI 整理的状态机。只接受当前这次请求的结果：取消过、又发了新的、或已经离开，都直接丢掉。
 */
export function useAiFlow({ addTasks, restoreDraft }: Options): AiFlow {
  const [stage, setStage] = useState<AiStage>({ kind: 'idle' })
  const requestRef = useRef<string | null>(null)

  function cancelRequest(requestId: string): void {
    requestRef.current = null
    void callApi(() => window.api.ai.cancel(requestId))
  }

  function start(script: string): void {
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setStage({ kind: 'thinking', script, requestId })
    void callApi(() => window.api.ai.parse({ requestId, text: script })).then((result) => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      if (result.ok) {
        setStage(
          result.data.length === 0
            ? { kind: 'empty', script }
            : { kind: 'confirm', script, items: result.data.map(toDraftItem) }
        )
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
    restoreDraft(stage.script)
    setStage({ kind: 'idle' })
  }

  function dismiss(): void {
    if (stage.kind === 'thinking') cancelRequest(stage.requestId)
    setStage({ kind: 'idle' })
  }

  function retry(): void {
    if (stage.kind === 'failed') start(stage.script)
  }

  function saveAsOne(): void {
    if (stage.kind !== 'failed' && stage.kind !== 'empty') return
    const title = truncateTitle(stage.script)
    const created = createTask(
      { title, dueDate: null, dueTime: null, source: 'manual' },
      new Date().toISOString()
    )
    addTasks([created], '已添加 1 件待办')
    setStage({ kind: 'idle' })
  }

  function updateItem(key: string, patch: DraftPatch): void {
    setStage((current) =>
      current.kind === 'confirm'
        ? {
            ...current,
            items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item))
          }
        : current
    )
  }

  function removeItem(key: string): void {
    setStage((current) =>
      current.kind === 'confirm' ? { ...current, items: current.items.filter((item) => item.key !== key) } : current
    )
  }

  function confirmItems(): void {
    if (stage.kind !== 'confirm') return
    const picks = pickableItems(stage.items)
    if (picks.length === 0) return
    const nowIso = new Date().toISOString()
    addTasks(
      picks.map((item) => draftToTask(item, nowIso)),
      `已添加 ${picks.length} 件待办`
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
    confirmItems
  }
}
