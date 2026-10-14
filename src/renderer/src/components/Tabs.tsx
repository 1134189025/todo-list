import type { TabKey } from '../lib/taskView'
import './Tabs.css'

type TabsProps = {
  active: TabKey
  counts: Record<TabKey, number>
  onChange: (tab: TabKey) => void
}

const ITEMS: { key: TabKey; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'later', label: '之后' }
]

export function Tabs({ active, counts, onChange }: TabsProps) {
  return (
    <div className="tabs" role="group" aria-label="待办范围">
      {ITEMS.map((item) => {
        const pressed = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            className={pressed ? 'tabs-item is-active' : 'tabs-item'}
            aria-pressed={pressed}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            <span className="tabs-count">{counts[item.key]}</span>
          </button>
        )
      })}
    </div>
  )
}
