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
