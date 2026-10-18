interface ChoiceGroupProps<T extends string> {
  /** Names the group for screen readers, e.g. "Board". */
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** A row of mutually exclusive toggle buttons, for levels that have names rather than numbers. */
export function ChoiceGroup<T extends string>({ label, options, value, onChange }: ChoiceGroupProps<T>) {
  return (
    <div className="choice-group" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="choice"
          aria-pressed={option.value === value}
          onClick={() => {
            if (option.value !== value) onChange(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
