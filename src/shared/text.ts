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

// 看不见的字符一律去掉：格式字符（\p{Cf}，方向控制符会把引语整段镜像，零宽空格、标签字符会藏字）
// 和默认可忽略的字符（\p{Default_Ignorable_Code_Point}：变体选择符、组合字形连接符、韩文填充字符等，
// 夹在字中间看不出来，一串就能藏数据）。
// 只留组合 emoji 要用的：真有的三面地区旗（英格兰、苏格兰、威尔士）的整段标签、两个 emoji 之间的零宽连接符，
// 紧跟在图形 emoji（\p{Extended_Pictographic}，含 ©、™、☀ 这类）后面的一个 FE0E / FE0F（表情和文字两种样子），
// 以及 keycap（0–9 # * 后面 FE0F 再接 U+20E3）里的 FE0F。
// 跟在汉字、普通数字、空格后面或连着好几个的都去掉：逐字夹一个也能藏数据。剩下的每一位都要一个看得见的 emoji 来带。
const HIDDEN_CHARS =
  /(\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F})|((?<=[\p{Extended_Pictographic}\u{FE0F}\u{1F3FB}-\u{1F3FF}])\u{200D}(?=\p{Extended_Pictographic}))|((?<=\p{Extended_Pictographic})[\u{FE0E}\u{FE0F}]|(?<=[0-9#*])\u{FE0F}(?=\u{20E3}))|[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu
// 盲文空白看起来是空格、却不算空白字符：只有它时也当没听清；分类名里也去掉。
const BRAILLE_BLANK = /\u{2800}/gu
const VISIBLE_CHAR = /[\p{L}\p{N}\p{P}\p{S}]/u
const CONTROL_CHAR = /\p{Cc}/gu

/** 去掉看不见的字符，空白不动。组合 emoji 要用的 ZWJ、FE0F、旗帜标签保留。 */
export function stripHidden(text: string): string {
  return text.replace(HIDDEN_CHARS, (char, flag?: string, joiner?: string, presentation?: string) =>
    flag !== undefined || joiner !== undefined || presentation !== undefined ? char : ''
  )
}

/** 有没有一个看得见的字（字母、数字、标点、符号）。盲文空白不算。 */
export function hasVisibleChar(text: string): boolean {
  return VISIBLE_CHAR.test(text.replace(BRAILLE_BLANK, ''))
}

// 分类名整理（不截断）：先去看不见的字符和盲文空白；控制字符里的空白（制表符、换行）当空格，
// 其它控制字符去掉；压成一个空格，trim。
export function tidyCategoryName(raw: string): string {
  return stripHidden(raw)
    .replace(BRAILLE_BLANK, '')
    .replace(CONTROL_CHAR, (char) => (/\s/u.test(char) ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim()
}

// 分类名规范化：先整理（见 tidyCategoryName），超过 CATEGORY_NAME_MAX 就截断（不切开代理对），
// 截断后再整理一次（末尾不留空格，也不留只剩下的零宽连接符之类）。没有一个看得见的字就返回 ''。
// 主进程存下的一定是规范化后的名字，所以两边的比较、去重都以它为准。
export function normalizeCategoryName(raw: string): string {
  const tidy = tidyCategoryName(raw)
  let kept = tidy
  if (tidy.length > CATEGORY_NAME_MAX) {
    let end = CATEGORY_NAME_MAX
    const last = tidy.charCodeAt(end - 1)
    if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) end -= 1
    kept = tidyCategoryName(tidy.slice(0, end))
  }
  return hasVisibleChar(kept) ? kept : ''
}

/** 分类名是否算同一个：规范化后不区分大小写比较。空名字（规范化后为 ''）不和任何名字相同。 */
export function sameCategoryName(a: string, b: string): boolean {
  const left = normalizeCategoryName(a)
  return left !== '' && left.toLowerCase() === normalizeCategoryName(b).toLowerCase()
}
