import './theme.css'

/** A small cross of pegs with the centre hole empty. */
export function PegIcon() {
  const holes: [number, number][] = []
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      if ((row >= 1 && row <= 3) || (column >= 1 && column <= 3)) holes.push([row, column])
    }
  }
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="var(--plate-light)" />
      {holes.map(([row, column]) => {
        const center = row === 2 && column === 2
        return (
          <circle
            key={`${row}-${column}`}
            cx={8 + column * 8}
            cy={8 + row * 8}
            r={center ? 2.2 : 3.2}
            fill={center ? 'var(--pit)' : '#3b82f6'}
          />
        )
      })}
    </svg>
  )
}
