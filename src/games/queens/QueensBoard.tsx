import { Crown } from 'lucide-react'
import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { BLANK, CROSS, QUEEN, type Hint, type Mark } from './queens'
import './QueensBoard.css'

interface QueensBoardProps {
  size: number
  regions: number[]
  marks: Mark[]
  wrong: boolean[]
  /** Cells a placed queen rules out. */
  attacked: Set<number>
  hint: Hint | null
  /** Cells the hint's reasoning is about (a row, column or region), to shade. */
  hintArea: Set<number>
  lastMove: { cells: number[]; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  /** Marks cells: those that are `from` become `to`; one drag shares a `stroke`. False stops the drag. */
  onMark: (cells: number[], from: Mark, to: Mark, stroke: number) => boolean
}

const EDGE = 1.5

/** A pointer that has gone down on a cell and may turn into a drag. */
interface Press {
  start: number
  last: number
  stroke: { id: number; from: Mark; to: Mark; done: Set<number> } | null
}

export function QueensBoard({
  size,
  regions,
  marks,
  wrong,
  attacked,
  hint,
  hintArea,
  lastMove,
  gameId,
  won,
  locked,
  onMark,
}: QueensBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const gridRef = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const strokes = useRef(0)
  const [focusIndex, setFocusIndex] = useState(0)

  const side = area ? Math.floor(Math.min(area.width, area.height)) : 0
  const cellSize = side / size
  const focusable = focusIndex < marks.length ? focusIndex : 0
  const hintQueen = hint?.kind === 'step' ? hint.step.queen : undefined
  const hintCrosses = new Set(hint?.kind === 'step' ? hint.step.eliminate : hint?.kind === 'wrong-cross' ? hint.cells : [])
  const recent = new Set(lastMove?.cells)

  /** What a tap does: blank → cross → queen → blank (no queen where one can't go). */
  const nextMark = (cell: number): Mark => {
    if (marks[cell] === BLANK) return CROSS
    if (marks[cell] === CROSS) return attacked.has(cell) ? BLANK : QUEEN
    return BLANK
  }

  const tap = (cell: number) => {
    if (locked || wrong[cell]) return
    onMark([cell], marks[cell], nextMark(cell), ++strokes.current)
  }

  const cellFrom = (event: PointerEvent) => {
    const rect = gridRef.current!.getBoundingClientRect()
    const row = Math.floor((event.clientY - rect.top) / cellSize)
    const column = Math.floor((event.clientX - rect.left) / cellSize)
    if (row < 0 || row >= size || column < 0 || column >= size) return null
    return row * size + column
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0) return
    const cell = cellFrom(event)
    if (cell === null || wrong[cell]) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone; taps still work.
    }
    press.current = { start: cell, last: cell, stroke: null }
    setFocusIndex(cell)
  }

  /** Crosses (or clears crosses) along a drag, filling the cells between quick movements. */
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current
    if (!current) return
    const cell = cellFrom(event)
    if (cell === null || cell === current.last) return
    if (!current.stroke) {
      const from = marks[current.start]
      if (from === QUEEN) {
        press.current = null
        return
      }
      current.stroke = { id: ++strokes.current, from, to: from === BLANK ? CROSS : BLANK, done: new Set([current.start]) }
      if (!onMark([current.start], current.stroke.from, current.stroke.to, current.stroke.id)) return
    }
    const { stroke } = current
    const [r0, c0] = [Math.floor(current.last / size), current.last % size]
    const [r1, c1] = [Math.floor(cell / size), cell % size]
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0))
    const path: number[] = []
    for (let i = 1; i <= steps; i++) {
      const next = (r0 + Math.round(((r1 - r0) * i) / steps)) * size + c0 + Math.round(((c1 - c0) * i) / steps)
      if (!stroke.done.has(next)) {
        stroke.done.add(next)
        path.push(next)
      }
    }
    current.last = cell
    if (path.length) onMark(path, stroke.from, stroke.to, stroke.id)
  }

  const handlePointerUp = () => {
    const current = press.current
    press.current = null
    // No drag happened: it was a tap.
    if (current && !current.stroke) tap(current.start)
  }

  // Right-click places (or takes away) a queen directly.
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (locked) return
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target) return
    const cell = Number(target.dataset.cell)
    if (wrong[cell]) return
    if (marks[cell] === QUEEN) onMark([cell], QUEEN, BLANK, ++strokes.current)
    else if (!attacked.has(cell)) onMark([cell], marks[cell], QUEEN, ++strokes.current)
  }

  // Keyboard presses arrive as clicks with no pointer behind them.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.detail !== 0) return
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (target) tap(Number(target.dataset.cell))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    if (!target || event.ctrlKey || event.metaKey || event.altKey) return
    const cell = Number(target.dataset.cell)
    const key = event.key.toLowerCase()
    if (key === 'q' || key === 'x' || key === 'backspace' || key === 'delete') {
      event.preventDefault()
      if (locked || wrong[cell]) return
      const to: Mark = key === 'q' ? (marks[cell] === QUEEN ? BLANK : QUEEN) : key === 'x' ? (marks[cell] === CROSS ? BLANK : CROSS) : BLANK
      if (to === QUEEN && attacked.has(cell)) return
      onMark([cell], marks[cell], to, ++strokes.current)
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

  /** Heavy lines where regions meet, drawn inside each cell along its region's border. */
  const edgesOf = (cell: number) => {
    const row = Math.floor(cell / size)
    const column = cell % size
    const region = regions[cell]
    const shadows = []
    if (row === 0 || regions[cell - size] !== region) shadows.push(`inset 0 ${EDGE}px 0 var(--q-edge)`)
    if (row === size - 1 || regions[cell + size] !== region) shadows.push(`inset 0 -${EDGE}px 0 var(--q-edge)`)
    if (column === 0 || regions[cell - 1] !== region) shadows.push(`inset ${EDGE}px 0 0 var(--q-edge)`)
    if (column === size - 1 || regions[cell + 1] !== region) shadows.push(`inset -${EDGE}px 0 0 var(--q-edge)`)
    return shadows.join(', ')
  }

  const describe = (cell: number) => {
    const mark = wrong[cell] ? 'crossed, a mistake' : marks[cell] === QUEEN ? 'queen' : marks[cell] === CROSS ? 'crossed out' : attacked.has(cell) ? 'ruled out' : 'blank'
    return `Row ${Math.floor(cell / size) + 1}, column ${(cell % size) + 1}, region ${regions[cell] + 1}: ${mark}`
  }

  return (
    <div ref={areaRef} className="queens-area">
      {side > 0 && (
        <div
          key={gameId}
          ref={gridRef}
          className={`queens-board${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
          role="group"
          aria-label={`Queens board, ${size} by ${size}`}
          style={{ width: side, height: side, '--size': size, '--cell': `${cellSize}px` } as CSSProperties}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            press.current = null
          }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
        >
          {marks.map((mark, cell) => {
            const className = [
              'queens-cell',
              mark === QUEEN && 'is-queen',
              mark === CROSS && (wrong[cell] ? 'is-wrong' : 'is-crossed'),
              mark === BLANK && attacked.has(cell) && 'is-attacked',
              recent.has(cell) && 'is-recent',
              hintQueen === cell && 'is-hint-queen',
              hintCrosses.has(cell) && 'is-hint-cross',
              hintArea.has(cell) && 'is-hint-area',
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
                    '--region': `var(--q-${regions[cell]})`,
                    boxShadow: edgesOf(cell),
                    '--wave': Math.floor(cell / size) + (cell % size),
                  } as CSSProperties
                }
                tabIndex={cell === focusable ? 0 : -1}
                aria-label={describe(cell)}
                aria-disabled={locked || undefined}
                onFocus={() => setFocusIndex(cell)}
              >
                {mark === QUEEN && <Crown className="queens-crown" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
