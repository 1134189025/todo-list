import type { ParsedItem, Result } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import { fail, ok } from '@shared/result'
import { truncateTitle } from '@shared/text'
import { isRecord } from '@shared/validate'

const MAX_OBJECT_CANDIDATES = 20
const NOT_JSON_MESSAGE = 'AI 的回复不是完整的 JSON，再试一次'

export function truncateText(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? chars.slice(0, max).join('') : text
}

function findObjectEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

// 模型有时把换行、制表符直接写进字符串里（JSON 不允许），比如听写很长的一段话：转义后再解析。
function escapeRawControlChars(json: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const char of json) {
    if (inString && !escaped && char < ' ') {
      out += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    }
    out += char
  }
  return out
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(escapeRawControlChars(text))
    } catch {
      return null
    }
  }
}

function parseObjectAt(text: string, start: number): Record<string, unknown> | null {
  const end = findObjectEnd(text, start)
  if (end === -1) return null
  const data = parseJson(text.slice(start, end + 1))
  return isRecord(data) ? data : null
}

/**
 * 去掉 ```json 围栏，取第一个完整、且符合 accept 的 {…}。前面有写坏的 { 时往后找，最多试 20 个位置。
 * accept 用来跳过嵌在里面的小对象：外层写坏时，不能把第一条操作 {"op":…} 当成整个回复。
 */
export function extractJsonObject(
  content: string,
  accept: (data: Record<string, unknown>) => boolean = () => true
): Result<Record<string, unknown>> {
  const text = content.replace(/```(?:json)?/gi, '')
  let start = text.indexOf('{')
  for (let attempt = 0; start !== -1 && attempt < MAX_OBJECT_CANDIDATES; attempt += 1) {
    const parsed = parseObjectAt(text, start)
    if (parsed !== null && accept(parsed)) return ok(parsed)
    start = text.indexOf('{', start + 1)
  }
  return fail('BAD_RESPONSE', NOT_JSON_MESSAGE)
}

/** AI 给的一条新建待办：标题去空白并截断，日期不是真实日期就置 null，没有日期时不留时间。 */
export function sanitizeItem(value: unknown): ParsedItem | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null
  const title = value.title.trim()
  if (title === '') return null
  const date = typeof value.date === 'string' && isDateKey(value.date) ? value.date : null
  const rawTime = typeof value.time === 'string' && isTimeKey(value.time) ? value.time : null
  return { title: truncateTitle(title), date, time: date === null ? null : rawTime }
}
