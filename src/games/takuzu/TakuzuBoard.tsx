import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { EMPTY, MOON, SUN, type Cell, type Hint, type Sign } from './takuzu'
import './TakuzuBoard.css'

interface TakuzuBoardProps {
  size: number
  givens: Cell[]
  signs: Sign[]
  cells: Cell[]
  /** Cells breaking a rule, marked in red. */
  problems: Set<number>
  hint: Hint | null
  lastMove: { cell: number; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  /** Moves a cell on: blank → sun → moon → blank, or backwards. */
  onCycle: (cell: number, backwards?: boolean) => void
  onSet: (cell: number, value: Cell) => void
}

const GAP = 0.08

export function SunMoon({ value }: { value: Cell }) {
  if (value === SUN) {
    return (
      <svg className="tk-symbol is-sun" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="5.2" fill="currentColor" />
      </svg>
    )
  }
  if (value === MOON) {
    return (
      <svg className="tk-symbol is-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.6 3.6A8.6 8.6 0 1 0 20.4 15 7 7 0 0 1 15.6 3.6z" fill="currentColor" />
      </svg>
    )
  }
  return null
}

const NAMES = { [EMPTY]: 'blank', [SUN]: 'sun', [MOON]: 'moon' } as const

export function TakuzuBoard({ size, givens, signs, cells, problems, hint, lastMove, gameId, won, locked, onCycle, onSet }: TakuzuBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const gridRef = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const side = area ? Math.floor(Math.min(area.width, area.height)) : 0
  const pitch = side / size
  const gap = pitch * GAP
  const focusable = focusIndex < cells.length ? focusIndex : 0
  const targets = new Map(hint?.kind === 'step' ? hint.step.cells.map((cell, i) => [cell, hint.step.values[i]]) : [])
  const clues = new Set(hint?.kind === 'step' ? hint.step.clues : [])
  const wrong = new Set(hint?.kind === 'wrong' ? hint.cells : [])

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target || locked) return
    const cell = Number(target.dataset.cell)
    if (!givens[cell]) onCycle(cell)
  }

  // Right-click goes the other way round, straight to a moon.
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target || locked) return
    const cell = Number(target.dataset.cell)
    if (!givens[cell]) onCycle(cell, true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target || event.ctrlKey || event.metaKey || event.altKey) return
    const cell = Number(target.dataset.cell)
    const key = event.key.toLowerCase()
    const value = { '1': SUN, '2': MOON, backspace: EMPTY, delete: EMPTY, '0': EMPTY }[key] as Cell | undefined
    if (value !== undefined) {
      event.preventDefault()
      if (!locked && !givens[cell]) onSet(cell, value)
      return
    }
    const row = Math.floor(cell / size)
    const column = cell % size
    const next = {
      arrowup: row > 0 ? cell - size : cell,
      arrowdown: row < size - 1 ? cell + size : cell,
      arrowleft: column > 0 ? cell - 1 : cell,
      arrowright: column < size - 1 ? cell + 1 : cell,
    }[key]
    if (next === undefined) return
    event.preventDefault()
    setFocusIndex(next)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus()
  }

  return (
    <div ref={areaRef} className="tk-area">
      {side > 0 && (
        <div
          key={gameId}
          ref={gridRef}
          className={`tk-board${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
          role="group"
          aria-label={`Takuzu grid, ${size} by ${size}`}
          style={{ width: side, height: side, '--size': size, '--pitch': `${pitch}px`, '--gap': `${gap}px` } as CSSProperties}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
        >
          {cells.map((value, cell) => {
            const className = [
              'tk-cell',
              givens[cell] && 'is-given',
              problems.has(cell) && 'is-problem',
              lastMove?.cell === cell && 'is-recent',
              targets.has(cell) && 'is-hint',
              clues.has(cell) && 'is-clue',
              wrong.has(cell) && 'is-wrong',
            ]
              .filter(Boolean)
              .join(' ')
            const row = Math.floor(cell / size)
            const column = cell % size
            return (
              <button
                key={cell}
                type="button"
                data-cell={cell}
                className={className}
                style={{ '--wave': row + column } as CSSProperties}
                tabIndex={cell === focusable ? 0 : -1}
                aria-label={`Row ${row + 1}, column ${column + 1}: ${NAMES[value]}${givens[cell] ? ', given' : ''}${problems.has(cell) ? ', breaks a rule' : ''}`}
                aria-disabled={locked || Boolean(givens[cell]) || undefined}
                onFocus={() => setFocusIndex(cell)}
              >
                <SunMoon key={`${cell}-${value}`} value={value} />
                {!value && targets.has(cell) && (
                  <span className="tk-ghost">
                    <SunMoon value={targets.get(cell)!} />
                  </span>
                )}
              </button>
            )
          })}
          {signs.map(({ a, b, same }) => {
            const across = b === a + 1
            const row = Math.floor(a / size)
            const column = a % size
            // Cells sit in the middle of their pitch, so the gap between two is on the pitch line.
            const x = across ? (column + 1) * pitch : (column + 0.5) * pitch
            const y = across ? (row + 0.5) * pitch : (row + 1) * pitch
            return (
              <span key={`${a}-${b}`} className="tk-sign" style={{ left: x, top: y }} aria-hidden="true">
                {same ? '=' : '×'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
