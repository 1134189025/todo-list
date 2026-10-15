import { URGENCIES, type Urgency } from '@shared/types'
import { URGENCY_LABEL } from '../lib/urgency'
import { FlagIcon } from './icons'
import './UrgencyChoice.css'

type UrgencyChoiceProps = {
  value: Urgency
  onChange: (urgency: Urgency) => void
}

/** 紧急度三选一：紧急 / 普通 / 不急。 */
export function UrgencyChoice({ value, onChange }: UrgencyChoiceProps) {
  return (
    <div className="urgency-choice" role="group" aria-label="紧急度">
      {URGENCIES.map((urgency) => {
        const pressed = urgency === value
        return (
          <button
            key={urgency}
            type="button"
            className={pressed ? 'urgency-choice-item is-on' : 'urgency-choice-item'}
            aria-pressed={pressed}
            onClick={() => onChange(urgency)}
          >
            {urgency === 'high' && <FlagIcon size={12} />}
            {URGENCY_LABEL[urgency]}
          </button>
        )
      })}
    </div>
  )
}
