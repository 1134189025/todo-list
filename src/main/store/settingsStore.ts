import { promises as fs } from 'node:fs'
import { safeStorage } from 'electron'
import {
  createQueuedWriter,
  errorCode,
  quarantineCorruptFile,
  stripBom,
  type QueuedWriter
} from './atomicFile'
import { DEFAULT_VOICE_HOTKEY, canonicalize, validate } from '@shared/accelerator'
import { fail, ok } from '@shared/result'
import type { FloatWindowSettings, HotkeyStatus, PublicSettings, Result, SettingsPatch } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import { isRecord } from '@shared/validate'
import { openAtLoginStatus } from '../loginItem'

const FILE_VERSION = 1
const READ_ATTEMPTS = 3
const READ_RETRY_MS = 150

export type WindowBounds = { x: number; y: number; width: number; height: number }

export type StoredFloatWindow = FloatWindowSettings & { bounds: WindowBounds | null }

type StoredSettings = {
  ai: { baseUrl: string; model: string; apiKeyEnc: string | null }
  autoSummary: { enabled: boolean; time: string }
  openAtLogin: boolean
  voiceHotkey: string | null
  windowBounds: WindowBounds | null
  lastAutoSummaryDate: string | null
  minimizeToTray: boolean
  floatWindow: StoredFloatWindow
}

/** 设置之外、由运行时决定的状态，toPublic 时读取。 */
export type SettingsRuntime = {
  hotkeyStatus(): HotkeyStatus
  trayAvailable(): boolean
}

export type SettingsStore = {
  load(): Promise<Result<null>>
  isLoaded(): boolean
  toPublic(): PublicSettings
  save(patch: SettingsPatch): Promise<Result<PublicSettings>>
  setApiKey(key: string): Promise<Result<PublicSettings>>
  clearApiKey(): Promise<Result<PublicSettings>>
  readApiKey(): string | null
  getVoiceHotkey(): string | null
  getWindowBounds(): WindowBounds | null
  setWindowBounds(bounds: WindowBounds): void
  getLastAutoSummaryDate(): string | null
  setLastAutoSummaryDate(date: string): Promise<Result<null>>
  getMinimizeToTray(): boolean
  getFloatWindow(): StoredFloatWindow
  setFloatBounds(bounds: WindowBounds): void
  flush(): Promise<void>
}

const DEFAULT_FLOAT_WINDOW: StoredFloatWindow = { open: false, alwaysOnTop: true, locked: false, bounds: null }

const DEFAULT_SETTINGS: StoredSettings = {
  ai: { baseUrl: '', model: '', apiKeyEnc: null },
  autoSummary: { enabled: true, time: '21:00' },
  openAtLogin: false,
  voiceHotkey: DEFAULT_VOICE_HOTKEY,
  windowBounds: null,
  lastAutoSummaryDate: null,
  minimizeToTray: true,
  floatWindow: DEFAULT_FLOAT_WINDOW
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseStoredHotkey(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string' && validate(value).ok) return canonicalize(value)
  return DEFAULT_VOICE_HOTKEY
}

function parseWindowBounds(value: unknown): WindowBounds | null {
  if (!isRecord(value)) return null
  const { x, y, width, height } = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
    return null
  }
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

function parseAi(value: unknown): StoredSettings['ai'] {
  if (!isRecord(value)) return DEFAULT_SETTINGS.ai
  const { baseUrl, model, apiKeyEnc } = value
  return {
    baseUrl: typeof baseUrl === 'string' ? baseUrl : DEFAULT_SETTINGS.ai.baseUrl,
    model: typeof model === 'string' ? model : DEFAULT_SETTINGS.ai.model,
    apiKeyEnc: typeof apiKeyEnc === 'string' && apiKeyEnc !== '' ? apiKeyEnc : null
  }
}

function parseAutoSummary(value: unknown): StoredSettings['autoSummary'] {
  if (!isRecord(value)) return DEFAULT_SETTINGS.autoSummary
  const { enabled, time } = value
  return {
    enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SETTINGS.autoSummary.enabled,
    time: typeof time === 'string' && isTimeKey(time) ? time : DEFAULT_SETTINGS.autoSummary.time
  }
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseFloatWindow(value: unknown): StoredFloatWindow {
  if (!isRecord(value)) return DEFAULT_FLOAT_WINDOW
  return {
    open: booleanOr(value.open, DEFAULT_FLOAT_WINDOW.open),
    alwaysOnTop: booleanOr(value.alwaysOnTop, DEFAULT_FLOAT_WINDOW.alwaysOnTop),
    locked: booleanOr(value.locked, DEFAULT_FLOAT_WINDOW.locked),
    bounds: parseWindowBounds(value.bounds)
  }
}

// 只有整个文件读不懂（坏 JSON、不是对象、版本不对）才算损坏；单个字段不合法时回退到默认值，
// 这样一个坏掉的窗口位置不会连带丢掉已保存的 API Key。
function parseStoredSettings(raw: string): StoredSettings | null {
  let data: unknown
  try {
    data = JSON.parse(stripBom(raw))
  } catch {
    return null
  }
  if (!isRecord(data) || data.version !== FILE_VERSION) return null
  const { lastAutoSummaryDate } = data
  return {
    ai: parseAi(data.ai),
    autoSummary: parseAutoSummary(data.autoSummary),
    openAtLogin: booleanOr(data.openAtLogin, DEFAULT_SETTINGS.openAtLogin),
    voiceHotkey: parseStoredHotkey(data.voiceHotkey),
    windowBounds: parseWindowBounds(data.windowBounds),
    lastAutoSummaryDate:
      typeof lastAutoSummaryDate === 'string' && isDateKey(lastAutoSummaryDate) ? lastAutoSummaryDate : null,
    minimizeToTray: booleanOr(data.minimizeToTray, DEFAULT_SETTINGS.minimizeToTray),
    floatWindow: parseFloatWindow(data.floatWindow)
  }
}

function serialize(settings: StoredSettings): string {
  return `${JSON.stringify({ version: FILE_VERSION, ...settings }, null, 2)}\n`
}

// 杀毒软件、同步盘偶尔会短暂占用文件：不存在以外的读取错误先重试几次，再算失败。
async function readSettingsFile(filePath: string): Promise<{ kind: 'missing' } | { kind: 'text'; raw: string } | null> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { kind: 'text', raw: await fs.readFile(filePath, 'utf8') }
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { kind: 'missing' }
      if (attempt >= READ_ATTEMPTS) return null
      await sleep(READ_RETRY_MS)
    }
  }
}

export function createSettingsStore(filePath: string, runtime: SettingsRuntime): SettingsStore {
  const writer: QueuedWriter = createQueuedWriter(filePath)
  let current: StoredSettings = DEFAULT_SETTINGS
  let writable = false
  let loading: Promise<Result<null>> | null = null

  async function readAndRecover(): Promise<Result<null>> {
    const file = await readSettingsFile(filePath)
    if (file === null) return fail('IO', '读取设置文件失败，请稍后重试或重启程序')
    if (file.kind === 'missing') {
      current = DEFAULT_SETTINGS
      writable = true
      return ok(null)
    }
    const parsed = parseStoredSettings(file.raw)
    if (parsed !== null) {
      current = parsed
      writable = true
      return ok(null)
    }
    try {
      await quarantineCorruptFile(filePath)
      current = DEFAULT_SETTINGS
      writable = true
      return ok(null)
    } catch {
      return fail('IO', '设置文件已损坏且无法备份，为保护原文件已暂停保存')
    }
  }

  function load(): Promise<Result<null>> {
    if (loading === null) {
      loading = readAndRecover().then((result) => {
        if (!result.ok) loading = null
        return result
      })
    }
    return loading
  }

  async function persist(next: StoredSettings): Promise<Result<null>> {
    if (!writable) return fail('IO', '设置还没有读取成功，暂不保存')
    const previous = current
    current = next
    const result = await writer.write(serialize(next))
    if (!result.ok) {
      if (current === next) current = previous
      return fail('IO', result.message)
    }
    return ok(null)
  }

  // 改设置前先确保读到了文件里的值，免得拿默认值覆盖掉已保存的 Key。
  async function update(change: (settings: StoredSettings) => StoredSettings): Promise<Result<PublicSettings>> {
    const loaded = await load()
    if (!loaded.ok) return loaded
    const result = await persist(change(current))
    if (!result.ok) return result
    return ok(toPublic())
  }

  function readApiKey(): string | null {
    const encrypted = current.ai.apiKeyEnc
    if (encrypted === null || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return null
    }
  }

  function toPublic(): PublicSettings {
    const usableKey = readApiKey() !== null
    const { open, alwaysOnTop, locked } = current.floatWindow
    return {
      ai: {
        baseUrl: current.ai.baseUrl,
        model: current.ai.model,
        hasApiKey: usableKey,
        keyUnreadable: current.ai.apiKeyEnc !== null && !usableKey
      },
      autoSummary: { ...current.autoSummary },
      openAtLogin: openAtLoginStatus(current.openAtLogin),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      voiceHotkey: { accelerator: current.voiceHotkey, status: runtime.hotkeyStatus() },
      minimizeToTray: current.minimizeToTray,
      trayAvailable: runtime.trayAvailable(),
      floatWindow: { open, alwaysOnTop, locked }
    }
  }

  return {
    load,
    isLoaded: () => writable,
    toPublic,
    save(patch: SettingsPatch): Promise<Result<PublicSettings>> {
      return update((settings) => ({
        ...settings,
        ai: patch.ai === undefined ? settings.ai : { ...settings.ai, baseUrl: patch.ai.baseUrl, model: patch.ai.model },
        autoSummary: patch.autoSummary ?? settings.autoSummary,
        openAtLogin: patch.openAtLogin ?? settings.openAtLogin,
        voiceHotkey: patch.voiceHotkey === undefined ? settings.voiceHotkey : patch.voiceHotkey,
        minimizeToTray: patch.minimizeToTray ?? settings.minimizeToTray,
        floatWindow: { ...settings.floatWindow, ...patch.floatWindow }
      }))
    },
    setApiKey(key: string): Promise<Result<PublicSettings>> {
      if (!safeStorage.isEncryptionAvailable()) {
        return Promise.resolve(fail('ENCRYPTION_UNAVAILABLE', '当前系统无法安全保存 API Key，已拒绝保存'))
      }
      const apiKeyEnc = safeStorage.encryptString(key).toString('base64')
      return update((settings) => ({ ...settings, ai: { ...settings.ai, apiKeyEnc } }))
    },
    clearApiKey(): Promise<Result<PublicSettings>> {
      return update((settings) => ({ ...settings, ai: { ...settings.ai, apiKeyEnc: null } }))
    },
    readApiKey,
    getVoiceHotkey: () => current.voiceHotkey,
    getWindowBounds: () => current.windowBounds,
    setWindowBounds(bounds: WindowBounds): void {
      void persist({ ...current, windowBounds: bounds })
    },
    getLastAutoSummaryDate: () => current.lastAutoSummaryDate,
    setLastAutoSummaryDate(date: string): Promise<Result<null>> {
      return persist({ ...current, lastAutoSummaryDate: date })
    },
    getMinimizeToTray: () => current.minimizeToTray,
    getFloatWindow: () => current.floatWindow,
    setFloatBounds(bounds: WindowBounds): void {
      void persist({ ...current, floatWindow: { ...current.floatWindow, bounds } })
    },
    flush(): Promise<void> {
      return writer.flush()
    }
  }
}
