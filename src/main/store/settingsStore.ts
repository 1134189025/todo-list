import { promises as fs } from 'node:fs'
import { safeStorage } from 'electron'
import { createQueuedWriter, errorCode, quarantineCorruptFile, type QueuedWriter } from './atomicFile'
import { DEFAULT_VOICE_HOTKEY, canonicalize, validate } from '@shared/accelerator'
import { fail, ok } from '@shared/result'
import type { HotkeyStatus, PublicSettings, Result, SettingsPatch } from '@shared/api'
import { isDateKey, isTimeKey } from '@shared/dates'
import { isRecord } from '@shared/validate'
import { openAtLoginStatus } from '../loginItem'

const FILE_VERSION = 1

export type WindowBounds = { x: number; y: number; width: number; height: number }

type StoredSettings = {
  ai: { baseUrl: string; model: string; apiKeyEnc: string | null }
  autoSummary: { enabled: boolean; time: string }
  openAtLogin: boolean
  voiceHotkey: string | null
  windowBounds: WindowBounds | null
  lastAutoSummaryDate: string | null
}

export type SettingsStore = {
  load(): Promise<Result<null>>
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
  flush(): Promise<void>
}

const DEFAULT_SETTINGS: StoredSettings = {
  ai: { baseUrl: '', model: '', apiKeyEnc: null },
  autoSummary: { enabled: true, time: '21:00' },
  openAtLogin: false,
  voiceHotkey: DEFAULT_VOICE_HOTKEY,
  windowBounds: null,
  lastAutoSummaryDate: null
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

// 只有整个文件读不懂（坏 JSON、不是对象、版本不对）才算损坏；单个字段不合法时回退到默认值，
// 这样一个坏掉的窗口位置不会连带丢掉已保存的 API Key。
function parseStoredSettings(raw: string): StoredSettings | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || data.version !== FILE_VERSION) return null
  const { lastAutoSummaryDate } = data
  return {
    ai: parseAi(data.ai),
    autoSummary: parseAutoSummary(data.autoSummary),
    openAtLogin: typeof data.openAtLogin === 'boolean' ? data.openAtLogin : DEFAULT_SETTINGS.openAtLogin,
    voiceHotkey: parseStoredHotkey(data.voiceHotkey),
    windowBounds: parseWindowBounds(data.windowBounds),
    lastAutoSummaryDate:
      typeof lastAutoSummaryDate === 'string' && isDateKey(lastAutoSummaryDate) ? lastAutoSummaryDate : null
  }
}

function serialize(settings: StoredSettings): string {
  return `${JSON.stringify({ version: FILE_VERSION, ...settings }, null, 2)}\n`
}

export function createSettingsStore(filePath: string, hotkeyStatus: () => HotkeyStatus): SettingsStore {
  const writer: QueuedWriter = createQueuedWriter(filePath)
  let current: StoredSettings = DEFAULT_SETTINGS
  let writable = false
  let loading: Promise<Result<null>> | null = null

  async function readAndRecover(): Promise<Result<null>> {
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        current = DEFAULT_SETTINGS
        writable = true
        return ok(null)
      }
      return fail('IO', '读取设置失败')
    }
    const parsed = parseStoredSettings(raw)
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

  function toPublic(): PublicSettings {
    return {
      ai: {
        baseUrl: current.ai.baseUrl,
        model: current.ai.model,
        hasApiKey: current.ai.apiKeyEnc !== null
      },
      autoSummary: { ...current.autoSummary },
      openAtLogin: openAtLoginStatus(current.openAtLogin),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      voiceHotkey: { accelerator: current.voiceHotkey, status: hotkeyStatus() }
    }
  }

  return {
    load(): Promise<Result<null>> {
      if (loading === null) {
        loading = readAndRecover().then((result) => {
          if (!result.ok) loading = null
          return result
        })
      }
      return loading
    },
    toPublic,
    async save(patch: SettingsPatch): Promise<Result<PublicSettings>> {
      const next: StoredSettings = {
        ...current,
        ai: patch.ai === undefined ? current.ai : { ...current.ai, baseUrl: patch.ai.baseUrl, model: patch.ai.model },
        autoSummary: patch.autoSummary ?? current.autoSummary,
        openAtLogin: patch.openAtLogin ?? current.openAtLogin,
        voiceHotkey: patch.voiceHotkey === undefined ? current.voiceHotkey : patch.voiceHotkey
      }
      const result = await persist(next)
      if (!result.ok) return result
      return ok(toPublic())
    },
    async setApiKey(key: string): Promise<Result<PublicSettings>> {
      if (!safeStorage.isEncryptionAvailable()) {
        return fail('ENCRYPTION_UNAVAILABLE', '当前系统无法安全保存 API Key，已拒绝保存')
      }
      const apiKeyEnc = safeStorage.encryptString(key).toString('base64')
      const result = await persist({ ...current, ai: { ...current.ai, apiKeyEnc } })
      if (!result.ok) return result
      return ok(toPublic())
    },
    async clearApiKey(): Promise<Result<PublicSettings>> {
      const result = await persist({ ...current, ai: { ...current.ai, apiKeyEnc: null } })
      if (!result.ok) return result
      return ok(toPublic())
    },
    readApiKey(): string | null {
      const encrypted = current.ai.apiKeyEnc
      if (encrypted === null || !safeStorage.isEncryptionAvailable()) return null
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch {
        return null
      }
    },
    getVoiceHotkey(): string | null {
      return current.voiceHotkey
    },
    getWindowBounds(): WindowBounds | null {
      return current.windowBounds
    },
    setWindowBounds(bounds: WindowBounds): void {
      void persist({ ...current, windowBounds: bounds })
    },
    getLastAutoSummaryDate(): string | null {
      return current.lastAutoSummaryDate
    },
    setLastAutoSummaryDate(date: string): Promise<Result<null>> {
      return persist({ ...current, lastAutoSummaryDate: date })
    },
    flush(): Promise<void> {
      return writer.flush()
    }
  }
}
