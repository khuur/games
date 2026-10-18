const ROW_COLORS = ['#f0606b', '#2fbf9b', '#a77bf3']

/** A 3×3 tray of tiles, coloured by row, with the gap in the corner. */
export function FifteenIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="9" fill="var(--surface-sunken)" />
      {Array.from({ length: 8 }, (_, cell) => (
        <rect
          key={cell}
          x={5 + (cell % 3) * 13.5}
          y={5 + Math.floor(cell / 3) * 13.5}
          width="11"
          height="11"
          rx="3"
          fill={ROW_COLORS[Math.floor(cell / 3)]}
        />
      ))}
    </svg>
  )
}
