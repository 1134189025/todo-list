import type { AiApiFormat, Result, VoiceClip } from '@shared/api'
import { fail, ok } from '@shared/result'
import { isHttpUrl, isRecord } from '@shared/validate'
import type { RequestSchema } from './schemas'

// 两种接口格式各自的地址、请求头、请求体和回复解析；发请求、超时、取消在 client.ts。

export type ChatMessage = { role: 'system' | 'user'; content: string; audio?: VoiceClip }

export type ProviderConfig = { apiFormat: AiApiFormat; baseUrl: string; model: string; apiKey: string }

export type ProviderRequest = { endpoint: string; headers: Record<string, string>; body: string }

const TEMPERATURE = 0.2
// Gemini 3 系列的思考档位；Sub2API 会据此把 gemini-3.x-flash 映射到 -low 变体。没写时默认是 high，慢得多。
const GEMINI_THINKING_LEVEL = 'low'
// JSON 模式：模型只输出合法 JSON（字符串里的引号、换行都会转义）。Sub2API 会在系统提示词前插一段
// 「你是 Antigravity 编程助手」的身份说明，偶尔把模型带偏成写解释文字，JSON 模式能挡住这种情况。
const GEMINI_RESPONSE_MIME = 'application/json'
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

function openAiRequest(
  config: ProviderConfig,
  messages: ChatMessage[],
  schema?: RequestSchema
): Result<ProviderRequest> {
  if (messages.some((message) => message.audio !== undefined)) return fail('INVALID_INPUT', AUDIO_NEEDS_GEMINI_MESSAGE)
  return ok({
    endpoint: `${config.baseUrl}/chat/completions`,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      temperature: TEMPERATURE,
      // 有结构约束时附上 response_format；没有时请求体和以前逐字节一致。
      ...(schema === undefined ? {} : { response_format: schema.openai })
    })
  })
}

function geminiRequest(config: ProviderConfig, messages: ChatMessage[], schema?: RequestSchema): ProviderRequest {
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
      generationConfig: {
        temperature: TEMPERATURE,
        responseMimeType: GEMINI_RESPONSE_MIME,
        // 有结构约束时附上 responseSchema；没有时请求体和以前逐字节一致。
        ...(schema === undefined ? {} : { responseSchema: schema.gemini }),
        thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL }
      }
    })
  }
}

/** schema 不传时请求体和不带结构约束时完全一样，见 openAiRequest / geminiRequest。 */
export function buildRequest(
  config: ProviderConfig,
  messages: ChatMessage[],
  schema?: RequestSchema
): Result<ProviderRequest> {
  return config.apiFormat === 'openai'
    ? openAiRequest(config, messages, schema)
    : ok(geminiRequest(config, messages, schema))
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

// 没有正文时说清楚原因（finishReason），出错卡片上能看到，偶发问题好排查。
function emptyReplyMessage(finishReason: unknown): string {
  switch (finishReason) {
    case 'MAX_TOKENS':
      return 'AI 的回复太长被截断了，换一句短点的再试'
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
      return 'AI 拒绝处理这次的内容'
    case 'RECITATION':
      return 'AI 这次没给出回复（RECITATION），再试一次'
    default:
      return typeof finishReason === 'string' && finishReason !== '' && finishReason !== 'STOP'
        ? `AI 这次没给出回复（${finishReason}），再试一次`
        : 'AI 这次返回了空内容，再试一次'
  }
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
  if (!isRecord(first)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const parts: unknown[] = isRecord(first.content) && Array.isArray(first.content.parts) ? first.content.parts : []
  const texts = parts.flatMap((part) =>
    isRecord(part) && part.thought !== true && typeof part.text === 'string' ? [part.text] : []
  )
  if (texts.join('').trim() === '') return fail('BAD_RESPONSE', emptyReplyMessage(first.finishReason))
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
