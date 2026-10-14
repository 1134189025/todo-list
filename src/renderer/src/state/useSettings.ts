import { useCallback, useEffect, useState } from 'react'
import type { PublicSettings, Result, SettingsPatch } from '@shared/api'
import { callApi } from '../lib/callApi'

export type SettingsActions = {
  save: (patch: SettingsPatch) => Promise<Result<PublicSettings>>
  setApiKey: (key: string) => Promise<Result<PublicSettings>>
  clearApiKey: () => Promise<Result<PublicSettings>>
}

export type SettingsController = SettingsActions & {
  settings: PublicSettings | null
  loadError: string | null
}

export function useSettings(): SettingsController {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void callApi(() => window.api.settings.get()).then((result) => {
      if (cancelled) return
      if (result.ok) setSettings(result.data)
      else setLoadError(result.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const run = useCallback(async (operation: () => Promise<Result<PublicSettings>>) => {
    const result = await callApi(operation)
    if (result.ok) setSettings(result.data)
    return result
  }, [])

  const save = useCallback((patch: SettingsPatch) => run(() => window.api.settings.save(patch)), [run])
  const setApiKey = useCallback((key: string) => run(() => window.api.settings.setApiKey(key)), [run])
  const clearApiKey = useCallback(() => run(() => window.api.settings.clearApiKey()), [run])

  return { settings, loadError, save, setApiKey, clearApiKey }
}
