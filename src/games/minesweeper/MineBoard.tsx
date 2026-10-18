import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import type { GameStatus } from '../../hooks/useGameSession'
import type { Hint, LevelDefinition } from './minesweeper'
import './MineBoard.css'

interface MineBoardProps {
  level: LevelDefinition
  revealed: boolean[]
  flags: boolean[]
  counts: number[] | null
  mines: boolean[] | null
  status: GameStatus
  exploded: number | null
  hint: Hint | null
  lastOpen: { cell: number; id: number } | null
  gameId: number
  locked: boolean
  /** Taps plant flags (and long presses open) instead of the other way round. */
  flagMode: boolean
  /** Opens a hidden cell or chords a number. */
  onOpen: (cell: number) => void
  onFlag: (cell: number) => void
}

const MIN_CELL = 26
const MAX_CELL = 54
const LONG_PRESS_MS = 380

/**
 * The minefield. Boards are taller than wide; when the space is wider than tall they are shown
 * turned on their side (rows become columns), so cells stay as big as possible either way.
 */
export function MineBoard({
  level,
  revealed,
  flags,
  counts,
  mines,
  status,
  exploded,
  hint,
  lastOpen,
  gameId,
  locked,
  flagMode,
  onOpen,
  onFlag,
}: MineBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const [focusIndex, setFocusIndex] = useState(0)
  const press = useRef<{ cell: number; x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(
    null,
  )
  const lastPointer = useRef('mouse')

  const { columns, rows } = level
  const width = area?.width ?? 0
  const height = area?.height ?? 0
  const upright = Math.min(width / columns, height / rows)
  const sideways = Math.min(width / rows, height / columns)
  const turned = sideways > upright * 1.05
  const shownColumns = turned ? rows : columns
  const shownRows = turned ? columns : rows
  const cellSize = Math.floor(Math.max(MIN_CELL, Math.min(MAX_CELL, turned ? sideways : upright)))
  const gap = Math.max(2, Math.round(cellSize * 0.07))
  const size = cellSize - gap

  /** The board cell drawn at a position in reading order, and the other way round. */
  const cellAt = (index: number) => {
    const row = Math.floor(index / shownColumns)
    const column = index % shownColumns
    return turned ? column * columns + row : row * columns + column
  }
  const indexOf = (cell: number) => {
    const row = Math.floor(cell / columns)
    const column = cell % columns
    return turned ? column * shownColumns + row : row * shownColumns + column
  }

  const won = status === 'won'
  const lost = status === 'lost'
  const hintCells = new Set(hint?.cells)
  const clueCells = new Set(hint?.clues)
  const focusable = focusIndex < revealed.length ? focusIndex : 0

  const distance = (a: number, b: number) =>
    Math.max(Math.abs(Math.floor(a / columns) - Math.floor(b / columns)), Math.abs((a % columns) - (b % columns)))

  const cellOf = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>('[data-cell]') : null
    return element ? Number(element.dataset.cell) : null
  }

  const tap = (cell: number) => {
    if (flagMode && !revealed[cell]) onFlag(cell)
    else onOpen(cell)
  }

  const longPress = (cell: number) => {
    if (flagMode || revealed[cell]) onOpen(cell)
    else onFlag(cell)
  }

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    lastPointer.current = event.pointerType
    if (event.pointerType === 'mouse' || locked) return
    const cell = cellOf(event.target)
    if (cell === null) return
    cancelPress()
    const entry = {
      cell,
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: setTimeout(() => {
        entry.fired = true
        navigator.vibrate?.(15)
        longPress(cell)
      }, LONG_PRESS_MS),
    }
    press.current = entry
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current
    if (current && !current.fired && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 10) cancelPress()
  }

  const handlePointerUp = () => {
    // Keep a long press that fired, so the click that follows it is ignored.
    if (press.current && !press.current.fired) {
      clearTimeout(press.current.timer)
    }
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const cell = cellOf(event.target)
    if (cell === null) return
    const current = press.current
    press.current = null
    if (current?.fired || locked) return
    tap(cell)
  }

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Touch long presses are timed above; this is for the right mouse button.
    if (lastPointer.current !== 'mouse' || locked) return
    const cell = cellOf(event.target)
    if (cell !== null && !revealed[cell]) onFlag(cell)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cell = cellOf(event.target)
    if (cell === null || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      if (!locked) onFlag(cell)
      return
    }
    const index = indexOf(cell)
    const row = Math.floor(index / shownColumns)
    const column = index % shownColumns
    const target = {
      ArrowUp: row > 0 ? index - shownColumns : index,
      ArrowDown: row < shownRows - 1 ? index + shownColumns : index,
      ArrowLeft: column > 0 ? index - 1 : index,
      ArrowRight: column < shownColumns - 1 ? index + 1 : index,
      Home: row * shownColumns,
      End: row * shownColumns + shownColumns - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    setFocusIndex(target)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${cellAt(target)}"]`)?.focus()
  }

  const boardClass = ['mine-board', won && 'is-won', lost && 'is-lost', locked && 'is-locked', flagMode && 'is-flag-mode']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={areaRef} className="mine-area">
      {area && (
        <div
          key={gameId}
          className={boardClass}
          role="group"
          aria-label={`Minefield, ${shownColumns} by ${shownRows}`}
          style={
            {
              '--columns': shownColumns,
              '--cell': `${size}px`,
              '--gap': `${gap}px`,
            } as CSSProperties
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelPress}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
        >
          {revealed.map((_, index) => {
            const row = Math.floor(index / shownColumns)
            const column = index % shownColumns
            const cell = cellAt(index)
            const open = revealed[cell]
            const count = counts?.[cell] ?? 0
            const mine = Boolean(mines?.[cell])
            const flagged = flags[cell]
            const showMine = mine && ((lost && !flagged) || cell === exploded)
            const wrongFlag = lost && flagged && !mine

            let label = 'hidden'
            if (showMine) label = cell === exploded ? 'mine, exploded' : 'mine'
            else if (wrongFlag) label = 'flag, wrong'
            else if (flagged) label = 'flagged'
            else if (open) label = count ? String(count) : 'empty'
            if (hintCells.has(cell)) label += hint?.kind === 'safe' ? ', safe' : hint?.kind === 'mine' ? ', a mine' : ', wrong flag'

            const className = [
              'mine-cell',
              open && 'is-open',
              open && count > 0 && `is-number n${count}`,
              flagged && 'is-flagged',
              showMine && 'is-mine',
              cell === exploded && 'is-exploded',
              wrongFlag && 'is-wrong',
              hintCells.has(cell) && `is-hint-${hint?.kind}`,
              clueCells.has(cell) && 'is-clue',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={cell}
                type="button"
                data-cell={cell}
                className={className}
                style={
                  {
                    '--ripple': lastOpen ? Math.min(14, distance(cell, lastOpen.cell)) : 0,
                    '--blast': exploded === null ? 0 : distance(cell, exploded),
                    '--wave': row + column,
                  } as CSSProperties
                }
                tabIndex={index === focusable ? 0 : -1}
                aria-label={`Row ${row + 1}, column ${column + 1}: ${label}`}
                aria-disabled={locked || undefined}
                onFocus={() => setFocusIndex(index)}
              >
                {open && count > 0 && !showMine && count}
                {flagged && !open && <FlagIcon />}
                {showMine && <MineIcon />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FlagIcon() {
  return (
    <svg className="mine-flag" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3.8v15.7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 4.2h9.2l-2.5 3.6 2.5 3.6H9z" fill="var(--mine-flag)" />
      <path d="M5 19.8h7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function MineIcon() {
  return (
    <svg className="mine-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6v3M12 17.4v3M3.6 12h3M17.4 12h3M6.1 6.1l2.1 2.1M15.8 15.8l2.1 2.1M6.1 17.9l2.1-2.1M15.8 8.2l2.1-2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="5.6" fill="currentColor" />
      <circle cx="10.1" cy="10.1" r="1.5" fill="var(--mine-shine)" />
    </svg>
  )
}
