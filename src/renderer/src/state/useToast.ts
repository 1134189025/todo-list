import { useCallback, useEffect, useState } from 'react'

const TOAST_MS = 5000

export type ToastState = { message: string; onUndo: (() => void) | null }

export type ToastController = {
  toast: ToastState | null
  show: (message: string, onUndo?: () => void) => void
  undo: () => void
  dismiss: () => void
}

/** 底部提示，5 秒后消失；新的提示替换旧的。 */
export function useToast(): ToastController {
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const show = useCallback((message: string, onUndo?: () => void) => {
    setToast({ message, onUndo: onUndo ?? null })
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  const undo = useCallback(() => {
    toast?.onUndo?.()
    setToast(null)
  }, [toast])

  return { toast, show, undo, dismiss }
}
