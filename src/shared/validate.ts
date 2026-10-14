import type { SettingsPatch } from './api'
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

export function validateTaskList(value: unknown): Validation<Task[]> {
  if (!Array.isArray(value)) return invalid('任务列表格式不正确')
  const tasks: Task[] = []
  const seenIds = new Set<string>()
  for (const [index, item] of value.entries()) {
    const result = validateTask(item)
    if (!result.ok) return invalid(`第 ${index + 1} 条：${result.message}`)
    if (seenIds.has(result.value.id)) return invalid(`第 ${index + 1} 条：任务 id 重复`)
    seenIds.add(result.value.id)
    tasks.push(result.value)
  }
  return valid(tasks)
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
    patch.ai = { baseUrl: baseUrl.value, model: model.value }
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

export function validateParseRequest(value: unknown): Validation<{ requestId: string; text: string }> {
  if (!isRecord(value)) return invalid('请求格式不正确')
  const requestId = validateRequestId(value.requestId)
  if (!requestId.ok) return invalid(requestId.message)
  const text = boundedText(value.text, 1, PARSE_TEXT_MAX)
  if (text === null) return invalid('请输入 1–500 个字')
  return valid({ requestId: requestId.value, text })
}

export function validateSummarizeRequest(value: unknown): Validation<{ requestId: string }> {
  if (!isRecord(value)) return invalid('请求格式不正确')
  const requestId = validateRequestId(value.requestId)
  if (!requestId.ok) return invalid(requestId.message)
  return valid({ requestId: requestId.value })
}

export function validateTestDraft(
  value: unknown
): Validation<{ baseUrl: string; model: string; apiKey?: string } | undefined> {
  if (value === undefined) return valid(undefined)
  if (!isRecord(value)) return invalid('测试连接的参数格式不正确')
  const baseUrl = validateBaseUrl(value.baseUrl)
  if (!baseUrl.ok) return invalid(baseUrl.message)
  const model = validateModel(value.model)
  if (!model.ok) return invalid(model.message)
  if (value.apiKey === undefined) return valid({ baseUrl: baseUrl.value, model: model.value })
  const apiKey = validateApiKey(value.apiKey)
  if (!apiKey.ok) return invalid(apiKey.message)
  return valid({ baseUrl: baseUrl.value, model: model.value, apiKey: apiKey.value })
}
