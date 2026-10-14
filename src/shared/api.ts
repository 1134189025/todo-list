import type { Task } from './types'

export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'BAD_RESPONSE'
  | 'SANDBOX_BLOCKED'
  | 'CANCELLED'
  | 'INVALID_INPUT'
  | 'ENCRYPTION_UNAVAILABLE'
  | 'IO'
  | 'NOT_IMPLEMENTED'
  | 'HOTKEY_INVALID'
  | 'HOTKEY_TAKEN'

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } }

export type HotkeyStatus = 'registered' | 'off' | 'failed' | 'sandbox'

export type PublicSettings = {
  ai: { baseUrl: string; model: string; hasApiKey: boolean }
  autoSummary: { enabled: boolean; time: string }   // 'HH:mm'
  openAtLogin: boolean
  encryptionAvailable: boolean
  voiceHotkey: {
    accelerator: string | null   // 规范写法，见 accelerator.ts；null = 不使用快捷键
    status: HotkeyStatus         // failed = 被其它程序占用；sandbox = 挡板模式不注册
  }
}

export type SettingsPatch = {
  ai?: { baseUrl: string; model: string }
  autoSummary?: { enabled: boolean; time: string }
  openAtLogin?: boolean
  voiceHotkey?: string | null   // 不合法返回 HOTKEY_INVALID；注册失败返回 HOTKEY_TAKEN 且保留旧的
}

export type ParsedItem = { title: string; date: string | null; time: string | null }

export type SummaryResult = {
  headline: string
  overview: string
  order: { id: string; reason: string }[]
  generatedAt: string          // ISO
  basedOnCount: number
  tasksFingerprint: string     // shared/fingerprint.ts 算的，渲染进程拿来判断是否过期
}

export interface QingxinApi {
  tasks: {
    // corruptBackup：本次启动备份出的坏文件名；skipped：本次启动跳过的不合法任务条数（整个文件损坏时为 0）
    load(): Promise<Result<{ tasks: Task[]; corruptBackup: string | null; skipped: number }>>
    save(tasks: Task[]): Promise<Result<null>>
  }
  settings: {
    get(): Promise<Result<PublicSettings>>
    save(patch: SettingsPatch): Promise<Result<PublicSettings>>
    setApiKey(key: string): Promise<Result<PublicSettings>>
    clearApiKey(): Promise<Result<PublicSettings>>
  }
  ai: {
    parse(req: { requestId: string; text: string }): Promise<Result<ParsedItem[]>>
    summarize(req: { requestId: string }): Promise<Result<SummaryResult>>
    // draft 不传 = 用已保存的配置；draft.apiKey 不传 = 用已保存的 Key
    testConnection(draft?: { baseUrl: string; model: string; apiKey?: string }): Promise<Result<{ model: string }>>
    cancel(requestId: string): Promise<Result<null>>
  }
  events: {
    onSummaryShow(cb: (s: SummaryResult) => void): () => void  // 返回取消订阅函数
    onVoiceHotkey(cb: () => void): () => void                   // 全局快捷键被按下
  }
  app: { isSandbox: boolean }
}

export const IPC = {
  tasksLoad: 'tasks:load',
  tasksSave: 'tasks:save',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',
  aiParse: 'ai:parse',
  aiSummarize: 'ai:summarize',
  aiTestConnection: 'ai:testConnection',
  aiCancel: 'ai:cancel',
  summaryShow: 'summary:show',
  voiceHotkey: 'voice:hotkey',
  appIsSandbox: 'app:isSandbox'
} as const
