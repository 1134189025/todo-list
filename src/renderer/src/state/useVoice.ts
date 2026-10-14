import { useCallback, useEffect, useState } from 'react'
import { fromKeyboardEvent } from '@shared/accelerator'

export type VoiceController = {
  voiceOpen: boolean
  openVoice: () => void
  closeVoice: () => void
}

/**
 * 语音入口：麦克风按钮、全局快捷键事件、窗口内按下同一组合。
 * blocked 为 true（设置对话框打开）时全部不触发。
 */
export function useVoice(accelerator: string | null, blocked: boolean): VoiceController {
  const [voiceOpen, setVoiceOpen] = useState(false)

  useEffect(() => {
    if (blocked) return
    const unsubscribe = window.api.events.onVoiceHotkey(() => setVoiceOpen(true))

    function onKeyDown(event: KeyboardEvent): void {
      if (accelerator === null || event.repeat || event.isComposing) return
      if (fromKeyboardEvent(event) !== accelerator) return
      event.preventDefault()
      setVoiceOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [accelerator, blocked])

  const openVoice = useCallback(() => setVoiceOpen(true), [])
  const closeVoice = useCallback(() => setVoiceOpen(false), [])

  return { voiceOpen, openVoice, closeVoice }
}
