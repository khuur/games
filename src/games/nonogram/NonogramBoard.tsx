import { Square, X } from 'lucide-react'
import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { EMPTY, FILLED, UNKNOWN, type CellState, type Hint, type LevelDefinition } from './nonogram'
import './NonogramBoard.css'

interface NonogramBoardProps {
  level: LevelDefinition
  clues: number[][]
  cells: CellState[]
  wrong: boolean[]
  solution: boolean[]
  hint: Hint | null
  lastMove: { cells: number[]; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  /** Taps cross cells out instead of filling them. */
  crossMode: boolean
  onToggleMode: () => void
  /**
   * Marks cells: those that are `from` become `to`. Calls from one drag share a `stroke`.
   * Returns false when the drag should stop (it hit a mistake).
   */
  onMark: (cells: number[], from: CellState, to: CellState, stroke: number) => boolean
}

const CLUE_GAP = 6
/** A clue number's share of a cell, across and down. */
const CLUE = 0.62
const MAX_CELL = 44
/** The corner above the row clues holds the fill/cross switch, so it never gets smaller than this. */
const CORNER_WIDTH = 66
const CORNER_HEIGHT = 36
const LONG_PRESS_MS = 380

type Point = { row: number; column: number }

interface Stroke {
  id: number
  from: CellState
  to: CellState
  anchor: Point
  axis: 'row' | 'column' | null
  last: Point
  done: Set<number>
}

/** A finger that has touched down but not yet decided between a tap, a drag and a long press. */
interface Touch {
  point: Point
  timer: ReturnType<typeof setTimeout>
}

/**
 * The puzzle: column clues above, row clues to the left, and the grid. Tall puzzles are shown
 * turned on their side when the space is wide (rows become columns, clues and all).
 */
export function NonogramBoard({
  level,
  clues,
  cells,
  wrong,
  solution,
  hint,
  lastMove,
  gameId,
  won,
  locked,
  crossMode,
  onToggleMode,
  onMark,
}: NonogramBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const gridRef = useRef<HTMLDivElement>(null)
  const stroke = useRef<Stroke | null>(null)
  const touch = useRef<Touch | null>(null)
  const strokes = useRef(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const { columns, rows } = level
  const runs = (lines: number[]) => Math.max(1, ...lines.map((line) => clues[line]?.length ?? 1))
  const rowLines = Array.from({ length: rows }, (_, row) => row)
  const columnLines = Array.from({ length: columns }, (_, column) => rows + column)
  /** The biggest cell size that fits, with clues (and the corner) beside and above the grid. */
  const fit = (across: number, down: number, leftRuns: number, topRuns: number) => {
    const width = (area?.width ?? 0) - CLUE_GAP - 6
    const height = (area?.height ?? 0) - CLUE_GAP - 6
    return Math.min(
      width / (across + CLUE * leftRuns),
      (width - CORNER_WIDTH) / across,
      height / (down + CLUE * topRuns),
      (height - CORNER_HEIGHT) / down,
    )
  }
  const upright = fit(columns, rows, runs(rowLines), runs(columnLines))
  const sideways = fit(rows, columns, runs(columnLines), runs(rowLines))
  const turned = columns !== rows && sideways > upright * 1.05
  const size = Math.floor(Math.min(MAX_CELL, turned ? sideways : upright))
  const shownColumns = turned ? rows : columns
  const shownRows = turned ? columns : rows
  /** The puzzle line shown as each row and column on screen. */
  const shownRowLines = turned ? columnLines : rowLines
  const shownColumnLines = turned ? rowLines : columnLines
  const cellAt = (row: number, column: number) => (turned ? column * columns + row : row * columns + column)
  const positionOf = (cell: number): Point => {
    const row = Math.floor(cell / columns)
    const column = cell % columns
    return turned ? { row: column, column: row } : { row, column }
  }

  const left = Math.max(CORNER_WIDTH, runs(shownRowLines) * size * CLUE + 6)
  const top = Math.max(CORNER_HEIGHT, runs(shownColumnLines) * size * CLUE + 6)
  const lineDone = (line: number) => {
    const lineCells =
      line < rows
        ? Array.from({ length: columns }, (_, column) => line * columns + column)
        : Array.from({ length: rows }, (_, row) => row * columns + (line - rows))
    return lineCells.every((cell) => (cells[cell] === FILLED) === solution[cell])
  }
  const hintLine = hint?.kind === 'line' ? hint.line : null
  const hintMarks = new Map(hint?.kind === 'line' ? hint.cells.map((cell, i) => [cell, hint.states[i]]) : [])
  const wrongCrosses = new Set(hint?.kind === 'wrong-cross' ? hint.cells : [])
  const recent = new Set(lastMove?.cells)
  const cursorAt = cursor === null ? null : positionOf(cursor)
  const focusable = focusIndex < cells.length ? focusIndex : 0

  /** The grid position under a pointer, kept inside the grid. */
  const pointAt = (event: PointerEvent): Point => {
    const rect = gridRef.current!.getBoundingClientRect()
    return {
      row: Math.max(0, Math.min(shownRows - 1, Math.floor((event.clientY - rect.top) / size))),
      column: Math.max(0, Math.min(shownColumns - 1, Math.floor((event.clientX - rect.left) / size))),
    }
  }

  /** What a stroke starting on this cell does: fill or cross blank cells, or clear marks like its own. */
  const planFor = (cell: number, crossing: boolean): { from: CellState; to: CellState } | null => {
    if (wrong[cell]) return null
    const mark = cells[cell]
    if (mark === UNKNOWN) return { from: UNKNOWN, to: crossing ? EMPTY : FILLED }
    return { from: mark, to: UNKNOWN }
  }

  /** Starts a stroke on a cell, marking it. */
  const startStroke = (point: Point, crossing: boolean) => {
    const cell = cellAt(point.row, point.column)
    const plan = planFor(cell, crossing)
    if (!plan) return
    stroke.current = { id: ++strokes.current, ...plan, anchor: point, axis: null, last: point, done: new Set([cell]) }
    setFocusIndex(cell)
    if (!onMark([cell], plan.from, plan.to, stroke.current.id)) stroke.current = null
  }

  /** Marks the cells from the stroke's last position up to a new one, so quick drags skip nothing. */
  const paintTo = (point: Point) => {
    const current = stroke.current
    if (!current) return
    let { row, column } = point
    if (!current.axis && (row !== current.anchor.row || column !== current.anchor.column)) {
      current.axis = Math.abs(row - current.anchor.row) > Math.abs(column - current.anchor.column) ? 'column' : 'row'
    }
    if (current.axis === 'row') row = current.anchor.row
    if (current.axis === 'column') column = current.anchor.column
    const path: number[] = []
    const steps = Math.max(Math.abs(row - current.last.row), Math.abs(column - current.last.column))
    for (let i = 1; i <= steps; i++) {
      const r = current.last.row + Math.round(((row - current.last.row) * i) / steps)
      const c = current.last.column + Math.round(((column - current.last.column) * i) / steps)
      const cell = cellAt(r, c)
      if (!current.done.has(cell)) {
        current.done.add(cell)
        path.push(cell)
      }
    }
    current.last = { row, column }
    if (path.length && !onMark(path, current.from, current.to, current.id)) stroke.current = null
  }

  const settleTouch = () => {
    if (touch.current) clearTimeout(touch.current.timer)
    touch.current = null
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2)) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone; the stroke still works without capture.
    }
    const point = pointAt(event)
    if (event.pointerType !== 'touch') {
      // Mouse and pen mark right away; the right button does the opposite of what taps do.
      startStroke(point, crossMode !== (event.button === 2))
      return
    }
    // A finger waits a moment: moving on makes it a drag, holding still makes it a long press,
    // which marks the other way (crosses, when taps fill).
    settleTouch()
    touch.current = {
      point,
      timer: setTimeout(() => {
        touch.current = null
        navigator.vibrate?.(15)
        startStroke(point, !crossMode)
      }, LONG_PRESS_MS),
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointAt(event)
    if (event.pointerType === 'mouse') setCursor(cellAt(point.row, point.column))
    const pending = touch.current
    if (pending && (point.row !== pending.point.row || point.column !== pending.point.column)) {
      settleTouch()
      startStroke(pending.point, crossMode)
    }
    if (stroke.current) paintTo(point)
  }

  const handlePointerUp = () => {
    // A quick tap: mark the cell the usual way.
    const pending = touch.current
    if (pending) {
      settleTouch()
      startStroke(pending.point, crossMode)
    }
    stroke.current = null
  }

  const handlePointerCancel = () => {
    settleTouch()
    stroke.current = null
  }

  // Keyboard presses arrive as clicks with no pointer behind them.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 0 || locked) return
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target) return
    const cell = Number(target.dataset.cell)
    const plan = planFor(cell, crossMode)
    if (plan) onMark([cell], plan.from, plan.to, ++strokes.current)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target || event.ctrlKey || event.metaKey || event.altKey) return
    const cell = Number(target.dataset.cell)
    const key = event.key.toLowerCase()
    if (key === 'x' || key === 'f') {
      event.preventDefault()
      const plan = locked ? null : planFor(cell, key === 'x')
      if (plan) onMark([cell], plan.from, plan.to, ++strokes.current)
      return
    }
    const { row, column } = positionOf(cell)
    const next = {
      arrowup: [Math.max(0, row - 1), column],
      arrowdown: [Math.min(shownRows - 1, row + 1), column],
      arrowleft: [row, Math.max(0, column - 1)],
      arrowright: [row, Math.min(shownColumns - 1, column + 1)],
    }[key]
    if (!next) return
    event.preventDefault()
    const to = cellAt(next[0], next[1])
    setFocusIndex(to)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${to}"]`)?.focus()
  }

  const describe = (cell: number) => {
    const { row, column } = positionOf(cell)
    const mark = wrong[cell] ? 'crossed, a mistake' : cells[cell] === FILLED ? 'filled' : cells[cell] === EMPTY ? 'crossed out' : 'blank'
    return `Row ${row + 1}, column ${column + 1}: ${mark}`
  }

  const clueClass = (line: number, cursorMatch: boolean) =>
    ['nono-clue', lineDone(line) && 'is-done', hintLine === line && 'is-hint', cursorMatch && 'is-cursor'].filter(Boolean).join(' ')

  return (
    <div ref={areaRef} className="nono-area">
      {area && size > 0 && (
        <div
          key={gameId}
          className={`nono-board${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
          style={
            {
              '--cell': `${size}px`,
              '--clue': `${size * CLUE}px`,
              '--left': `${left}px`,
              '--top': `${top}px`,
              '--columns': shownColumns,
              '--rows': shownRows,
            } as CSSProperties
          }
        >
          <div className="nono-corner">
            <div className="nono-mode" role="group" aria-label="What taps do">
              <button
                type="button"
                aria-pressed={!crossMode}
                aria-label="Taps fill cells"
                title="Taps fill cells (C to switch)"
                onClick={() => crossMode && onToggleMode()}
              >
                <Square aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-pressed={crossMode}
                aria-label="Taps cross cells out"
                title="Taps cross cells out (C to switch)"
                onClick={() => !crossMode && onToggleMode()}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="nono-column-clues" aria-hidden="true">
            {shownColumnLines.map((line, column) => (
              <div key={line} className={clueClass(line, cursorAt?.column === column)}>
                {(clues[line].length ? clues[line] : [0]).map((run, i) => (
                  <span key={i}>{run}</span>
                ))}
              </div>
            ))}
          </div>
          <div className="nono-row-clues" aria-hidden="true">
            {shownRowLines.map((line, row) => (
              <div key={line} className={clueClass(line, cursorAt?.row === row)}>
                {(clues[line].length ? clues[line] : [0]).map((run, i) => (
                  <span key={i}>{run}</span>
                ))}
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            className={`nono-grid${crossMode ? ' is-cross-mode' : ''}`}
            role="group"
            aria-label={`Picture grid, ${shownColumns} by ${shownRows}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={() => setCursor(null)}
            onClick={handleClick}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={handleKeyDown}
          >
            {Array.from({ length: shownRows * shownColumns }, (_, index) => {
              const row = Math.floor(index / shownColumns)
              const column = index % shownColumns
              const cell = cellAt(row, column)
              const mark = cells[cell]
              const hinted = hintMarks.get(cell)
              const className = [
                'nono-cell',
                mark === FILLED && 'is-filled',
                mark === EMPTY && (wrong[cell] ? 'is-wrong' : 'is-crossed'),
                recent.has(cell) && 'is-recent',
                hinted === FILLED && 'is-hint-fill',
                hinted === EMPTY && 'is-hint-cross',
                wrongCrosses.has(cell) && 'is-hint-wrong',
                (cursorAt?.row === row || cursorAt?.column === column) && 'is-cursor-line',
                hintLine !== null && (shownRowLines[row] === hintLine || shownColumnLines[column] === hintLine) && 'is-hint-line',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={cell}
                  type="button"
                  data-cell={cell}
                  className={className}
                  style={{ '--wave': row + column } as CSSProperties}
                  tabIndex={cell === focusable ? 0 : -1}
                  aria-label={describe(cell)}
                  aria-disabled={locked || undefined}
                  onFocus={() => {
                    setFocusIndex(cell)
                    setCursor(cell)
                  }}
                />
              )
            })}
            {/* Heavier lines every five cells, which make long rows easier to count. */}
            {Array.from({ length: Math.floor((shownColumns - 1) / 5) }, (_, i) => (
              <span key={`v${i}`} className="nono-five is-vertical" style={{ left: (i + 1) * 5 * size }} aria-hidden="true" />
            ))}
            {Array.from({ length: Math.floor((shownRows - 1) / 5) }, (_, i) => (
              <span key={`h${i}`} className="nono-five" style={{ top: (i + 1) * 5 * size }} aria-hidden="true" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
