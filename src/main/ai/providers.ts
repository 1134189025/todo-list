import type { AiApiFormat, Result, VoiceClip } from '@shared/api'
import { fail, ok } from '@shared/result'
import { isHttpUrl, isRecord } from '@shared/validate'

// 两种接口格式各自的地址、请求头、请求体和回复解析；发请求、超时、取消在 client.ts。

export type ChatMessage = { role: 'system' | 'user'; content: string; audio?: VoiceClip }

export type ProviderConfig = { apiFormat: AiApiFormat; baseUrl: string; model: string; apiKey: string }

export type ProviderRequest = { endpoint: string; headers: Record<string, string>; body: string }

const TEMPERATURE = 0.2
// Gemini 3 系列的思考档位；Sub2API 会据此把 gemini-3.x-flash 映射到 -low 变体。没写时默认是 high，慢得多。
const GEMINI_THINKING_LEVEL = 'low'
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'
const INVALID_URL_MESSAGE = 'AI 服务地址需要是有效的 http 或 https 地址'
export const AUDIO_NEEDS_GEMINI_MESSAGE = '语音需要 Gemini 原生接口：请在「设置 → AI 服务」把接口格式改成 Gemini 原生'

/**
 * 得到基础地址：去掉结尾的 /，以及用户可能一起粘贴进来的固定后缀
 * （OpenAI：/chat/completions；Gemini：/v1beta、/v1beta/models/…）。
 */
export function normalizeBaseUrl(raw: string, apiFormat: AiApiFormat): Result<string> {
  const suffix = apiFormat === 'openai' ? /\/chat\/completions$/ : /\/v1beta(\/models(\/[^/]*)?)?$/
  const trimmed = raw.trim().replace(/\/+$/, '').replace(suffix, '').replace(/\/+$/, '')
  if (!isHttpUrl(trimmed)) return fail('INVALID_INPUT', INVALID_URL_MESSAGE)
  return ok(trimmed)
}

function openAiRequest(config: ProviderConfig, messages: ChatMessage[]): Result<ProviderRequest> {
  if (messages.some((message) => message.audio !== undefined)) return fail('INVALID_INPUT', AUDIO_NEEDS_GEMINI_MESSAGE)
  return ok({
    endpoint: `${config.baseUrl}/chat/completions`,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      temperature: TEMPERATURE
    })
  })
}

function geminiRequest(config: ProviderConfig, messages: ChatMessage[]): ProviderRequest {
  const system = messages.filter((message) => message.role === 'system').map((message) => ({ text: message.content }))
  const contents = messages
    .filter((message) => message.role === 'user')
    .map((message) => ({
      role: 'user',
      parts: [
        { text: message.content },
        ...(message.audio === undefined
          ? []
          : [{ inlineData: { mimeType: message.audio.mimeType, data: message.audio.data } }])
      ]
    }))
  return {
    endpoint: `${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
    headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system.length === 0 ? {} : { systemInstruction: { parts: system } }),
      contents,
      generationConfig: { temperature: TEMPERATURE, thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } }
    })
  }
}

export function buildRequest(config: ProviderConfig, messages: ChatMessage[]): Result<ProviderRequest> {
  return config.apiFormat === 'openai' ? openAiRequest(config, messages) : ok(geminiRequest(config, messages))
}

function readOpenAiText(data: unknown): Result<string> {
  if (!isRecord(data) || !Array.isArray(data.choices)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const choices: unknown[] = data.choices
  const first: unknown = choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const content: unknown = first.message.content
  if (typeof content !== 'string') return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  return ok(content)
}

// 只取正文部分，跳过思考过程（thought: true）。
function readGeminiText(data: unknown): Result<string> {
  if (!isRecord(data)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const candidates: unknown = data.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const blocked = isRecord(data.promptFeedback) && typeof data.promptFeedback.blockReason === 'string'
    return fail('BAD_RESPONSE', blocked ? 'AI 拒绝处理这次的内容' : BAD_REPLY_MESSAGE)
  }
  const first: unknown = candidates[0]
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  }
  const parts: unknown[] = first.content.parts
  const texts = parts.flatMap((part) =>
    isRecord(part) && part.thought !== true && typeof part.text === 'string' ? [part.text] : []
  )
  if (texts.length === 0) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  return ok(texts.join(''))
}

/** 从回复的原始 JSON 文本里取出 AI 写的正文。 */
export function readReplyText(apiFormat: AiApiFormat, body: string): Result<string> {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  }
  return apiFormat === 'openai' ? readOpenAiText(data) : readGeminiText(data)
}
