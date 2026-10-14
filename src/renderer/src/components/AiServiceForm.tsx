import { useState } from 'react'
import type { PublicSettings } from '@shared/api'
import { callApi } from '../lib/callApi'
import { checkAiDraft } from '../lib/aiForm'
import type { SettingsActions } from '../state/useSettings'
import './AiServiceForm.css'

type Feedback = { tone: 'ok' | 'error'; text: string } | null

type AiServiceFormProps = {
  ai: PublicSettings['ai']
  encryptionAvailable: boolean
  actions: SettingsActions
}

export function AiServiceForm({ ai, encryptionAvailable, actions }: AiServiceFormProps) {
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl)
  const [model, setModel] = useState(ai.model)
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<Feedback>(null)
  const [testFeedback, setTestFeedback] = useState<Feedback>(null)

  async function handleSave(): Promise<void> {
    const draft = checkAiDraft(baseUrl, model)
    if (!draft.ok) {
      setSaveFeedback({ tone: 'error', text: draft.message })
      return
    }
    const key = apiKey.trim()
    setBusy(true)
    const saved = await actions.save({ ai: draft.value })
    let feedback: Feedback = saved.ok ? { tone: 'ok', text: '已保存' } : { tone: 'error', text: saved.error.message }
    if (saved.ok && key !== '') {
      const keyed = await actions.setApiKey(key)
      if (keyed.ok) setApiKey('')
      else feedback = { tone: 'error', text: keyed.error.message }
    }
    setBusy(false)
    setSaveFeedback(feedback)
  }

  async function handleTest(): Promise<void> {
    const draft = checkAiDraft(baseUrl, model)
    if (!draft.ok) {
      setTestFeedback({ tone: 'error', text: draft.message })
      return
    }
    const key = apiKey.trim()
    setBusy(true)
    const result = await callApi(() =>
      window.api.ai.testConnection(key === '' ? draft.value : { ...draft.value, apiKey: key })
    )
    setBusy(false)
    setTestFeedback(
      result.ok
        ? { tone: 'ok', text: `连接成功（模型：${result.data.model}）` }
        : { tone: 'error', text: result.error.message }
    )
  }

  async function handleClearKey(): Promise<void> {
    setBusy(true)
    const result = await actions.clearApiKey()
    setBusy(false)
    setSaveFeedback(result.ok ? { tone: 'ok', text: '已清除 Key' } : { tone: 'error', text: result.error.message })
  }

  return (
    <div className="ai-form">
      <div className="ai-form-field">
        <label htmlFor="ai-base-url" className="ai-form-label">
          地址
        </label>
        <input
          id="ai-base-url"
          className="settings-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://api.example.com/v1"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </div>
      <div className="ai-form-field">
        <label htmlFor="ai-model" className="ai-form-label">
          模型
        </label>
        <input
          id="ai-model"
          className="settings-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="例如 gpt-4o-mini"
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
      </div>
      <div className="ai-form-field">
        <label htmlFor="ai-api-key" className="ai-form-label">
          API Key
        </label>
        <input
          id="ai-api-key"
          className="settings-input"
          type="password"
          autoComplete="off"
          placeholder={ai.hasApiKey ? '输入新的 Key 才会替换' : '粘贴 API Key'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <div className="ai-form-key-row">
          <span className="ai-form-hint">{ai.hasApiKey ? '已保存，留空表示不修改' : '还没有保存 Key'}</span>
          {ai.hasApiKey && (
            <button type="button" className="settings-button" disabled={busy} onClick={() => void handleClearKey()}>
              清除
            </button>
          )}
        </div>
        {!encryptionAvailable && (
          <p className="settings-feedback is-error">当前系统无法加密保存 Key，暂时不能保存 Key</p>
        )}
      </div>
      <div className="ai-form-actions">
        <button
          type="button"
          className="settings-button is-primary"
          disabled={busy}
          onClick={() => void handleSave()}
        >
          保存
        </button>
        <button type="button" className="settings-button" disabled={busy} onClick={() => void handleTest()}>
          测试连接
        </button>
      </div>
      {saveFeedback !== null && <p className={`settings-feedback is-${saveFeedback.tone}`} role="status">{saveFeedback.text}</p>}
      {testFeedback !== null && <p className={`settings-feedback is-${testFeedback.tone}`} role="status">{testFeedback.text}</p>}
    </div>
  )
}
