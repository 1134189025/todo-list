import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { CloseIcon } from './icons'
import './Dialog.css'

type DialogProps = {
  open: boolean
  title: string
  onRequestClose: () => void
  children: ReactNode
}

/**
 * 模态对话框：用原生 <dialog>.showModal()，背景自动 inert、焦点留在框内、Esc 触发关闭。
 * 打开 / 关闭由 open 决定；用户想关（Esc、关闭按钮、点遮罩）时调用 onRequestClose。
 */
export function Dialog({ open, title, onRequestClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pressStartedOnBackdrop = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal 默认把焦点给第一个按钮（关闭），会亮起焦点框；改为聚焦面板本身，按 Tab 再进入各个控件。
      panelRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleMouseDown(event: MouseEvent<HTMLDialogElement>): void {
    pressStartedOnBackdrop.current = event.target === event.currentTarget
  }

  // 只有按下和松开都在遮罩上才关闭；在框里拖选文字拖到外面松手不算。
  function handleClick(event: MouseEvent<HTMLDialogElement>): void {
    const endedOnBackdrop = event.target === event.currentTarget
    if (pressStartedOnBackdrop.current && endedOnBackdrop) onRequestClose()
    pressStartedOnBackdrop.current = false
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onRequestClose()
      }}
      // 浏览器在连续按 Esc 时可能不经 cancel 直接关掉对话框，这里把状态同步回去。
      onClose={() => {
        if (open) onRequestClose()
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div ref={panelRef} className="dialog-panel" tabIndex={-1}>
        <header className="dialog-header">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <button type="button" className="dialog-close" aria-label="关闭" onClick={onRequestClose}>
            <CloseIcon size={14} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  )
}
