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

export type FloatWindowSettings = {
  open: boolean          // 悬浮窗是否打开
  alwaysOnTop: boolean   // 置顶：盖在其它窗口上面
  locked: boolean        // 固定：不能拖动、不能改大小
}

export type PublicSettings = {
  // hasApiKey：有可用的 Key；keyUnreadable：文件里有 Key 但解不开（换了电脑或系统账户），需要重新填写
  ai: { baseUrl: string; model: string; hasApiKey: boolean; keyUnreadable: boolean }
  autoSummary: { enabled: boolean; time: string }   // 'HH:mm'
  openAtLogin: boolean
  encryptionAvailable: boolean
  voiceHotkey: {
    accelerator: string | null   // 规范写法，见 accelerator.ts；null = 不使用快捷键
    status: HotkeyStatus         // failed = 被其它程序占用；sandbox = 挡板模式不注册
  }
  minimizeToTray: boolean        // 最小化时隐藏到系统托盘
  trayAvailable: boolean         // 托盘图标是否存在（挡板安静模式下没有）
  floatWindow: FloatWindowSettings
}

export type SettingsPatch = {
  ai?: { baseUrl: string; model: string }
  autoSummary?: { enabled: boolean; time: string }
  openAtLogin?: boolean
  voiceHotkey?: string | null   // 不合法返回 HOTKEY_INVALID；注册失败返回 HOTKEY_TAKEN 且保留旧的
  minimizeToTray?: boolean
  floatWindow?: Partial<FloatWindowSettings>   // 只改传了的字段
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
    // draft 不传 = 用已保存的配置；draft.apiKey 不传 = 用已保存的 Key，
    // 但只在 draft 地址和已保存地址是同一个站点（协议 + 主机 + 端口）时才用，免得把 Key 发给另一家服务
    testConnection(draft?: { baseUrl: string; model: string; apiKey?: string }): Promise<Result<{ model: string }>>
    cancel(requestId: string): Promise<Result<null>>
  }
  events: {
    onSummaryShow(cb: (s: SummaryResult) => void): () => void  // 返回取消订阅函数
    onVoiceHotkey(cb: () => void): () => void                   // 全局快捷键被按下
    onTasksChanged(cb: (tasks: Task[]) => void): () => void     // 别的窗口改了任务
    onSettingsChanged(cb: (s: PublicSettings) => void): () => void  // 设置变了（托盘、悬浮窗、别的窗口）
  }
  app: {
    isSandbox: boolean
    showMain(): Promise<Result<null>>   // 显示并聚焦主窗口（悬浮窗里用）
  }
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
  tasksChanged: 'tasks:changed',
  settingsChanged: 'settings:changed',
  appIsSandbox: 'app:isSandbox',
  appShowMain: 'app:showMain'
} as const
