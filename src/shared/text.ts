import { CATEGORY_NAME_MAX } from './types'

export const TITLE_MAX = 200

const HIGH_SURROGATE_MIN = 0xd800
const HIGH_SURROGATE_MAX = 0xdbff

// 标题规范化：先 trim，再按 UTF-16 长度截到 TITLE_MAX 以内（和 validate.ts 的 .length 检查一致，
// 且不把代理对切成半个），最后 trimEnd。这样渲染进程留下的标题和主进程校验后存下的完全一样；
// 否则截断后末尾是空格时两边对不上，总结会一直显示「待办有变化」。
export function truncateTitle(text: string): string {
  const trimmed = text.trim()
  let kept = trimmed
  if (trimmed.length > TITLE_MAX) {
    let end = TITLE_MAX
    const last = trimmed.charCodeAt(end - 1)
    if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) end -= 1
    kept = trimmed.slice(0, end)
  }
  return kept.trimEnd()
}

// 分类名规范化：trim、把连续空白（空格、制表符、换行等 \s）压成一个空格、再截到 CATEGORY_NAME_MAX
// 且不切开代理对、末尾不留空格。截断后为空（理论上不会，前面已经 trim 过）也算空名。
// 主进程存下的一定是规范化后的名字，所以两边的比较、去重都以它为准。
export function normalizeCategoryName(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= CATEGORY_NAME_MAX) return collapsed
  let end = CATEGORY_NAME_MAX
  const last = collapsed.charCodeAt(end - 1)
  if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) end -= 1
  return collapsed.slice(0, end).trimEnd()
}

/** 分类名是否算同一个：规范化后不区分大小写比较。 */
export function sameCategoryName(a: string, b: string): boolean {
  return normalizeCategoryName(a).toLowerCase() === normalizeCategoryName(b).toLowerCase()
}
