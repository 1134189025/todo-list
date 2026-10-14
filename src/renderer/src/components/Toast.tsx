import { CheckIcon } from './icons'
import './Toast.css'

type ToastProps = {
  message: string
  onUndo?: () => void
}

export function Toast({ message, onUndo }: ToastProps) {
  return (
    <div className="toast" role="status">
      <div className="toast-pill">
        <CheckIcon size={16} strokeWidth={2.4} className="toast-check" />
        <span className="toast-message">{message}</span>
        {onUndo !== undefined && (
          <button type="button" className="toast-undo" onClick={onUndo}>
            撤销
          </button>
        )}
      </div>
    </div>
  )
}
