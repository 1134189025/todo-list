import { fail } from '@shared/result'
import type { Result } from '@shared/api'

/** 调用 window.api：异常也转成 ok:false，让界面把错误原样显示出来。 */
export async function callApi<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run()
  } catch {
    return fail('IO', '操作失败，请稍后重试')
  }
}
