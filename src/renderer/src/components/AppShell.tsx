import type { ReactNode } from 'react'
import './AppShell.css'

type AppShellProps = {
  /** 左栏：待办范围和今日进度。窗口窄时隐藏。 */
  nav: ReactNode
  /** 中间：标题、小结条、任务列表。内容多了在这里滚动。 */
  main: ReactNode
  /** 右栏：AI 助理（对话、今日总结、输入框）。窗口很窄时挪到列表下面。 */
  assistant: ReactNode
}

export function AppShell({ nav, main, assistant }: AppShellProps) {
  return (
    <div className="shell">
      <div className="shell-nav">{nav}</div>
      <div className="shell-main">
        <div className="shell-scroll">
          <main className="shell-content">{main}</main>
        </div>
      </div>
      {assistant}
    </div>
  )
}
