import { FLOAT_OPACITY_MIN, PILL_SIZE_LIMITS, type AiApiFormat, type CommandInput, type FloatWindowSettings, type PillSize, type SettingsPatch, type VoiceClip } from './api'
import { TASK_FIELDS, type TaskFields, type TaskPatch } from './taskPatch'
import { isDateKey, isIsoTimestamp, isTimeKey } from './dates'
import { TITLE_MAX } from './text'
import type { Task, TaskSource } from './types'

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string }

const ID_MAX = 100
const REQUEST_ID_MAX = 100
const PARSE_TEXT_MAX = 500
const MODEL_MAX = 100
const URL_MAX = 2048
const API_KEY_MAX = 500

function invalid<T>(message: string): Validation<T> {
  return { ok: false, message }
}

function valid<T>(value: T): Validation<T> {
  return { ok: true, value }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) return null
  return trimmed
}

export function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateBaseUrl(value: unknown): Validation<string> {
  const text = boundedText(value, 1, URL_MAX)
  if (text === null || !isHttpUrl(text)) return invalid('AI 服务地址需要是有效的 http 或 https 地址')
  return valid(text)
}

function validateModel(value: unknown): Validation<string> {
  const model = boundedText(value, 1, MODEL_MAX)
  if (model === null) return invalid('模型名称不能为空')
  return valid(model)
}

function validateTaskSource(value: unknown): TaskSource | null {
  return value === 'manual' || value === 'ai' ? value : null
}

function nullableMatching(value: unknown, check: (text: string) => boolean): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && check(value)) return value
  return undefined
}

function matching(value: unknown, check: (text: string) => boolean): string | undefined {
  if (typeof value === 'string' && check(value)) return value
  return undefined
}

export function validateTask(value: unknown): Validation<Task> {
  if (!isRecord(value)) return invalid('任务格式不正确')
  const id = boundedText(value.id, 1, ID_MAX)
  if (id === null) return invalid('任务 id 不合法')
  const title = boundedText(value.title, 1, TITLE_MAX)
  if (title === null) return invalid('任务标题需要 1–200 个字符')
  const done = value.done
  if (typeof done !== 'boolean') return invalid('任务完成状态不合法')
  const dueDate = nullableMatching(value.dueDate, isDateKey)
  if (dueDate === undefined) return invalid('任务日期不合法')
  const dueTime = nullableMatching(value.dueTime, isTimeKey)
  if (dueTime === undefined) return invalid('任务时间不合法')
  if (dueTime !== null && dueDate === null) return invalid('没有日期的任务不能有时间')
  const createdAt = matching(value.createdAt, isIsoTimestamp)
  if (createdAt === undefined) return invalid('任务创建时间不合法')
  const completedAt = nullableMatching(value.completedAt, isIsoTimestamp)
  if (completedAt === undefined) return invalid('任务完成时间不合法')
  const source = validateTaskSource(value.source)
  if (source === null) return invalid('任务来源不合法')
  return valid({ id, title, done, dueDate, dueTime, createdAt, completedAt, source })
}

const PATCH_MAX = 5000

// 改动里的单个字段：类型和格式先在这里查，合并后的整条任务主进程再用 validateTask 查一遍。
const FIELD_CHECKS: Record<(typeof TASK_FIELDS)[number], (value: unknown) => boolean> = {
  title: (value) => boundedText(value, 1, TITLE_MAX) !== null,
  done: (value) => typeof value === 'boolean',
  dueDate: (value) => nullableMatching(value, isDateKey) !== undefined,
  dueTime: (value) => nullableMatching(value, isTimeKey) !== undefined,
  createdAt: (value) => matching(value, isIsoTimestamp) !== undefined,
  completedAt: (value) => nullableMatching(value, isIsoTimestamp) !== undefined,
  source: (value) => validateTaskSource(value) !== null
}

function validateTaskUpdate(value: unknown): Validation<{ id: string; fields: TaskFields }> {
  if (!isRecord(value) || !isRecord(value.fields)) return invalid('任务改动格式不正确')
  const id = boundedText(value.id, 1, ID_MAX)
  if (id === null) return invalid('任务 id 不合法')
  const fields: TaskFields = {}
  for (const [key, field] of Object.entries(value.fields)) {
    const known = TASK_FIELDS.find((name) => name === key)
    if (known === undefined || !FIELD_CHECKS[known](field)) return invalid('任务改动格式不正确')
    Object.assign(fields, { [known]: known === 'title' ? boundedText(field, 1, TITLE_MAX) : field })
  }
  return valid({ id, fields })
}

export function validateTaskPatch(value: unknown): Validation<TaskPatch> {
  if (!isRecord(value)) return invalid('任务改动格式不正确')
  const { added, updated, removedIds } = value
  if (!Array.isArray(added) || !Array.isArray(updated) || !Array.isArray(removedIds)) {
    return invalid('任务改动格式不正确')
  }
  if (added.length + updated.length + removedIds.length > PATCH_MAX) return invalid('一次改动的任务太多')
  const patch: TaskPatch = { added: [], updated: [], removedIds: [] }
  for (const entry of added as unknown[]) {
    if (!isRecord(entry) || typeof entry.index !== 'number' || !Number.isInteger(entry.index) || entry.index < 0) {
      return invalid('新加任务的位置不合法')
    }
    const task = validateTask(entry.task)
    if (!task.ok) return invalid(task.message)
    patch.added.push({ task: task.value, index: entry.index })
  }
  for (const entry of updated as unknown[]) {
    const update = validateTaskUpdate(entry)
    if (!update.ok) return invalid(update.message)
    patch.updated.push(update.value)
  }
  for (const entry of removedIds as unknown[]) {
    const id = boundedText(entry, 1, ID_MAX)
    if (id === null) return invalid('任务 id 不合法')
    patch.removedIds.push(id)
  }
  return valid(patch)
}

export function validateSettingsPatch(value: unknown): Validation<SettingsPatch> {
  if (!isRecord(value)) return invalid('设置格式不正确')
  const patch: SettingsPatch = {}
  if (value.ai !== undefined) {
    if (!isRecord(value.ai)) return invalid('AI 设置格式不正确')
    const baseUrl = validateBaseUrl(value.ai.baseUrl)
    if (!baseUrl.ok) return invalid(baseUrl.message)
    const model = validateModel(value.ai.model)
    if (!model.ok) return invalid(model.message)
    const apiFormat = validateApiFormat(value.ai.apiFormat)
    if (!apiFormat.ok) return invalid(apiFormat.message)
    patch.ai = { baseUrl: baseUrl.value, model: model.value }
    if (apiFormat.value !== undefined) patch.ai.apiFormat = apiFormat.value
  }
  if (value.autoSummary !== undefined) {
    const autoSummary = value.autoSummary
    if (!isRecord(autoSummary) || typeof autoSummary.enabled !== 'boolean') {
      return invalid('每晚自动总结设置格式不正确')
    }
    if (typeof autoSummary.time !== 'string' || !isTimeKey(autoSummary.time)) {
      return invalid('自动总结时间需要是 HH:mm 格式')
    }
    patch.autoSummary = { enabled: autoSummary.enabled, time: autoSummary.time }
  }
  if (value.openAtLogin !== undefined) {
    if (typeof value.openAtLogin !== 'boolean') return invalid('开机自动打开设置格式不正确')
    patch.openAtLogin = value.openAtLogin
  }
  if (value.voiceHotkey !== undefined) {
    if (value.voiceHotkey !== null && typeof value.voiceHotkey !== 'string') {
      return invalid('语音快捷键格式不正确')
    }
    patch.voiceHotkey = value.voiceHotkey
  }
  if (value.minimizeToTray !== undefined) {
    if (typeof value.minimizeToTray !== 'boolean') return invalid('最小化到托盘设置格式不正确')
    patch.minimizeToTray = value.minimizeToTray
  }
  if (value.floatWindow !== undefined) {
    const floatWindow = validateFloatWindowPatch(value.floatWindow)
    if (!floatWindow.ok) return invalid(floatWindow.message)
    patch.floatWindow = floatWindow.value
  }
  return valid(patch)
}

const FLOAT_WINDOW_KEYS = ['open', 'alwaysOnTop', 'locked'] as const

export function isFloatOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= FLOAT_OPACITY_MIN && value <= 1
}

function validateFloatWindowPatch(value: unknown): Validation<Partial<FloatWindowSettings>> {
  if (!isRecord(value)) return invalid('悬浮窗设置格式不正确')
  const patch: Partial<FloatWindowSettings> = {}
  for (const key of Object.keys(value)) {
    if (key !== 'opacity' && !FLOAT_WINDOW_KEYS.some((known) => known === key)) return invalid('悬浮窗设置格式不正确')
  }
  if (value.opacity !== undefined) {
    if (!isFloatOpacity(value.opacity)) return invalid('悬浮窗不透明度不正确')
    patch.opacity = value.opacity
  }
  for (const key of FLOAT_WINDOW_KEYS) {
    const field = value[key]
    if (field === undefined) continue
    if (typeof field !== 'boolean') return invalid('悬浮窗设置格式不正确')
    patch[key] = field
  }
  return valid(patch)
}

export function validateApiKey(value: unknown): Validation<string> {
  const key = boundedText(value, 1, API_KEY_MAX)
  if (key === null) return invalid('API Key 不能为空')
  return valid(key)
}

export function validateRequestId(value: unknown): Validation<string> {
  const requestId = boundedText(value, 1, REQUEST_ID_MAX)
  if (requestId === null) return invalid('请求编号不合法')
  return valid(requestId)
}

/** 胶囊窗口按内容申请的尺寸：120–480 × 40–240 的整数，其它一律不合法。 */
export function validatePillSize(value: unknown): Validation<PillSize> {
  if (!isRecord(value)) return invalid('窗口大小格式不正确')
  const { width, height } = value
  const { minWidth, maxWidth, minHeight, maxHeight } = PILL_SIZE_LIMITS
  if (!Number.isInteger(width) || (width as number) < minWidth || (width as number) > maxWidth) {
    return invalid('窗口宽度不合法')
  }
  if (!Number.isInteger(height) || (height as number) < minHeight || (height as number) > maxHeight) {
    return invalid('窗口高度不合法')
  }
  return valid({ width: width as number, height: height as number })
}

// 录音上限：base64 约 4 MB（16 kHz 单声道 16 位约 90 秒），只收 WAV。
const VOICE_BASE64_MAX = 4_000_000
const VOICE_SECONDS_MAX = 90
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

function validateVoiceClip(value: unknown): Validation<VoiceClip> {
  if (!isRecord(value) || value.mimeType !== 'audio/wav') return invalid('录音格式不正确')
  const { data, seconds } = value
  if (typeof data !== 'string' || data.length === 0 || data.length > VOICE_BASE64_MAX || !BASE64_PATTERN.test(data)) {
    return invalid('录音数据不正确或太长')
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > VOICE_SECONDS_MAX) {
    return invalid('录音时长不正确')
  }
  return valid({ mimeType: 'audio/wav', data, seconds })
}

export function validateApiFormat(value: unknown): Validation<AiApiFormat | undefined> {
  if (value === undefined) return valid(undefined)
  if (value === 'openai' || value === 'gemini') return valid(value)
  return invalid('AI 接口格式不正确')
}

/** 打字和录音二选一。 */
export function validateCommandRequest(value: unknown): Validation<{ requestId: string; input: CommandInput }> {
  if (!isRecord(value)) return invalid('请求格式不正确')
  const requestId = validateRequestId(value.requestId)
  if (!requestId.ok) return invalid(requestId.message)
  if (value.audio !== undefined) {
    if (value.text !== undefined) return invalid('文字和录音只能二选一')
    const clip = validateVoiceClip(value.audio)
    if (!clip.ok) return invalid(clip.message)
    return valid({ requestId: requestId.value, input: { kind: 'audio', clip: clip.value } })
  }
  const text = boundedText(value.text, 1, PARSE_TEXT_MAX)
  if (text === null) return invalid('请输入 1–500 个字')
  return valid({ requestId: requestId.value, input: { kind: 'text', text } })
}

export function validateSummarizeRequest(value: unknown): Validation<{ requestId: string }> {
  if (!isRecord(value)) return invalid('请求格式不正确')
  const requestId = validateRequestId(value.requestId)
  if (!requestId.ok) return invalid(requestId.message)
  return valid({ requestId: requestId.value })
}

export type TestDraft = { baseUrl: string; model: string; apiFormat?: AiApiFormat; apiKey?: string }

export function validateTestDraft(value: unknown): Validation<TestDraft | undefined> {
  if (value === undefined) return valid(undefined)
  if (!isRecord(value)) return invalid('测试连接的参数格式不正确')
  const baseUrl = validateBaseUrl(value.baseUrl)
  if (!baseUrl.ok) return invalid(baseUrl.message)
  const model = validateModel(value.model)
  if (!model.ok) return invalid(model.message)
  const apiFormat = validateApiFormat(value.apiFormat)
  if (!apiFormat.ok) return invalid(apiFormat.message)
  const draft: TestDraft = { baseUrl: baseUrl.value, model: model.value }
  if (apiFormat.value !== undefined) draft.apiFormat = apiFormat.value
  if (value.apiKey === undefined) return valid(draft)
  const apiKey = validateApiKey(value.apiKey)
  if (!apiKey.ok) return invalid(apiKey.message)
  return valid({ ...draft, apiKey: apiKey.value })
}
