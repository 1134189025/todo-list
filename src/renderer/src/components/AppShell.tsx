import type { ReactNode } from 'react'
import './AppShell.css'

type AppShellProps = {
  /** 列表区域：标题、小结条、标签页、任务列表。内容多了在这里滚动。 */
  main: ReactNode
  /** 底部输入区：始终贴在窗口底部，不随列表滚动。 */
  composer: ReactNode
  /** 右侧总结栏；null = 不显示。窗口较窄时改为盖在列表上方。 */
  drawer: ReactNode | null
  drawerLabel?: string
}

export function AppShell({ main, composer, drawer, drawerLabel }: AppShellProps) {
  return (
    <div className="shell">
      <div className="shell-main">
        <div className="shell-scroll">
          <main className="shell-content">{main}</main>
        </div>
        <div className="shell-composer">{composer}</div>
      </div>
      {drawer !== null && (
        <aside className="shell-drawer" aria-label={drawerLabel}>
          {drawer}
        </aside>
      )}
    </div>
  )
}
