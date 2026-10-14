export const DEFAULT_VOICE_HOTKEY = 'Control+Shift+Space'

export type AcceleratorCheck = { ok: true } | { ok: false; reason: string }

const MODIFIER_ORDER = ['Control', 'Alt', 'Shift', 'Super'] as const
type Modifier = (typeof MODIFIER_ORDER)[number]

const MODIFIER_ALIASES = new Map<string, Modifier>([
  ['control', 'Control'],
  ['ctrl', 'Control'],
  ['alt', 'Alt'],
  ['shift', 'Shift'],
  ['super', 'Super'],
  ['win', 'Super'],
  ['meta', 'Super']
])

const DISABLED_COMBOS: { combo: string; reason: string }[] = [
  { combo: 'Alt+F4', reason: '这是关闭窗口的键' },
  { combo: 'Control+Space', reason: '这是切换输入法的键' },
  { combo: 'Shift+Space', reason: '这是全角 / 半角切换键' },
  { combo: 'Super+L', reason: '这是锁屏键' },
  { combo: 'Control+Alt+Delete', reason: '这是系统安全键，不能使用' }
]

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight'
])

export type KeyboardEventLike = {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

type ParseResult = { ok: true; modifiers: Modifier[]; key: string } | { ok: false; reason: string }

function parseKey(raw: string): string | null {
  if (/^[A-Za-z]$/.test(raw)) return raw.toUpperCase()
  if (/^[0-9]$/.test(raw)) return raw
  if (/^f([1-9]|1\d|2[0-4])$/i.test(raw)) return raw.toUpperCase()
  if (raw.toLowerCase() === 'space') return 'Space'
  return null
}

function toCanonical(modifiers: readonly Modifier[], key: string): string {
  const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier))
  return [...ordered, key].join('+')
}

function parse(text: string): ParseResult {
  const parts = text.split('+').map((part) => part.trim())
  if (parts.some((part) => part === '')) {
    return { ok: false, reason: '格式不对，应该像「Control+Shift+Space」这样写' }
  }
  const keyPart = parts.pop()
  if (keyPart === undefined) return { ok: false, reason: '请按下一个组合键' }
  const key = parseKey(keyPart)
  if (key === null) return { ok: false, reason: '主键只支持字母、数字、F1–F24 和 Space' }
  const modifiers: Modifier[] = []
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES.get(part.toLowerCase())
    if (modifier === undefined) return { ok: false, reason: `不认识的修饰键「${part}」` }
    if (modifiers.includes(modifier)) return { ok: false, reason: '同一个修饰键不能重复' }
    modifiers.push(modifier)
  }
  return { ok: true, modifiers, key }
}

export function validate(text: string): AcceleratorCheck {
  const parsed = parse(text.trim())
  if (!parsed.ok) return parsed
  const { modifiers, key } = parsed
  const canonical = toCanonical(modifiers, key)
  const disabled = DISABLED_COMBOS.find((entry) => entry.combo === canonical)
  if (disabled) return { ok: false, reason: disabled.reason }
  const isFunctionKey = /^F\d+$/.test(key)
  if (modifiers.length === 0 && !isFunctionKey) {
    return { ok: false, reason: '需要至少一个修饰键（F1–F24 除外）' }
  }
  const hasStrongModifier = modifiers.some(
    (modifier) => modifier === 'Control' || modifier === 'Alt' || modifier === 'Super'
  )
  if (!isFunctionKey && !hasStrongModifier) {
    return { ok: false, reason: '字母、数字和 Space 需要搭配 Ctrl、Alt 或 Win，只按 Shift 会和打字冲突' }
  }
  return { ok: true }
}

export function canonicalize(text: string): string | null {
  const parsed = parse(text.trim())
  if (!parsed.ok) return null
  return toCanonical(parsed.modifiers, parsed.key)
}

export function fromKeyboardEvent(event: KeyboardEventLike): string | null {
  if (MODIFIER_CODES.has(event.code)) return null
  const modifiers: Modifier[] = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')
  return toCanonical(modifiers, mainKeyFromCode(event.code))
}

function mainKeyFromCode(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter?.[1] !== undefined) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit?.[1] !== undefined) return digit[1]
  if (code === 'Space') return 'Space'
  return code
}

export function toLabel(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'Control') return 'Ctrl'
      if (part === 'Super') return 'Win'
      return part
    })
    .join(' + ')
}
