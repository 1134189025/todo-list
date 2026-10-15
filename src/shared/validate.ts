import { FLOAT_OPACITY_MIN, type AiApiFormat, type CommandInput, type FloatWindowSettings, type SettingsPatch, type VoiceClip } from './api'
import { TASK_FIELDS, type CategoryPatch, type TaskFields, type TaskPatch } from './taskPatch'
import { isDateKey, isIsoTimestamp, isTimeKey } from './dates'
import { normalizeCategoryName, TITLE_MAX } from './text'
import { DEFAULT_URGENCY, URGENCIES, type Category, type Task, type TaskSource, type Urgency } from './types'

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

function isUrgency(value: unknown): value is Urgency {
  return typeof value === 'string' && URGENCIES.some((known) => known === value)
}

/** 任务里指向分类的 id：空、超长或不是字符串都按「没有分类」处理（不 trim，id 是不透明字符串）。 */
function isCategoryId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= ID_MAX
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

// 校验一条任务。除整条格式外，还负责补齐 / 修正后加的字段：
// urgency 不是三档之一 → normal；inProgress 不是布尔 → false；done 为 true 时 inProgress 一律 false；
// categoryId 不是 1–100 的字符串（含缺省、null）→ null。这些都是「修正」，不算不合法、不跳过。
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
  const urgency = isUrgency(value.urgency) ? value.urgency : DEFAULT_URGENCY
  const inProgress = typeof value.inProgress === 'boolean' ? value.inProgress : false
  const categoryId = isCategoryId(value.categoryId) ? value.categoryId : null
  return valid({
    id,
    title,
    done,
    dueDate,
    dueTime,
    createdAt,
    completedAt,
    source,
    urgency,
    inProgress: done ? false : inProgress,
    categoryId
  })
}

// 校验一条分类。名字规范化后为空、id 空或超长、createdAt 不是合法时间都算不合法（读文件时跳过这一条）。
export function validateCategory(value: unknown): Validation<Category> {
  if (!isRecord(value)) return invalid('分类格式不正确')
  if (!isCategoryId(value.id)) return invalid('分类 id 不合法')
  const name = typeof value.name === 'string' ? normalizeCategoryName(value.name) : ''
  if (name === '') return invalid('分类名需要 1–20 个字符')
  const createdAt = matching(value.createdAt, isIsoTimestamp)
  if (createdAt === undefined) return invalid('分类创建时间不合法')
  return valid({ id: value.id, name, createdAt })
}

const PATCH_MAX = 5000

// 改动里的单个字段：类型和格式先在这里查，合并后的整条任务主进程再用 validateTask 查一遍。
// 字段缺省 = 不改；显式写 null（dueDate / dueTime / completedAt / categoryId）= 清掉。
const FIELD_CHECKS: Record<(typeof TASK_FIELDS)[number], (value: unknown) => boolean> = {
  title: (value) => boundedText(value, 1, TITLE_MAX) !== null,
  done: (value) => typeof value === 'boolean',
  dueDate: (value) => nullableMatching(value, isDateKey) !== undefined,
  dueTime: (value) => nullableMatching(value, isTimeKey) !== undefined,
  createdAt: (value) => matching(value, isIsoTimestamp) !== undefined,
  completedAt: (value) => nullableMatching(value, isIsoTimestamp) !== undefined,
  source: (value) => validateTaskSource(value) !== null,
  urgency: (value) => isUrgency(value),
  inProgress: (value) => typeof value === 'boolean',
  // 分类 id 明确写 null = 取消分类；写别的（超长、空串、数字）整批拒绝。
  categoryId: (value) => value === null || isCategoryId(value)
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

// 分类改动：整段可以缺省（= 三样都空）。id 和任务一样是不透明字符串，不 trim。
function validateCategoryPatch(value: unknown): Validation<CategoryPatch> {
  if (value === undefined) return valid({ added: [], renamed: [], removedIds: [] })
  if (!isRecord(value)) return invalid('分类改动格式不正确')
  const { added, renamed, removedIds } = value
  if (!Array.isArray(added) || !Array.isArray(renamed) || !Array.isArray(removedIds)) {
    return invalid('分类改动格式不正确')
  }
  const patch: CategoryPatch = { added: [], renamed: [], removedIds: [] }
  for (const entry of added as unknown[]) {
    const category = validateCategory(entry)
    if (!category.ok) return invalid(category.message)
    patch.added.push(category.value)
  }
  for (const entry of renamed as unknown[]) {
    if (!isRecord(entry) || !isCategoryId(entry.id)) return invalid('分类 id 不合法')
    const name = typeof entry.name === 'string' ? normalizeCategoryName(entry.name) : ''
    if (name === '') return invalid('分类名需要 1–20 个字符')
    patch.renamed.push({ id: entry.id, name })
  }
  for (const entry of removedIds as unknown[]) {
    if (!isCategoryId(entry)) return invalid('分类 id 不合法')
    patch.removedIds.push(entry)
  }
  return valid(patch)
}

function categoryPatchCount(patch: CategoryPatch): number {
  return patch.added.length + patch.renamed.length + patch.removedIds.length
}

export function validateTaskPatch(value: unknown): Validation<TaskPatch> {
  if (!isRecord(value)) return invalid('任务改动格式不正确')
  const { added, updated, removedIds } = value
  if (!Array.isArray(added) || !Array.isArray(updated) || !Array.isArray(removedIds)) {
    return invalid('任务改动格式不正确')
  }
  const categories = validateCategoryPatch(value.categories)
  if (!categories.ok) return invalid(categories.message)
  // 一次改动的总条数上限把任务和分类一起算。
  if (added.length + updated.length + removedIds.length + categoryPatchCount(categories.value) > PATCH_MAX) {
    return invalid('一次改动的任务太多')
  }
  const patch: TaskPatch = { added: [], updated: [], removedIds: [], categories: categories.value }
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
