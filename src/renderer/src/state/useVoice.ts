import { useCallback, useEffect, useRef, useState } from 'react'
import { fromKeyboardEvent } from '@shared/accelerator'
import type { VoiceClip } from '@shared/api'
import { RecorderError, startRecording, type Recording, type RecorderFailure } from '../lib/recorder'

/** 一次最多录多久，到点自动结束并交给 AI。 */
export const VOICE_MAX_SECONDS = 60
const VOICE_MIN_SECONDS = 0.6

/** 能不能用语音：要配好 AI，且接口格式是 Gemini 原生（OpenAI 兼容接口传不了语音）。 */
export type VoiceAvailability = 'ok' | 'not-configured' | 'needs-gemini'

export type VoiceNotice = { title: string; body: string; toSettings: boolean }

export type VoiceState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'processing' }
  | { kind: 'notice'; notice: VoiceNotice }

export type VoiceController = {
  state: VoiceState
  /** 麦克风按钮和快捷键：没在录就开始，正在录就结束并交给 AI。 */
  toggle: () => void
  /** 放弃这次录音。 */
  cancel: () => void
  /** 关掉提示。 */
  dismiss: () => void
  /** 当前音量 0–1。 */
  level: () => number
}

type Options = {
  accelerator: string | null
  /** 设置对话框开着、或 AI 正在处理时，快捷键不触发。 */
  blocked: boolean
  availability: VoiceAvailability
  onClip: (clip: VoiceClip) => void
  /**
   * 语音键按下时做什么；不传就是开始 / 结束这次录音。
   * 主窗口传「触发语音胶囊」：全局语音键不再弹主窗口，改成屏幕底部的胶囊。
   */
  onHotkey?: () => void
}

const NOTICES: Record<Exclude<VoiceAvailability, 'ok'> | RecorderFailure | 'too-short', VoiceNotice> = {
  'not-configured': { title: '还没配置 AI 服务', body: '语音要交给 AI 理解，先在设置里配置 AI 服务', toSettings: true },
  'needs-gemini': {
    title: '语音需要 Gemini 原生接口',
    body: '在「设置 → AI 服务」把接口格式改成 Gemini 原生；OpenAI 兼容接口传不了语音',
    toSettings: true
  },
  denied: {
    title: '麦克风用不了',
    body: '在 Windows 设置 → 隐私和安全性 → 麦克风 里允许桌面应用访问麦克风，再试一次',
    toSettings: false
  },
  'no-device': { title: '没有找到麦克风', body: '插上麦克风或耳机后再试', toSettings: false },
  busy: {
    title: '麦克风打不开',
    body: '可能被别的程序占用，或 Windows 设置 → 隐私和安全性 → 麦克风 里没允许桌面应用访问',
    toSettings: false
  },
  failed: { title: '录音没成功', body: '再试一次；还不行可以先打字', toSettings: false },
  'too-short': { title: '太短了，没听清', body: '说完一整句再点「说完了」', toSettings: false }
}

export function useVoice(options: Options): VoiceController {
  const [state, setState] = useState<VoiceState>({ kind: 'idle' })
  const stateRef = useRef<VoiceState>(state)
  const optionsRef = useRef(options)
  const recordingRef = useRef<Recording | null>(null)
  const timerRef = useRef<number | null>(null)
  // 每开始或取消一次加 1：取消之后才回来的麦克风、录音结果直接丢掉。
  const sessionRef = useRef(0)

  useEffect(() => {
    optionsRef.current = options
  })

  const update = useCallback((next: VoiceState): void => {
    stateRef.current = next
    setState(next)
  }, [])

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const finish = useCallback((): void => {
    const recording = recordingRef.current
    if (recording === null) return
    recordingRef.current = null
    clearTimer()
    update({ kind: 'processing' })
    const session = sessionRef.current
    recording.stop().then(
      (clip) => {
        if (sessionRef.current !== session) return
        if (clip.seconds < VOICE_MIN_SECONDS) {
          update({ kind: 'notice', notice: NOTICES['too-short'] })
          return
        }
        update({ kind: 'idle' })
        optionsRef.current.onClip(clip)
      },
      () => {
        if (sessionRef.current === session) update({ kind: 'notice', notice: NOTICES.failed })
      }
    )
  }, [clearTimer, update])

  const begin = useCallback((): void => {
    const { availability } = optionsRef.current
    if (availability !== 'ok') {
      update({ kind: 'notice', notice: NOTICES[availability] })
      return
    }
    sessionRef.current += 1
    const session = sessionRef.current
    update({ kind: 'starting' })
    startRecording().then(
      (recording) => {
        if (sessionRef.current !== session) {
          recording.cancel()
          return
        }
        recordingRef.current = recording
        update({ kind: 'recording', startedAt: Date.now() })
        timerRef.current = window.setTimeout(finish, VOICE_MAX_SECONDS * 1000)
      },
      (error: unknown) => {
        if (sessionRef.current !== session) return
        update({ kind: 'notice', notice: NOTICES[error instanceof RecorderError ? error.reason : 'failed'] })
      }
    )
  }, [finish, update])

  const toggle = useCallback((): void => {
    const { kind } = stateRef.current
    if (kind === 'idle' || kind === 'notice') begin()
    else if (kind === 'recording') finish()
  }, [begin, finish])

  const cancel = useCallback((): void => {
    sessionRef.current += 1
    clearTimer()
    recordingRef.current?.cancel()
    recordingRef.current = null
    update({ kind: 'idle' })
  }, [clearTimer, update])

  const dismiss = useCallback((): void => {
    if (stateRef.current.kind === 'notice') update({ kind: 'idle' })
  }, [update])

  const level = useCallback((): number => recordingRef.current?.level() ?? 0, [])

  // 主进程转来的语音键（胶囊用）、窗口内按下同一组合（主窗口的兜底）；录音时 Esc 放弃。
  useEffect(() => {
    if (options.blocked) return
    const press = (): void => (optionsRef.current.onHotkey ?? toggle)()
    const unsubscribe = window.api.events.onVoiceHotkey(press)
    function onKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.isComposing) return
      const { kind } = stateRef.current
      if (event.key === 'Escape' && (kind === 'recording' || kind === 'starting')) {
        event.preventDefault()
        cancel()
        return
      }
      const { accelerator } = optionsRef.current
      if (accelerator === null || fromKeyboardEvent(event) !== accelerator) return
      event.preventDefault()
      press()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [options.blocked, toggle, cancel])

  // 录音中打开了设置：放弃这次录音，不在对话框后面一直录下去。
  useEffect(() => {
    const { kind } = stateRef.current
    if (options.blocked && (kind === 'recording' || kind === 'starting')) cancel()
  }, [options.blocked, cancel])

  // 关窗口或组件卸载时放掉麦克风。
  useEffect(
    () => () => {
      sessionRef.current += 1
      recordingRef.current?.cancel()
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  return { state, toggle, cancel, dismiss, level }
}
