import { formatHeaderDate } from '../lib/labels'
import { LeafIcon } from './icons'
import './Header.css'

type HeaderProps = {
  today: string
  done: number
  total: number
}

export function Header({ today, done, total }: HeaderProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <header className="header">
      <div className="header-titles">
        <p className="header-date">{formatHeaderDate(today)}</p>
        <h1 className="header-title">
          今天也慢慢来
          <LeafIcon size={24} className="header-leaf" />
        </h1>
      </div>
      <section className="header-progress" aria-label="今日进度">
        <div className="header-progress-text">
          <span>今日完成</span>
          <span className="header-progress-count">
            {done} / {total}
          </span>
        </div>
        <div className="header-track">
          <div className="header-bar" style={{ width: `${percent}%` }} />
        </div>
      </section>
    </header>
  )
}
