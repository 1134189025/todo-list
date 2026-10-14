import { useState } from 'react'
import type { SettingsActions } from '../state/useSettings'
import { SettingRow } from './SettingRow'
import { Switch } from './Switch'

type OpenAtLoginRowProps = {
  checked: boolean
  save: SettingsActions['save']
}

export function OpenAtLoginRow({ checked, save }: OpenAtLoginRowProps) {
  const [error, setError] = useState<string | null>(null)

  async function toggle(next: boolean): Promise<void> {
    const result = await save({ openAtLogin: next })
    setError(result.ok ? null : result.error.message)
  }

  return (
    <SettingRow
      title="开机自动打开"
      description="开机后自动打开清新待办"
      control={<Switch checked={checked} label="开机自动打开" onChange={(next) => void toggle(next)} />}
      footer={error === null ? undefined : <p className="settings-feedback is-error">{error}</p>}
    />
  )
}
