import './theme.css'

const DOTS = [8, 24, 40].flatMap((y) => [8, 24, 40].map((x) => [x, y]))

/** A loop drawn between dots. */
export function SlitherlinkIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <path d="M8 8h32v16H24v16H8z" fill="none" stroke="var(--sl-line)" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />
      {DOTS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill="var(--sl-dot)" />
      ))}
    </svg>
  )
}
