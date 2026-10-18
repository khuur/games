import { Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'

interface StepperProps {
  /** Names the control for screen readers, e.g. "Number of disks". */
  label: string
  value: number
  min: number
  max: number
  decreaseLabel: string
  increaseLabel: string
  onChange: (value: number) => void
  /** How the value is shown. */
  children: ReactNode
}

export function Stepper({ label, value, min, max, decreaseLabel, increaseLabel, onChange, children }: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="button stepper-button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={decreaseLabel}
        title={decreaseLabel}
      >
        <Minus aria-hidden="true" />
      </button>
      <span className="stepper-value">{children}</span>
      <button
        type="button"
        className="button stepper-button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={increaseLabel}
        title={increaseLabel}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  )
}
