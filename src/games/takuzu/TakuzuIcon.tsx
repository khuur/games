import './theme.css'

/** A sun and a moon, the puzzle's two symbols. */
export function TakuzuIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <path
        d="M16 3.5v3.5M16 25v3.5M3.5 16H7M25 16h3.5M7.2 7.2l2.4 2.4M22.4 22.4l2.4 2.4M7.2 24.8l2.4-2.4M22.4 9.6l2.4-2.4"
        stroke="var(--tk-sun)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="6.6" fill="var(--tk-sun)" />
      <path d="M36.5 21.5a12.5 12.5 0 1 0 7.8 16.3 10 10 0 0 1-7.8-16.3z" fill="var(--tk-moon)" />
    </svg>
  )
}
