import './theme.css'

/** A heart drawn in a 5×5 grid of cells. */
const HEART = ['.#.#.', '#####', '#####', '.###.', '..#..'].join('')

export function NonogramIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      {[...HEART].map((cell, index) => (
        <rect
          key={index}
          x={4 + (index % 5) * 8.2}
          y={4 + Math.floor(index / 5) * 8.2}
          width="7"
          height="7"
          rx="1.6"
          fill={cell === '#' ? '#e5484d' : 'var(--nono-line)'}
        />
      ))}
    </svg>
  )
}
