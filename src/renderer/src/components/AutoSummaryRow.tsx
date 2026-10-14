import { useEffect, useState } from 'react'
import type { PublicSettings } from '@shared/api'
import { isTimeKey } from '@shared/dates'
import type { SettingsActions } from '../state/useSettings'
import { SettingRow } from './SettingRow'
import { Switch } from './Switch'
import './AutoSummaryRow.css'

type AutoSummaryRowProps = {
  autoSummary: PublicSettings['autoSummary']
  save: SettingsActions['save']
}

export function AutoSummaryRow({ autoSummary, save }: AutoSummaryRowProps) {
  const [timeText, setTimeText] = useState(autoSummary.time)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTimeText(autoSummary.time)
  }, [autoSummary.time])

  async function update(next: PublicSettings['autoSummary']): Promise<void> {
    const result = await save({ autoSummary: next })
    if (result.ok) {
      setError(null)
      return
    }
    setError(result.error.message)
    setTimeText(autoSummary.time)
  }

  return (
    <SettingRow
      title="每晚自动总结"
      description={autoSummary.enabled ? `${autoSummary.time} 弹出今日总结` : '已关闭'}
      control={
        <>
          <input
            type="time"
            className="auto-summary-time"
            aria-label="自动总结时间"
            value={timeText}
            disabled={!autoSummary.enabled}
            onChange={(event) => {
              const value = event.target.value
              setTimeText(value)
              if (isTimeKey(value) && value !== autoSummary.time) {
                void update({ enabled: autoSummary.enabled, time: value })
              }
            }}
          />
          <Switch
            checked={autoSummary.enabled}
            label="每晚自动总结"
            onChange={(enabled) => void update({ enabled, time: autoSummary.time })}
          />
        </>
      }
      footer={error === null ? undefined : <p className="settings-feedback is-error">{error}</p>}
    />
  )
}
