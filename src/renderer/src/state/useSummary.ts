import { useCallback, useRef, useState } from 'react'
import type { SummaryResult } from '@shared/api'
import { tasksFingerprint } from '@shared/fingerprint'
import type { Task } from '@shared/types'
import { callApi } from '../lib/callApi'

export type SummaryController = {
  summary: SummaryResult | null
  loading: boolean
  error: string | null
  /** 结果是新鲜的：生成之后任务没有变过。 */
  fresh: boolean
  generate: () => void
  cancel: () => void
  /** 收到主进程推来的总结（每晚自动总结），直接显示，不重新请求。 */
  receive: (summary: SummaryResult) => void
}

export function useSummary(tasks: Task[] | null): SummaryController {
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<string | null>(null)

  const fresh = summary !== null && tasks !== null && summary.tasksFingerprint === tasksFingerprint(tasks)

  const generate = useCallback((): void => {
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setLoading(true)
    setError(null)
    void callApi(() => window.api.ai.summarize({ requestId })).then((result) => {
      if (requestRef.current !== requestId) return
      requestRef.current = null
      setLoading(false)
      if (result.ok) {
        setSummary(result.data)
        return
      }
      if (result.error.code === 'CANCELLED') return
      setError(result.error.message)
    })
  }, [])

  const cancel = useCallback((): void => {
    const requestId = requestRef.current
    if (requestId === null) return
    requestRef.current = null
    setLoading(false)
    void callApi(() => window.api.ai.cancel(requestId))
  }, [])

  const receive = useCallback((next: SummaryResult): void => {
    requestRef.current = null
    setLoading(false)
    setError(null)
    setSummary(next)
  }, [])

  return { summary, loading, error, fresh, generate, cancel, receive }
}
