import type { PublicSettings } from '@shared/api'
import { isHttpUrl } from '@shared/validate'

const URL_MAX = 2048
const MODEL_MAX = 100

export type AiDraft = { baseUrl: string; model: string }

export type AiDraftCheck = { ok: true; value: AiDraft } | { ok: false; message: string }

export function checkAiDraft(baseUrl: string, model: string): AiDraftCheck {
  const url = baseUrl.trim()
  if (url === '' || url.length > URL_MAX || !isHttpUrl(url)) {
    return { ok: false, message: 'AI 服务地址需要是有效的 http 或 https 地址' }
  }
  const name = model.trim()
  if (name === '') return { ok: false, message: '模型名称不能为空' }
  if (name.length > MODEL_MAX) return { ok: false, message: `模型名称不能超过 ${MODEL_MAX} 个字` }
  return { ok: true, value: { baseUrl: url, model: name } }
}

export function isAiConfigured(settings: PublicSettings | null): boolean {
  if (settings === null) return false
  return settings.ai.baseUrl !== '' && settings.ai.model !== '' && settings.ai.hasApiKey
}
