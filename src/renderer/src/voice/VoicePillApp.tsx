import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { PILL_SIZE_LIMITS, type AiCommandResult, type PublicSettings, type VoiceClip } from '@shared/api'
import type { Task } from '@shared/types'
import { CheckIcon, CloseIcon } from '../components/icons'
import type { CategoryNotes, TaskChange } from '../lib/aiActions'
import { aiErrorKind, aiErrorTitle } from '../lib/aiErrors'
import { isAiConfigured } from '../lib/aiForm'
import { callApi } from '../lib/callApi'
import {
  deleteQuestion,
  deleteTargets,
  pillSummary,
  planPill,
  undoPill,
  type PillDeleteTarget,
  type PillUndo
} from '../lib/pillApply'
import { useSettings } from '../state/useSettings'
import { useTasks } from '../state/useTasks'
import { useToday } from '../state/useToday'
import { useVoice, type VoiceAvailability, type VoiceController } from '../state/useVoice'
import './VoicePill.css'

// 语音胶囊：屏幕底部的小窗口。录音在胶囊里完成，结果一行文字 + 撤销，约 5 秒后自己隐藏。
// 窗口的显示、位置和隐藏由主进程负责（它也不抢焦点），这里只负责内容和申请窗口大小。

/** 结果和提示停留多久后自己隐藏。 */
const RESULT_MS = 5000
/** 删除确认没人理时，多久后按「保留」收起（胶囊压在所有窗口上面，不能一直挂着）。 */
const ASK_MS = 15000
/** 波形小点的个数。 */
const DOT_COUNT = 11
/** 小点静止时是圆点（直径），说话时拉长成竖条，最高这么高。 */
const DOT_MIN_PX = 4
const DOT_MAX_PX = 20
/** 低于这个音量当成没出声，小点保持圆点不动。 */
const LEVEL_GATE = 0.04

/**
 * 结果那一行文字用胶囊自己的执行说明，不用 AI 的 reply：
 * 提示词让 AI 对新建说「确认一下就加上」，而胶囊里新建是直接执行的，照搬会误导。
 */
type DoneText = { created: readonly Task[]; changes: readonly TaskChange[]; notes: CategoryNotes }

/** 录音相关的状态在 useVoice 里，这里只放它的下一段和提示。 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'thinking'; requestId: string }
  | { kind: 'done'; text: string; undo: PillUndo | null }
  | { kind: 'ask'; deletes: PillDeleteTarget[]; undo: PillUndo; result: DoneText }
  | { kind: 'tip'; text: string; toSettings: boolean }

// 胶囊里没有撤销提示条：撤销由胶囊上的「撤销」按钮负责。
function noToast(): void {}

/** 语音能不能用：设置还没读回来时按能用处理，主进程会拒绝没配置好的请求，再提示去设置。 */
function availabilityOf(settings: PublicSettings | null): VoiceAvailability {
  if (settings === null) return 'ok'
  if (!isAiConfigured(settings)) return 'not-configured'
  return settings.ai.apiFormat === 'gemini' ? 'ok' : 'needs-gemini'
}

export function VoicePillApp() {
  const today = useToday()
  const tasks = useTasks(noToast)
  const settings = useSettings()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  // 每显示一段新内容就加 1：同样的提示连着出现两次时，自动隐藏要重新计时。
  const [generation, setGeneration] = useState(0)
  const [hover, setHover] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<string | null>(null)
  const phaseRef = useRef(phase)
  const voiceRef = useRef<VoiceController | null>(null)

  const voice = useVoice({
    accelerator: null,
    blocked: false,
    availability: availabilityOf(settings.settings),
    onClip: (clip) => run(clip),
    onHotkey: () => onPillHotkey()
  })
  voiceRef.current = voice

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // 窗口大小按当前内容申请；主进程校验范围，底边不动向上长。
  useReportSize(rootRef)

  /** 显示一段新内容（并重新计时自动隐藏）。 */
  const show = useCallback((next: Phase): void => {
    setPhase(next)
    setGeneration((current) => current + 1)
  }, [])

  const hide = useCallback((): void => {
    // 隐藏前放掉麦克风：录音中被隐藏 = 放弃这次录音。
    voiceRef.current?.cancel()
    show({ kind: 'idle' })
    void callApi(() => window.api.voicePill.hide())
  }, [show])

  // 结果那一行：胶囊自己的执行说明（见 DoneText 的说明）。
  const donePhase = useCallback(
    (text: DoneText, undo: PillUndo | null, deleted: number): Phase => {
      const line = pillSummary(text.created, text.changes, deleted, today, text.notes)
      return line === ''
        ? { kind: 'tip', text: '这次没有要改的待办', toSettings: false }
        : { kind: 'done', text: line, undo }
    },
    [today]
  )

  const receive = useCallback(
    (result: AiCommandResult): void => {
      const current = tasks.snapshot()
      const categories = tasks.categoriesSnapshot()
      if (current === null || categories === null) {
        show({ kind: 'tip', text: '还没读到待办，这次没有执行', toSettings: false })
        return
      }
      const plan = planPill(result.actions, { tasks: current, categories }, new Date().toISOString(), today)
      if (plan.nothing) {
        // 没听懂：对不上现成的待办，或这句话里没有能做的事。
        const text =
          result.unmatched.length > 0
            ? `没对上：${result.unmatched.join('、')}`
            : result.actions.length > 0
              ? '这些待办没有要改的地方'
              : '这次没听出要做的事'
        show({ kind: 'tip', text, toSettings: false })
        return
      }
      // 新建、完成、改时间、归类、设紧急度、开始做等马上落地（分类可能多了 AI 新建的）；删除先问一句。
      tasks.replace(plan.next.tasks, plan.next.categories)
      const undo: PillUndo = { createdIds: plan.createdIds, changes: plan.changes, removed: [] }
      const text: DoneText = { created: plan.created, changes: plan.changes, notes: plan.notes }
      if (plan.deletes.length > 0) show({ kind: 'ask', deletes: plan.deletes, undo, result: text })
      else show(donePhase(text, undo, 0))
    },
    [donePhase, show, tasks, today]
  )

  function run(clip: VoiceClip): void {
    if (tasks.snapshot() === null) {
      show({ kind: 'tip', text: tasks.loadError ?? '还在读取待办，稍等一下再说', toSettings: false })
      return
    }
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    show({ kind: 'thinking', requestId })
    void callApi(() => window.api.ai.command({ requestId, audio: clip })).then((result) => {
      // 已经取消、或又发了一次：这次结果直接丢掉。
      if (requestRef.current !== requestId) return
      requestRef.current = null
      if (result.ok) {
        receive(result.data)
        return
      }
      if (result.error.code === 'CANCELLED') {
        show({ kind: 'idle' })
        return
      }
      show({
        kind: 'tip',
        text: aiErrorTitle(result.error.code),
        toSettings: aiErrorKind(result.error.code) === 'settings'
      })
    })
  }

  /** 语音键 / 悬浮窗的语音按钮：没在录就开始，正在录就结束交给 AI；处理中、等用户回答删除确认时不打断。 */
  function onPillHotkey(): void {
    const controller = voiceRef.current
    if (phaseRef.current.kind === 'thinking' || phaseRef.current.kind === 'ask') return
    if (controller === null) return
    const { kind } = controller.state
    if (kind !== 'recording' && kind !== 'starting') show({ kind: 'idle' })
    // useVoice 的提示（没配置 AI、麦克风不可用…）可能是同一个对象：也让它重新计时。
    else setGeneration((current) => current + 1)
    controller.toggle()
  }

  function cancelThinking(current: Phase): void {
    if (current.kind !== 'thinking') return
    requestRef.current = null
    void callApi(() => window.api.ai.cancel(current.requestId))
    hide()
  }

  function confirmDelete(): void {
    if (phase.kind !== 'ask') return
    const current = tasks.snapshot()
    if (current === null) {
      show({ kind: 'tip', text: '还没读到待办，这次没有执行', toSettings: false })
      return
    }
    const { next, removed } = deleteTargets(current, phase.deletes)
    if (removed.length === 0) {
      show({ kind: 'tip', text: '要删的待办已经不在了', toSettings: false })
      return
    }
    tasks.replace(next)
    show(donePhase(phase.result, { ...phase.undo, removed }, removed.length))
  }

  function keepDeletes(): void {
    if (phase.kind === 'ask') show(donePhase(phase.result, phase.undo, 0))
  }

  function undoThis(): void {
    if (phase.kind !== 'done' || phase.undo === null) {
      hide()
      return
    }
    const current = tasks.snapshot()
    if (current === null) {
      hide()
      return
    }
    // 撤销这一次胶囊做的所有改动，作用在当前的列表上。
    tasks.replace(undoPill(current, phase.undo))
    show({ kind: 'tip', text: '已撤销', toSettings: false })
  }

  function openSettings(): void {
    void callApi(() => window.api.app.showMain())
    hide()
  }

  // Esc：录音中放弃，结果 / 提示时隐藏，删除确认时先保留（删除要手动点）。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      const kind = voiceRef.current?.state.kind ?? 'idle'
      if (kind === 'recording' || kind === 'starting') hide()
      else if (phaseRef.current.kind === 'ask') keepDeletes()
      else hide()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const notice = voice.state.kind === 'notice' ? voice.state.notice : null
  const hideable = notice !== null || ((phase.kind === 'done' || phase.kind === 'tip') && voice.state.kind === 'idle')

  // 结果和提示约 5 秒后自己隐藏；鼠标停在胶囊上时暂停计时。
  useEffect(() => {
    if (!hideable || hover) return
    const timer = window.setTimeout(hide, RESULT_MS)
    return () => window.clearTimeout(timer)
  }, [hideable, hover, hide, generation])

  // 删除确认没人理：过一会儿按「保留」收起，已经做了的改动照样留着撤销。
  const asking = phase.kind === 'ask'
  useEffect(() => {
    if (!asking || hover) return
    const timer = window.setTimeout(() => {
      const current = phaseRef.current
      if (current.kind === 'ask') show(donePhase(current.result, current.undo, 0))
    }, ASK_MS)
    return () => window.clearTimeout(timer)
  }, [asking, hover, show, donePhase, generation])

  // 事件订阅都就绪了再告诉主进程：在那之前收到的触发由主进程排队，这时补发。
  useEffect(() => {
    void callApi(() => window.api.voicePill.ready())
  }, [])

  const { kind } = voice.state

  return (
    <div
      className="pill-root"
      ref={rootRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {kind === 'starting' || kind === 'recording' ? (
        <RecordingPill voice={voice} mode="listening" onGiveUp={hide} onDone={voice.toggle} />
      ) : kind === 'processing' ? (
        // 录音在转格式：外形不变，波形换成「思考中」，✕ 仍是放弃。
        <RecordingPill voice={voice} mode="thinking" onGiveUp={hide} onDone={null} />
      ) : notice !== null ? (
        <PillRow>
          <span className="pill-lines">
            <span className="pill-text" role="status">
              {notice.title}
            </span>
            <span className="pill-sub">{notice.body}</span>
          </span>
          {notice.toSettings && (
            <button type="button" className="pill-button" onClick={openSettings}>
              打开设置
            </button>
          )}
        </PillRow>
      ) : phase.kind === 'thinking' ? (
        // 和录音时同一个外形，不改窗口大小、不跳：✕ 取消请求，右边转圈。
        <RecordingPill voice={voice} mode="thinking" onGiveUp={() => cancelThinking(phase)} onDone={null} />
      ) : phase.kind === 'done' ? (
        <PillRow>
          <span className="pill-text" role="status" title={phase.text}>
            {phase.text}
          </span>
          <button type="button" className="pill-button" onClick={undoThis}>
            撤销
          </button>
        </PillRow>
      ) : phase.kind === 'ask' ? (
        <PillRow>
          <span className="pill-text" role="status">
            {deleteQuestion(phase.deletes)}
          </span>
          <button type="button" className="pill-button is-quiet" onClick={keepDeletes}>
            保留
          </button>
          <button type="button" className="pill-button is-danger" onClick={confirmDelete}>
            删除
          </button>
        </PillRow>
      ) : phase.kind === 'tip' ? (
        <PillRow>
          <span className="pill-text" role="status" title={phase.text}>
            {phase.text}
          </span>
          {phase.toSettings && (
            <button type="button" className="pill-button" onClick={openSettings}>
              打开设置
            </button>
          )}
        </PillRow>
      ) : null}
    </div>
  )
}

/** 一行文字的胶囊：结果、提示、删除确认都长这样。 */
function PillRow({ children }: { children: ReactNode }) {
  return <div className="pill pill-row">{children}</div>
}

/** 录音中 / 思考中：黑色胶囊、✕、波形小点、✓（思考中换成转圈）。两种状态外形和大小完全一样。 */
function RecordingPill({
  voice,
  mode,
  onGiveUp,
  onDone
}: {
  voice: VoiceController
  mode: 'listening' | 'thinking'
  onGiveUp: () => void
  onDone: (() => void) | null
}) {
  const listening = mode === 'listening'
  return (
    <div className="pill pill-recording">
      <button
        type="button"
        className="pill-icon-button"
        aria-label={listening ? '放弃这次录音' : '取消'}
        title={listening ? '放弃' : '取消'}
        onClick={onGiveUp}
      >
        <CloseIcon size={13} />
      </button>
      {listening ? <Waveform voice={voice} /> : <ThinkingDots />}
      {onDone === null ? (
        <span className="pill-icon-button is-solid is-busy" aria-hidden="true">
          <span className="pill-spinner" />
        </span>
      ) : (
        <button type="button" className="pill-icon-button is-solid" aria-label="说完了" title="说完了" onClick={onDone}>
          <CheckIcon size={15} />
        </button>
      )}
      <span className="sr-only" role="status">
        {listening ? '正在录音，说完点右边的按钮' : '正在理解…'}
      </span>
    </div>
  )
}

/** 思考中：同一排小点依次轻轻起伏（纯 CSS）。 */
function ThinkingDots() {
  return (
    <span className="pill-wave is-thinking" aria-hidden="true">
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <span key={index} className="pill-dot" style={{ '--i': index } as CSSProperties} />
      ))}
    </span>
  )
}

/**
 * 一排白色小点：没出声时是一排圆点（和参考图一样），说话时按音量拉长成圆头竖条，中间的高、两边的低。
 * 改的是 height 不是 scaleY（scaleY 会把圆头压成椭圆）；只改样式，不跟着每一帧重新渲染。
 */
function Waveform({ voice }: { voice: VoiceController }) {
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([])
  const { level } = voice

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let smoothed = 0
    const draw = (): void => {
      const raw = Math.max(0, level() - LEVEL_GATE) * 1.8
      const target = Math.min(1, raw)
      // 起得快、落得慢，看起来跟着说话的节奏，而不是乱闪。
      smoothed += (target - smoothed) * (target > smoothed ? 0.45 : 0.12)
      const time = performance.now() / 160
      dotsRef.current.forEach((dot, index) => {
        if (dot === null) return
        const distance = Math.abs(index - (DOT_COUNT - 1) / 2) / ((DOT_COUNT - 1) / 2)
        const envelope = 1 - distance * 0.6
        const ripple = still ? 1 : 0.55 + 0.45 * Math.sin(time + index * 0.9)
        const height = DOT_MIN_PX + (DOT_MAX_PX - DOT_MIN_PX) * smoothed * envelope * ripple
        dot.style.height = `${height.toFixed(1)}px`
      })
      frame = window.requestAnimationFrame(draw)
    }
    frame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frame)
  }, [level])

  return (
    <span className="pill-wave" aria-hidden="true">
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <span
          key={index}
          className="pill-dot"
          ref={(node) => {
            dotsRef.current[index] = node
          }}
        />
      ))}
    </span>
  )
}

/** 按内容申请窗口大小：主进程只接受 120–480 × 40–240 的整数，底边不动向上长。 */
function useReportSize(rootRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const node = rootRef.current
    if (node === null) return
    let reported = ''
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect()
      const width = Math.ceil(rect.width)
      const height = Math.ceil(rect.height)
      if (width < PILL_SIZE_LIMITS.minWidth || height < PILL_SIZE_LIMITS.minHeight) return
      const key = `${width}x${height}`
      if (key === reported) return
      reported = key
      void callApi(() => window.api.voicePill.resize({ width, height }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [rootRef])
}
