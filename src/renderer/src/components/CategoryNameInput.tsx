import { useId, useState, type KeyboardEvent } from 'react'
import type { NameCheck } from '../lib/categoryOps'
import './CategoryNameInput.css'

type CategoryNameInputProps = {
  /** 输入框里的初始名字（改名时用）。 */
  initial?: string
  label: string
  placeholder: string
  /** 检查名字（不保存）：不合法时在输入框下面给一句原因。 */
  check: (raw: string) => NameCheck
  /** 保存：返回 null 表示保存成功（由调用方收起输入框）；返回字符串则把它显示为原因。 */
  onSave: (name: string) => string | null
  onCancel: () => void
}

/** 行内输入分类名：Enter 保存，Esc 取消，空的时候失焦也取消。 */
export function CategoryNameInput({ initial = '', label, placeholder, check, onSave, onCancel }: CategoryNameInputProps) {
  const hintId = useId()
  const [value, setValue] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const result = check(value)
  // 没输入过且为空时不提示；输入过或按过回车后，不合法的原因都显示在下面。
  const hint =
    saveError ?? (attempted || value.trim() !== '' ? (result.ok ? null : result.message) : null)

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      // 停止冒泡，免得外层浮层跟着一起关掉。
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Enter') return
    event.preventDefault()
    setAttempted(true)
    if (!result.ok) return
    const error = onSave(result.name)
    if (error !== null) setSaveError(error)
  }

  return (
    <div className="category-name-input">
      <input
        type="text"
        className="category-name-field"
        aria-label={label}
        aria-invalid={hint !== null}
        aria-describedby={hint === null ? undefined : hintId}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setSaveError(null)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (value.trim() === '') onCancel()
        }}
      />
      {hint !== null && (
        <p id={hintId} className="category-name-hint" aria-live="polite">
          {hint}
        </p>
      )}
    </div>
  )
}
