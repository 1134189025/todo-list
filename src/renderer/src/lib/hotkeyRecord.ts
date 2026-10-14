import { fromKeyboardEvent, validate, type KeyboardEventLike } from '@shared/accelerator'

export type RecordingAction =
  | { type: 'wait' }
  | { type: 'cancel' }
  | { type: 'clear' }
  | { type: 'invalid'; reason: string }
  | { type: 'set'; accelerator: string }

/** 设置里录制快捷键时，把一次按键翻译成要做的动作。 */
export function interpretRecordingKey(event: KeyboardEventLike): RecordingAction {
  if (event.code === 'Escape') return { type: 'cancel' }
  if (event.code === 'Backspace') return { type: 'clear' }
  const accelerator = fromKeyboardEvent(event)
  if (accelerator === null) return { type: 'wait' }
  const check = validate(accelerator)
  if (!check.ok) return { type: 'invalid', reason: check.reason }
  return { type: 'set', accelerator }
}
