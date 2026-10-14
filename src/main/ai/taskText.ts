// 发给 AI 的待办文字：一条一行、日期写短，省输入长度。

/** 标题里的换行、制表符压成一个空格，一条待办只占一行。 */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 'YYYY-MM-DD' → 'MM-DD'。 */
export function shortDate(dateKey: string): string {
  return dateKey.slice(5)
}

/** 把 AI 回的编号（数字或数字字符串）转成 1 起的整数；不是就返回 null。 */
export function readNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  return Number.isInteger(number) && number >= 1 ? number : null
}
