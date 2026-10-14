import { useEffect, useState } from 'react'
import { toDateKey } from '@shared/dates'

const REFRESH_MS = 60_000

/** 本地日期（YYYY-MM-DD）。每 60 秒和窗口重新获得焦点时重算，跨午夜自动切换。 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()))

  useEffect(() => {
    function refresh(): void {
      const next = toDateKey(new Date())
      setToday((current) => (current === next ? current : next))
    }
    const timer = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
