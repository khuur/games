import './theme.css'

const LIT = new Set([1, 3, 4, 5, 7])

/** A 3×3 grid with the plus shape a single press flips. */
export function LightsOutIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      {Array.from({ length: 9 }, (_, cell) => (
        <rect
          key={cell}
          x={4 + (cell % 3) * 14.5}
          y={4 + Math.floor(cell / 3) * 14.5}
          width="11.5"
          height="11.5"
          rx="3"
          fill={LIT.has(cell) ? '#ffc53d' : 'var(--light-off-bottom)'}
        />
      ))}
    </svg>
  )
}
