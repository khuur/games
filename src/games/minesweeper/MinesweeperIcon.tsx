/** A mine, with a red flag planted beside it. */
export function MinesweeperIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <path
        d="M20 7v6M20 35v6M3 24h6M31 24h6M8 12l4.2 4.2M27.8 31.8L32 36M8 36l4.2-4.2M27.8 16.2L32 12"
        stroke="var(--mine-body)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <circle cx="20" cy="24" r="11" fill="var(--mine-body)" />
      <circle cx="16.3" cy="20.3" r="3" fill="var(--mine-shine)" />
      <path d="M36 6v20" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <path d="M37.5 6.5H46l-3.2 4.8L46 16h-8.5z" fill="var(--mine-flag)" />
    </svg>
  )
}
