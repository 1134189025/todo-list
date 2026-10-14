import { useCallback, useEffect, useRef, useState } from 'react'

const NO_VOICE_MESSAGE = '系统没有可用的中文语音'

export type SpeechController = {
  speaking: boolean
  error: string | null
  toggle: (text: string) => void
  stop: () => void
}

function hasChineseVoice(synth: SpeechSynthesis): boolean {
  const voices = synth.getVoices()
  // 语音列表可能还没加载完：这时不提前判定没有，交给 onerror 处理。
  if (voices.length === 0) return true
  return voices.some((voice) => voice.lang.toLowerCase().startsWith('zh'))
}

/** 朗读：再点一次停止；停止、卸载时都会停掉。 */
export function useSpeech(): SpeechController {
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback((): void => {
    current.current = null
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const toggle = useCallback(
    (text: string): void => {
      if (current.current !== null) {
        stop()
        return
      }
      const synth = typeof window.speechSynthesis === 'undefined' ? null : window.speechSynthesis
      if (synth === null || typeof SpeechSynthesisUtterance === 'undefined' || !hasChineseVoice(synth)) {
        setError(NO_VOICE_MESSAGE)
        return
      }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      const finish = (): void => {
        if (current.current !== utterance) return
        current.current = null
        setSpeaking(false)
      }
      utterance.onend = finish
      utterance.onerror = () => {
        finish()
        setError(NO_VOICE_MESSAGE)
      }
      current.current = utterance
      setError(null)
      synth.cancel()
      synth.speak(utterance)
      setSpeaking(true)
    },
    [stop]
  )

  useEffect(() => stop, [stop])

  return { speaking, error, toggle, stop }
}
