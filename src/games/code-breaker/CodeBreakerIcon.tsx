import './theme.css'

/** Three coloured pegs and a cluster of marks, like one row of the board. */
export function CodeBreakerIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <circle cx="13" cy="13" r="9" fill="#e5484d" />
      <circle cx="35" cy="13" r="9" fill="#3b7bf6" />
      <circle cx="13" cy="35" r="9" fill="#f5c21b" />
      <circle cx="30.5" cy="30.5" r="4" fill="var(--code-mark)" />
      <circle cx="39.5" cy="30.5" r="4" fill="var(--code-mark)" />
      <circle cx="30.5" cy="39.5" r="3.1" fill="none" stroke="var(--code-mark)" strokeWidth="1.8" />
      <circle cx="39.5" cy="39.5" r="4" fill="var(--code-hole)" />
    </svg>
  )
}
