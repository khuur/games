import './theme.css'

/** Three islands: a double bridge across and a single one down. */
export function BridgesIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <path d="M13 9.5h22M13 16.5h22M11 15v20" stroke="var(--br-bridge)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="11" cy="13" r="7.5" fill="var(--br-island)" stroke="var(--br-island-edge)" strokeWidth="2.5" />
      <circle cx="37" cy="13" r="7.5" fill="var(--br-done)" stroke="var(--br-done-edge)" strokeWidth="2.5" />
      <circle cx="11" cy="37" r="7.5" fill="var(--br-island)" stroke="var(--br-island-edge)" strokeWidth="2.5" />
    </svg>
  )
}
