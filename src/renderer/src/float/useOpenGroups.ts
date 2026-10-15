import { useCallback, useEffect, useState } from 'react'
import { defaultOpen, parseOpenStates } from './floatGroups'

/** 展开状态的存放键。值是 { [组键]: boolean }，只记和默认值不同的组。 */
const STORAGE_KEY = 'qingxin.float.groups'

function readStored(): Record<string, boolean> {
  try {
    return parseOpenStates(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

function writeStored(states: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
  } catch {
    // 存不下（例如存储被禁用）就只在本次运行里生效。
  }
}

export type OpenGroups = {
  isOpen: (key: string) => boolean
  setOpen: (key: string, open: boolean) => void
}

/** 悬浮窗各组的展开 / 收起，记在 localStorage 里，重开悬浮窗还在。 */
export function useOpenGroups(): OpenGroups {
  const [stored, setStored] = useState<Record<string, boolean>>(readStored)

  useEffect(() => {
    writeStored(stored)
  }, [stored])

  const isOpen = useCallback(
    (key: string): boolean => {
      const value = stored[key]
      return typeof value === 'boolean' ? value : defaultOpen(key)
    },
    [stored]
  )

  const setOpen = useCallback((key: string, open: boolean): void => {
    setStored((current) => {
      const next = { ...current }
      if (open === defaultOpen(key)) delete next[key]
      else next[key] = open
      return next
    })
  }, [])

  return { isOpen, setOpen }
}
