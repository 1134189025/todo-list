import type { TaskPatch, TasksSnapshot } from './taskPatch'

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
  opacity: number        // 不透明度，FLOAT_OPACITY_MIN–1
}

/** 悬浮窗最低不透明度：再低就看不清字了。 */
export const FLOAT_OPACITY_MIN = 0.3

/** 胶囊窗口按内容向主进程申请的尺寸；主进程只接受这个范围里的整数，超出就忽略。 */
export type PillSize = { width: number; height: number }

export const PILL_SIZE_LIMITS = { minWidth: 120, maxWidth: 480, minHeight: 40, maxHeight: 240 } as const

/**
 * AI 接口格式：openai = OpenAI 兼容（{地址}/chat/completions）；
 * gemini = Gemini 原生（{地址}/v1beta/models/{模型}:generateContent），能传语音，并请求低思考档。
 */
export type AiApiFormat = 'openai' | 'gemini'

/** 一段录音：16 kHz 单声道 16 位 WAV 的 base64。 */
export type VoiceClip = { mimeType: 'audio/wav'; data: string; seconds: number }

/** AI 指令的输入：打的字，或一段录音。 */
export type CommandInput = { kind: 'text'; text: string } | { kind: 'audio'; clip: VoiceClip }

export type PublicSettings = {
  // hasApiKey：有可用的 Key；keyUnreadable：文件里有 Key 但解不开（换了电脑或系统账户），需要重新填写
  ai: { baseUrl: string; model: string; apiFormat: AiApiFormat; hasApiKey: boolean; keyUnreadable: boolean }
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
  ai?: { baseUrl: string; model: string; apiFormat?: AiApiFormat }   // apiFormat 不传 = 不改
  autoSummary?: { enabled: boolean; time: string }
  openAtLogin?: boolean
  voiceHotkey?: string | null   // 不合法返回 HOTKEY_INVALID；注册失败返回 HOTKEY_TAKEN 且保留旧的
  minimizeToTray?: boolean
  floatWindow?: Partial<FloatWindowSettings>   // 只改传了的字段
}

export type ParsedItem = { title: string; date: string | null; time: string | null }

/**
 * AI 指令识别出的一项操作。id 是真实任务 id（主进程已把编号映射回来）。
 * reschedule 里 date / time 不出现 = 不改；null = 清掉（date 为 null 时 time 也清掉）。
 */
export type AiAction =
  | { op: 'add'; item: ParsedItem }
  | { op: 'complete'; id: string }
  | { op: 'reopen'; id: string }
  | { op: 'reschedule'; id: string; date?: string | null; time?: string | null }
  | { op: 'rename'; id: string; title: string }
  | { op: 'delete'; id: string }

/**
 * unmatched：用户提到了、但在现有待办里对不上的说法。
 * heard：输入是语音时 AI 听写出的原话（没听写出来为 null）；输入是文字时为 null。
 * reply：AI 用助理口吻回的一句话（没有为 null）。
 */
export type AiCommandResult = { actions: AiAction[]; unmatched: string[]; heard: string | null; reply: string | null }

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
    // TasksSnapshot = { tasks, categories, revision }：任务和分类一起传、一起合并。
    // corruptBackup：本次启动备份出的坏文件名；skipped：本次启动跳过的不合法条数（任务和分类都算，整个文件损坏时为 0）
    load(): Promise<Result<TasksSnapshot & { corruptBackup: string | null; skipped: number }>>
    // 只发改动（见 taskPatch.ts），主进程合并到最新数据后返回合并结果；saveError 不为 null 表示已合并但写盘失败
    apply(patch: TaskPatch): Promise<Result<TasksSnapshot & { saveError: string | null }>>
  }
  settings: {
    get(): Promise<Result<PublicSettings>>
    save(patch: SettingsPatch): Promise<Result<PublicSettings>>
    setApiKey(key: string): Promise<Result<PublicSettings>>
    clearApiKey(): Promise<Result<PublicSettings>>
  }
  ai: {
    // 一句话（打字或一段录音）里的新建、完成、取消完成、改时间、改标题、删除，一次识别出来；
    // 录音只能走 Gemini 原生接口
    command(
      req: { requestId: string; text: string } | { requestId: string; audio: VoiceClip }
    ): Promise<Result<AiCommandResult>>
    summarize(req: { requestId: string }): Promise<Result<SummaryResult>>
    // draft 不传 = 用已保存的配置；draft.apiKey 不传 = 用已保存的 Key，
    // 但只在 draft 地址和已保存地址是同一个站点（协议 + 主机 + 端口）时才用，免得把 Key 发给另一家服务；
    // draft.apiFormat 不传 = 用已保存的格式
    testConnection(draft?: {
      baseUrl: string
      model: string
      apiFormat?: AiApiFormat
      apiKey?: string
    }): Promise<Result<{ model: string }>>
    cancel(requestId: string): Promise<Result<null>>
  }
  events: {
    onSummaryShow(cb: (s: SummaryResult) => void): () => void  // 返回取消订阅函数
    /**
     * 主进程让语音胶囊开始 / 结束录音（全局语音键、或悬浮窗的语音按钮）。
     * 只有胶囊页面订阅它：主窗口不再接收全局语音键，输入框左边的麦克风仍然自己录自己的。
     */
    onVoiceHotkey(cb: () => void): () => void
    onTasksChanged(cb: (snapshot: TasksSnapshot) => void): () => void  // 别的窗口改了任务或分类
    onSettingsChanged(cb: (s: PublicSettings) => void): () => void  // 设置变了（托盘、悬浮窗、别的窗口）
  }
  /** 语音胶囊页面专用的通道：主进程负责窗口的显示、位置和隐藏。 */
  voicePill: {
    /** 页面加载完、事件订阅就绪；主进程收到之前的触发会排队，这时再补发。 */
    ready(): Promise<Result<null>>
    /** 按当前内容申请窗口大小：宽 120–480、高 40–240 的整数，主进程保持底边不动向上长。 */
    resize(size: PillSize): Promise<Result<null>>
    /** 隐藏胶囊（录音中被隐藏 = 放弃这次录音）。 */
    hide(): Promise<Result<null>>
  }
  app: {
    isSandbox: boolean
    showMain(): Promise<Result<null>>   // 显示并聚焦主窗口（悬浮窗里用）
    toggleVoicePill(): Promise<Result<null>>   // 触发语音胶囊（悬浮窗的语音按钮）
  }
}

export const IPC = {
  tasksLoad: 'tasks:load',
  tasksApply: 'tasks:apply',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',
  aiCommand: 'ai:command',
  aiSummarize: 'ai:summarize',
  aiTestConnection: 'ai:testConnection',
  aiCancel: 'ai:cancel',
  summaryShow: 'summary:show',
  /** 主进程 → 胶囊页面：开始 / 结束录音（全局语音键、悬浮窗语音按钮）。 */
  voiceHotkey: 'voice:hotkey',
  voicePillReady: 'voicePill:ready',
  voicePillResize: 'voicePill:resize',
  voicePillHide: 'voicePill:hide',
  tasksChanged: 'tasks:changed',
  settingsChanged: 'settings:changed',
  appIsSandbox: 'app:isSandbox',
  appShowMain: 'app:showMain',
  appToggleVoicePill: 'app:toggleVoicePill'
} as const
