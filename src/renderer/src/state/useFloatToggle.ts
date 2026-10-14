import { useRef, useState } from 'react'
import type { FloatWindowSettings, PublicSettings } from '@shared/api'
import type { SettingsActions } from './useSettings'

type FloatKey = keyof FloatWindowSettings

const DEFAULT_FLOAT: FloatWindowSettings = { open: false, alwaysOnTop: true, locked: false }

export type FloatToggle = {
  /** 界面上显示的状态：已保存的值，加上还没保存完的点击。 */
  state: FloatWindowSettings
  toggle: (key: FloatKey) => void
  error: string | null
}

/**
 * 悬浮窗的开关 / 置顶 / 固定。每次点击都在「最后一次点击想要的值」上取反，
 * 保存结果还没回来时连点两下等于没切换，而不是两次都按旧值算。
 */
export function useFloatToggle(settings: PublicSettings | null, save: SettingsActions['save']): FloatToggle {
  const intended = useRef<Partial<FloatWindowSettings>>({})
  const [, rerender] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const saved = settings?.floatWindow ?? DEFAULT_FLOAT
  const state = { ...saved, ...intended.current }

  function toggle(key: FloatKey): void {
    const value = !{ ...(settings?.floatWindow ?? DEFAULT_FLOAT), ...intended.current }[key]
    intended.current = { ...intended.current, [key]: value }
    rerender((count) => count + 1)
    void save({ floatWindow: { [key]: value } }).then((result) => {
      setError(result.ok ? null : result.error.message)
      // 只清掉这次点击留下的意图；之后又点过就留着后来的。
      if (intended.current[key] === value) {
        const rest = { ...intended.current }
        delete rest[key]
        intended.current = rest
        rerender((count) => count + 1)
      }
    })
  }

  return { state, toggle, error }
}
