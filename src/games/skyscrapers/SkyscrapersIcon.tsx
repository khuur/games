import './theme.css'

/** Three towers of different heights on a street. */
export function SkyscrapersIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="5" y="25" width="11" height="18" rx="2" fill="var(--sky-low)" />
      <rect x="18.5" y="6" width="11" height="37" rx="2" fill="var(--sky-high)" />
      <rect x="32" y="16" width="11" height="27" rx="2" fill="var(--sky-mid)" />
      <path
        d="M8.5 30h4M8.5 35h4M22 11h4M22 16h4M22 21h4M22 26h4M22 31h4M22 36h4M35.5 21h4M35.5 26h4M35.5 31h4M35.5 36h4"
        stroke="var(--sky-window)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M3 44.5h42" stroke="var(--sky-ground)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
