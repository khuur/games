import '../latin/theme.css'

/** A small grid cut into cages, each with its sign. */
export function CalcudokuIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="var(--lt-cell)" />
      <path d="M17.3 6v36M30.7 6v36M6 17.3h36M6 30.7h36" stroke="var(--lt-thin)" strokeWidth="2" />
      <path d="M17.3 4v26.7M4 30.7h26.7M30.7 17.3h13.3M30.7 17.3V44" stroke="var(--lt-cage)" strokeWidth="3" fill="none" />
      <rect x="4" y="4" width="40" height="40" rx="8" fill="none" stroke="var(--lt-line)" strokeWidth="3" />
      <g stroke="var(--lt-entry)" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M7.4 10.7h6.5M10.7 7.4v6.5" />
        <path d="M34.6 7.6l5.4 5.4M40 7.6l-5.4 5.4" />
        <path d="M7.4 37.4h6.5" />
        <path d="M34.2 37.4h6.6" />
      </g>
      <g fill="var(--lt-entry)">
        <circle cx="37.5" cy="33.9" r="1.4" />
        <circle cx="37.5" cy="40.9" r="1.4" />
      </g>
    </svg>
  )
}
