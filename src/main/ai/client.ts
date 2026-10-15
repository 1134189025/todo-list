import { net } from 'electron'
import type { AiApiFormat, Result } from '@shared/api'
import { fail, ok } from '@shared/result'
import type { TestDraft } from '@shared/validate'
import { checkSandboxUrl } from '../sandbox'
import type { SettingsStore } from '../store/settingsStore'
import { TEST_MESSAGES } from './prompts'
import {
  buildRequest,
  normalizeBaseUrl,
  readReplyText,
  type ChatMessage,
  type ProviderConfig
} from './providers'

export type SummaryKind = 'summarize' | 'auto-summary'
export type RequestKind = 'command' | SummaryKind
// owner 是发起请求的窗口（webContents.id）；主进程自己发起的（如自动总结）没有窗口，填 null。
// 「新的取消旧的」只在同一个窗口、同一类请求之间生效，不同窗口的请求互不影响。
export type Tracking = { kind: RequestKind; requestId: string; owner: number | null }

type AbortReason = 'cancelled' | 'timeout'
type Attempt = { controller: AbortController; reason: AbortReason | null }
type FetchResponse = Awaited<ReturnType<typeof net.fetch>>

const CHAT_TIMEOUT_MS = 30_000
// 带录音的请求上传更大、模型要先听写，给长一点。
const AUDIO_TIMEOUT_MS = 60_000
const TEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const NOT_CONFIGURED_MESSAGE = '还没配置 AI 服务'
const REDIRECT_MESSAGE = 'AI 服务地址发生了跳转，请填写最终地址'
const WRONG_FORMAT_MESSAGE: Record<AiApiFormat, string> = {
  openai: '这个地址不像 OpenAI 兼容的 AI 服务',
  gemini: '这个地址不像 Gemini 原生接口'
}

const tracked = new Map<string, { kind: RequestKind; owner: number | null; attempt: Attempt }>()

function makeConfig(apiFormat: AiApiFormat, baseUrl: string, model: string, apiKey: string): Result<ProviderConfig> {
  const normalized = normalizeBaseUrl(baseUrl, apiFormat)
  if (!normalized.ok) return normalized
  return ok({ apiFormat, baseUrl: normalized.data, model, apiKey })
}

function loadChatConfig(settings: SettingsStore): Result<ProviderConfig> {
  const saved = settings.toPublic().ai
  const apiKey = settings.readApiKey()
  if (saved.baseUrl === '' || saved.model === '' || apiKey === null) {
    return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE)
  }
  return makeConfig(saved.apiFormat, saved.baseUrl, saved.model, apiKey)
}

function originOf(baseUrl: string, apiFormat: AiApiFormat): string | null {
  const normalized = normalizeBaseUrl(baseUrl, apiFormat)
  if (!normalized.ok) return null
  return new URL(normalized.data).origin
}

// 没填新 Key 时沿用已保存的 Key，但只发给已保存地址的同一个站点：
// 换了服务商、填了新地址却忘了填新 Key，不能把旧服务商的 Key 发给新地址。
function resolveTestConfig(settings: SettingsStore, draft: TestDraft | undefined): Result<ProviderConfig> {
  if (draft === undefined) return loadChatConfig(settings)
  const saved = settings.toPublic().ai
  const apiFormat = draft.apiFormat ?? saved.apiFormat
  if (draft.apiKey !== undefined) return makeConfig(apiFormat, draft.baseUrl, draft.model, draft.apiKey)
  const savedKey = settings.readApiKey()
  if (savedKey === null) return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE)
  const draftOrigin = originOf(draft.baseUrl, apiFormat)
  if (draftOrigin === null) return fail('INVALID_INPUT', 'AI 服务地址需要是有效的 http 或 https 地址')
  if (draftOrigin !== originOf(saved.baseUrl, saved.apiFormat)) {
    return fail('NOT_CONFIGURED', '地址和已保存的不是同一个服务，请先填写这个服务的 API Key 再测试')
  }
  return makeConfig(apiFormat, draft.baseUrl, draft.model, savedKey)
}

export function isAiConfigured(settings: SettingsStore): boolean {
  return loadChatConfig(settings).ok
}

function abortAttempt(attempt: Attempt, reason: AbortReason): void {
  if (attempt.reason === null) attempt.reason = reason
  attempt.controller.abort()
}

function startTracking(tracking: Tracking, attempt: Attempt): void {
  for (const [requestId, entry] of tracked) {
    const sameKindInSameWindow = entry.kind === tracking.kind && entry.owner === tracking.owner
    if (sameKindInSameWindow || requestId === tracking.requestId) {
      abortAttempt(entry.attempt, 'cancelled')
    }
  }
  tracked.set(tracking.requestId, { kind: tracking.kind, owner: tracking.owner, attempt })
}

function stopTracking(tracking: Tracking, attempt: Attempt): void {
  if (tracked.get(tracking.requestId)?.attempt === attempt) tracked.delete(tracking.requestId)
}

function abortFailure(attempt: Attempt): Result<never> {
  if (attempt.reason === 'cancelled') return fail('CANCELLED', '已取消')
  if (attempt.reason === 'timeout') return fail('TIMEOUT', 'AI 响应超时，请稍后再试')
  return fail('NETWORK', '连不上 AI 服务，请检查网络和地址')
}

function statusFailure(status: number): Result<never> {
  if (status === 401 || status === 403) return fail('AUTH', 'API Key 不对或没有权限')
  if (status === 429) return fail('RATE_LIMIT', '请求太频繁，稍后再试')
  if (status >= 500) return fail('SERVER', 'AI 服务出错，稍后再试')
  return fail('BAD_RESPONSE', `AI 服务返回了 ${status}，请检查地址、模型名称和接口格式`)
}

// 兜底：正常情况下 redirect: 'error' 会在 fetch 阶段抛错（见 isRedirectError）。net.fetch 的 type 和 url 不可靠，这里只看 redirected 和 status。
function isRedirect(response: FetchResponse): boolean {
  return response.redirected || response.status === 0 || (response.status >= 300 && response.status < 400)
}

function isRedirectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('message' in error)) return false
  const message = error.message
  return typeof message === 'string' && /redirect/i.test(message)
}

function discardBody(response: FetchResponse): void {
  void response.body?.cancel().catch(() => undefined)
}

async function readLimitedText(response: FetchResponse): Promise<Result<string>> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ok('')
  const chunks: Uint8Array[] = []
  let total = 0
  let next = await reader.read()
  while (!next.done) {
    total += next.value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      return fail('BAD_RESPONSE', 'AI 返回的内容太大')
    }
    chunks.push(next.value)
    next = await reader.read()
  }
  return ok(Buffer.concat(chunks).toString('utf8'))
}

/** 发出请求，返回回复的原始 JSON 文本。 */
async function postChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  timeoutMs: number,
  tracking: Tracking | null
): Promise<Result<string>> {
  const request = buildRequest(config, messages)
  if (!request.ok) return request
  const { endpoint, headers, body } = request.data
  const allowed = checkSandboxUrl(endpoint)
  if (!allowed.ok) return allowed

  const attempt: Attempt = { controller: new AbortController(), reason: null }
  const timer = setTimeout(() => abortAttempt(attempt, 'timeout'), timeoutMs)
  if (tracking !== null) startTracking(tracking, attempt)
  try {
    const response = await net.fetch(endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      credentials: 'omit',
      signal: attempt.controller.signal
    })
    if (isRedirect(response)) {
      discardBody(response)
      return fail('BAD_RESPONSE', REDIRECT_MESSAGE)
    }
    if (!response.ok) {
      discardBody(response)
      return statusFailure(response.status)
    }
    const text = await readLimitedText(response)
    if (attempt.reason !== null) return abortFailure(attempt)
    return text
  } catch (error) {
    // 超时和取消优先；Electron 44 在 redirect: 'error' 下抛出含 "redirect" 的错误，据此识别跳转。
    if (attempt.reason === null && isRedirectError(error)) return fail('BAD_RESPONSE', REDIRECT_MESSAGE)
    return abortFailure(attempt)
  } finally {
    clearTimeout(timer)
    if (tracking !== null) stopTracking(tracking, attempt)
  }
}

export async function completeChat(
  settings: SettingsStore,
  tracking: Tracking,
  messages: ChatMessage[]
): Promise<Result<string>> {
  const config = loadChatConfig(settings)
  if (!config.ok) return config
  const hasAudio = messages.some((message) => message.audio !== undefined)
  const reply = await postChat(config.data, messages, hasAudio ? AUDIO_TIMEOUT_MS : CHAT_TIMEOUT_MS, tracking)
  if (!reply.ok) return reply
  return readReplyText(config.data.apiFormat, reply.data)
}

export async function testAiConnection(
  settings: SettingsStore,
  draft: TestDraft | undefined
): Promise<Result<{ model: string }>> {
  const config = resolveTestConfig(settings, draft)
  if (!config.ok) return config
  const reply = await postChat(config.data, TEST_MESSAGES, TEST_TIMEOUT_MS, null)
  if (!reply.ok) return reply
  const content = readReplyText(config.data.apiFormat, reply.data)
  if (!content.ok) return fail('BAD_RESPONSE', WRONG_FORMAT_MESSAGE[config.data.apiFormat])
  return ok({ model: config.data.model })
}

export function cancelAiRequest(requestId: string): Result<null> {
  const entry = tracked.get(requestId)
  if (entry !== undefined) abortAttempt(entry.attempt, 'cancelled')
  return ok(null)
}
