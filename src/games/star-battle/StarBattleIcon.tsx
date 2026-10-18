import './theme.css'

const STAR = 'M0 -9.5 2.8 -3.4 9.3 -2.6 4.5 1.8 5.8 8.3 0 5 -5.8 8.3 -4.5 1.8 -9.3 -2.6 -2.8 -3.4z'

/** Two stars on coloured regions. */
export function StarBattleIcon() {
  return (
    <svg className="game-icon" viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
      <path d="M8 4h16v18H4V8a4 4 0 0 1 4-4z" fill="var(--sb-5)" />
      <path d="M24 4h16a4 4 0 0 1 4 4v22H24z" fill="var(--sb-7)" />
      <path d="M4 22h20v8h20v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="var(--sb-3)" />
      <path d={STAR} transform="translate(14.5 14) scale(0.95)" fill="var(--sb-star)" stroke="var(--sb-star-edge)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d={STAR} transform="translate(33.5 35) scale(0.95)" fill="var(--sb-star)" stroke="var(--sb-star-edge)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
