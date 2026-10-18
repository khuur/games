import './theme.css'

/** A crown on four coloured regions. */
export function QueensIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="4" y="4" width="20" height="20" rx="4" fill="var(--q-0)" />
      <rect x="24" y="4" width="20" height="20" rx="4" fill="var(--q-5)" />
      <rect x="4" y="24" width="20" height="20" rx="4" fill="var(--q-3)" />
      <rect x="24" y="24" width="20" height="20" rx="4" fill="var(--q-2)" />
      <path d="M11 33.5 9 17l9.5 7.5L24 13l5.5 11.5L39 17l-2 16.5z" fill="var(--q-crown)" />
      <rect x="11" y="35.5" width="26" height="4" rx="1.5" fill="var(--q-crown)" />
    </svg>
  )
}
