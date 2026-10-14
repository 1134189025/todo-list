import type { ErrorCode } from '@shared/api'

/** 错误卡片的三种处理方式：可以存成一条 / 去设置 / 重新输入；取消的请求静默忽略。 */
export type AiErrorKind = 'retry' | 'settings' | 'reenter' | 'silent'

const TITLES: Partial<Record<ErrorCode, string>> = {
  NETWORK: 'AI 暂时连不上',
  TIMEOUT: 'AI 响应超时',
  SERVER: 'AI 服务出错了',
  RATE_LIMIT: '请求太频繁了',
  BAD_RESPONSE: 'AI 返回的内容看不懂',
  AUTH: 'API Key 有问题',
  NOT_CONFIGURED: '还没配置 AI 服务',
  SANDBOX_BLOCKED: '挡板模式不能连接这个地址',
  INVALID_INPUT: '这句话没法整理'
}

const KIND: Partial<Record<ErrorCode, AiErrorKind>> = {
  NETWORK: 'retry',
  TIMEOUT: 'retry',
  SERVER: 'retry',
  RATE_LIMIT: 'retry',
  BAD_RESPONSE: 'retry',
  AUTH: 'settings',
  NOT_CONFIGURED: 'settings',
  SANDBOX_BLOCKED: 'settings',
  CANCELLED: 'silent',
  INVALID_INPUT: 'reenter'
}

export function aiErrorKind(code: ErrorCode): AiErrorKind {
  return KIND[code] ?? 'reenter'
}

export function aiErrorTitle(code: ErrorCode): string {
  return TITLES[code] ?? '整理失败'
}
