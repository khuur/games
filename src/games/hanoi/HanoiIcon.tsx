export function HanoiIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="21.5" y="6" width="5" height="36" rx="2.5" fill="var(--peg-mid)" />
      <rect x="14" y="13" width="20" height="8" rx="3.5" fill="#f0606b" />
      <rect x="9" y="22" width="30" height="8" rx="3.5" fill="#2fbf9b" />
      <rect x="4" y="31" width="40" height="8" rx="3.5" fill="#a77bf3" />
      <rect x="2" y="40" width="44" height="4" rx="2" fill="var(--base-top)" />
    </svg>
  )
}
