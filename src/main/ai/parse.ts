import type { ParsedItem, Result } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import { fail, ok } from '@shared/result'
import { truncateTitle } from '@shared/text'
import { isRecord } from '@shared/validate'

const MAX_OBJECT_CANDIDATES = 20
const BAD_REPLY_MESSAGE = 'AI 返回的内容看不懂'

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

function parseObjectAt(text: string, start: number): Record<string, unknown> | null {
  const end = findObjectEnd(text, start)
  if (end === -1) return null
  let data: unknown
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  return isRecord(data) ? data : null
}

// 去掉 ```json 围栏，取第一个完整的 {…}，解析成对象。前面有写坏的 { 时往后找，最多试 20 个位置。
export function extractJsonObject(content: string): Result<Record<string, unknown>> {
  const text = content.replace(/```(?:json)?/gi, '')
  let start = text.indexOf('{')
  for (let attempt = 0; start !== -1 && attempt < MAX_OBJECT_CANDIDATES; attempt += 1) {
    const parsed = parseObjectAt(text, start)
    if (parsed !== null) return ok(parsed)
    start = text.indexOf('{', start + 1)
  }
  return fail('BAD_RESPONSE', BAD_REPLY_MESSAGE)
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
