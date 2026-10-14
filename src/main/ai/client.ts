import { net } from 'electron'
import type { Result } from '@shared/api'
import { fail, ok } from '@shared/result'
import { isHttpUrl, isRecord } from '@shared/validate'
import { checkSandboxUrl } from '../sandbox'
import { TEST_MESSAGES } from './prompts'
import type { SettingsStore } from '../store/settingsStore'

export type ChatMessage = { role: 'system' | 'user'; content: string }
export type SummaryKind = 'summarize' | 'auto-summary'
export type RequestKind = 'parse' | SummaryKind
export type Tracking = { kind: RequestKind; requestId: string }
export type TestDraft = { baseUrl: string; model: string; apiKey?: string }

type ChatConfig = { baseUrl: string; model: string; apiKey: string }
type ChatRequestBody = { model: string; messages: ChatMessage[]; temperature: number }
type AbortReason = 'cancelled' | 'timeout'
type Attempt = { controller: AbortController; reason: AbortReason | null }
type FetchResponse = Awaited<ReturnType<typeof net.fetch>>

const CHAT_TIMEOUT_MS = 30_000
const TEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const TEMPERATURE = 0.2
const NOT_CONFIGURED_MESSAGE = '还没配置 AI 服务'
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'
const REDIRECT_MESSAGE = 'AI 服务地址发生了跳转，请填写最终地址'
const NOT_OPENAI_COMPATIBLE_MESSAGE = '这个地址不像 OpenAI 兼容的 AI 服务'

const tracked = new Map<string, { kind: RequestKind; attempt: Attempt }>()

// 去掉结尾的 / 和完整的 /chat/completions，得到 OpenAI 兼容的基础地址。
function normalizeBaseUrl(raw: string): Result<string> {
  const trimmed = raw.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '').replace(/\/+$/, '')
  if (!isHttpUrl(trimmed)) return fail('INVALID_INPUT', 'AI 服务地址需要是有效的 http 或 https 地址')
  return ok(trimmed)
}

function makeConfig(baseUrl: string, model: string, apiKey: string): Result<ChatConfig> {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized.ok) return normalized
  return ok({ baseUrl: normalized.data, model, apiKey })
}

function loadChatConfig(settings: SettingsStore): Result<ChatConfig> {
  const saved = settings.toPublic().ai
  const apiKey = settings.readApiKey()
  if (saved.baseUrl === '' || saved.model === '' || apiKey === null) {
    return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE)
  }
  return makeConfig(saved.baseUrl, saved.model, apiKey)
}

function originOf(baseUrl: string): string | null {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized.ok) return null
  return new URL(normalized.data).origin
}

// 没填新 Key 时沿用已保存的 Key，但只发给已保存地址的同一个站点：
// 换了服务商、填了新地址却忘了填新 Key，不能把旧服务商的 Key 发给新地址。
function resolveTestConfig(settings: SettingsStore, draft: TestDraft | undefined): Result<ChatConfig> {
  if (draft === undefined) return loadChatConfig(settings)
  if (draft.apiKey !== undefined) return makeConfig(draft.baseUrl, draft.model, draft.apiKey)
  const savedKey = settings.readApiKey()
  if (savedKey === null) return fail('NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE)
  const draftOrigin = originOf(draft.baseUrl)
  if (draftOrigin === null) return fail('INVALID_INPUT', 'AI 服务地址需要是有效的 http 或 https 地址')
  if (draftOrigin !== originOf(settings.toPublic().ai.baseUrl)) {
    return fail('NOT_CONFIGURED', '地址和已保存的不是同一个服务，请先填写这个服务的 API Key 再测试')
  }
  return makeConfig(draft.baseUrl, draft.model, savedKey)
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
    if (entry.kind === tracking.kind || requestId === tracking.requestId) {
      abortAttempt(entry.attempt, 'cancelled')
    }
  }
  tracked.set(tracking.requestId, { kind: tracking.kind, attempt })
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
  return fail('BAD_RESPONSE', `AI 服务返回了 ${status}，请检查地址和模型名称`)
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

async function postChat(
  config: ChatConfig,
  body: ChatRequestBody,
  timeoutMs: number,
  tracking: Tracking | null
): Promise<Result<string>> {
  const endpoint = `${config.baseUrl}/chat/completions`
  const allowed = checkSandboxUrl(endpoint)
  if (!allowed.ok) return allowed

  const attempt: Attempt = { controller: new AbortController(), reason: null }
  const timer = setTimeout(() => abortAttempt(attempt, 'timeout'), timeoutMs)
  if (tracking !== null) startTracking(tracking, attempt)
  try {
    const response = await net.fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
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

function readAssistantContent(body: string): Result<string> {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  }
  if (!isRecord(data) || !Array.isArray(data.choices)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const choices: unknown[] = data.choices
  const first: unknown = choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  const content: unknown = first.message.content
  if (typeof content !== 'string') return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
  return ok(content)
}

export async function completeChat(
  settings: SettingsStore,
  tracking: Tracking,
  messages: ChatMessage[]
): Promise<Result<string>> {
  const config = loadChatConfig(settings)
  if (!config.ok) return config
  const body: ChatRequestBody = { model: config.data.model, messages, temperature: TEMPERATURE }
  const reply = await postChat(config.data, body, CHAT_TIMEOUT_MS, tracking)
  if (!reply.ok) return reply
  return readAssistantContent(reply.data)
}

export async function testAiConnection(
  settings: SettingsStore,
  draft: TestDraft | undefined
): Promise<Result<{ model: string }>> {
  const config = resolveTestConfig(settings, draft)
  if (!config.ok) return config
  const body: ChatRequestBody = {
    model: config.data.model,
    messages: TEST_MESSAGES,
    temperature: TEMPERATURE
  }
  const reply = await postChat(config.data, body, TEST_TIMEOUT_MS, null)
  if (!reply.ok) return reply
  const content = readAssistantContent(reply.data)
  if (!content.ok) return fail('BAD_RESPONSE', NOT_OPENAI_COMPATIBLE_MESSAGE)
  return ok({ model: config.data.model })
}

export function cancelAiRequest(requestId: string): Result<null> {
  const entry = tracked.get(requestId)
  if (entry !== undefined) abortAttempt(entry.attempt, 'cancelled')
  return ok(null)
}
