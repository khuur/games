/** A small grid with a few digits, the middle one picked out. */
export function SudokuIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="var(--sudoku-cell)" />
      <rect x="18" y="18" width="12" height="12" rx="2" fill="var(--sudoku-selected)" />
      <path d="M17.3 6v36M30.7 6v36M6 17.3h36M6 30.7h36" stroke="var(--sudoku-thin)" strokeWidth="2" />
      <rect x="4" y="4" width="40" height="40" rx="8" fill="none" stroke="var(--sudoku-line)" strokeWidth="3" />
      <g fontSize="11" fontWeight="900" textAnchor="middle" fontFamily="inherit">
        <text x="10.8" y="15" fill="var(--sudoku-given)">
          1
        </text>
        <text x="24" y="28.3" fill="var(--sudoku-entry)">
          5
        </text>
        <text x="37.2" y="41.6" fill="var(--sudoku-given)">
          9
        </text>
      </g>
    </svg>
  )
}
