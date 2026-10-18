import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { CROSS, geometryOf, LINE, NO_CLUE, UNKNOWN, type EdgeState } from './slitherlink'
import './SlitherlinkBoard.css'

interface SlitherlinkBoardProps {
  rows: number
  cols: number
  clues: number[]
  edges: EdgeState[]
  /** What is visibly wrong: clue cells, dots, and the edges of a loop closed too soon. */
  problems: { cells: ReadonlySet<number>; dots: ReadonlySet<number>; loop: ReadonlySet<number> }
  /** What a hint shows: edges to draw, to cross out, or (wrong) to take back; cells and a dot it is about. */
  hint: { lines: number[]; crosses: number[]; wrong: number[]; cells: number[]; dot: number | null } | null
  lastMove: { edges: number[]; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  /** Sets edges; one drag shares a `stroke`. */
  onSet: (changes: { edge: number; to: EdgeState }[], stroke: number) => void
}

/** Room around the grid for the outer dots and lines. */
const MARGIN = 14
/** How close (in cells) the pointer must come to a dot for a drag to reach it. */
const DOT_REACH = 0.34
/** Taps further than this from every edge (the middle of a cell) do nothing. */
const EDGE_REACH = 0.4

/** A pointer that has gone down on the board and may turn into a drag. */
interface Press {
  x: number
  y: number
  moved: boolean
  dot: number | null
  stroke: { id: number; mode: EdgeState } | null
}

/** What a tap does to an edge: open → line → cross → open. */
const cycled = (state: EdgeState): EdgeState => (state === UNKNOWN ? LINE : state === LINE ? CROSS : UNKNOWN)

export function SlitherlinkBoard({ rows, cols, clues, edges, problems, hint, lastMove, gameId, won, locked, onSet }: SlitherlinkBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const press = useRef<Press | null>(null)
  const strokes = useRef(0)
  const [cursor, setCursor] = useState(0)
  const geometry = geometryOf(rows, cols)

  const pitch = area ? Math.max(12, Math.floor(Math.min((area.width - 2 * MARGIN) / cols, (area.height - 2 * MARGIN) / rows))) : 0
  const width = cols * pitch + 2 * MARGIN
  const height = rows * pitch + 2 * MARGIN
  const x = (column: number) => MARGIN + column * pitch
  const y = (row: number) => MARGIN + row * pitch
  const recent = new Set(lastMove?.edges)
  const focused = cursor < rows * cols ? cursor : 0

  /** An edge's two ends, in pixels. */
  const ends = (edge: number) => {
    if (edge < geometry.horizontal) {
      const row = Math.floor(edge / cols)
      const column = edge % cols
      return { x1: x(column), y1: y(row), x2: x(column + 1), y2: y(row) }
    }
    const k = edge - geometry.horizontal
    const row = Math.floor(k / (cols + 1))
    const column = k % (cols + 1)
    return { x1: x(column), y1: y(row), x2: x(column), y2: y(row + 1) }
  }

  /** The pointer's place on the grid, in cells. */
  const gridPoint = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { gx: (event.clientX - rect.left - MARGIN) / pitch, gy: (event.clientY - rect.top - MARGIN) / pitch }
  }

  const nearestDot = (gx: number, gy: number, reach: number) => {
    const row = Math.round(gy)
    const column = Math.round(gx)
    if (row < 0 || row > rows || column < 0 || column > cols) return null
    return Math.hypot(gx - column, gy - row) <= reach ? row * (cols + 1) + column : null
  }

  const nearestEdge = (gx: number, gy: number) => {
    let best: { edge: number; distance: number } | null = null
    const row = Math.round(gy)
    const column = Math.floor(gx)
    if (row >= 0 && row <= rows && column >= 0 && column < cols) best = { edge: row * cols + column, distance: Math.abs(gy - row) }
    const vRow = Math.floor(gy)
    const vColumn = Math.round(gx)
    if (vRow >= 0 && vRow < rows && vColumn >= 0 && vColumn <= cols) {
      const distance = Math.abs(gx - vColumn)
      if (!best || distance < best.distance) best = { edge: geometry.horizontal + vRow * (cols + 1) + vColumn, distance }
    }
    return best && best.distance <= EDGE_REACH ? best.edge : null
  }

  /** The edge between two neighbouring dots. */
  const edgeBetween = (a: number, b: number) => geometry.dotEdges[a].find((edge) => geometry.edgeDots[edge].includes(b))

  /** Dots on a path from one dot to another: across first, then down. */
  const pathBetween = (from: number, to: number) => {
    const path = [from]
    let row = Math.floor(from / (cols + 1))
    let column = from % (cols + 1)
    const targetRow = Math.floor(to / (cols + 1))
    const targetColumn = to % (cols + 1)
    while (column !== targetColumn) {
      column += Math.sign(targetColumn - column)
      path.push(row * (cols + 1) + column)
    }
    while (row !== targetRow) {
      row += Math.sign(targetRow - row)
      path.push(row * (cols + 1) + column)
    }
    return path
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (locked || event.button !== 0 || !pitch) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone; taps still work.
    }
    const { gx, gy } = gridPoint(event)
    press.current = { x: event.clientX, y: event.clientY, moved: false, dot: nearestDot(gx, gy, DOT_REACH), stroke: null }
  }

  /** Draws (or rubs out) the loop along the dots the pointer passes. */
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = press.current
    if (!current) return
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6) current.moved = true
    const { gx, gy } = gridPoint(event)
    const dot = nearestDot(gx, gy, DOT_REACH)
    if (dot === null || dot === current.dot) return
    if (current.dot === null) {
      current.dot = dot
      return
    }
    const path = pathBetween(current.dot, dot)
    const changes: { edge: number; to: EdgeState }[] = []
    for (let i = 1; i < path.length; i++) {
      const edge = edgeBetween(path[i - 1], path[i])
      if (edge === undefined) continue
      // The first edge decides: drawing over open edges, or rubbing out lines.
      current.stroke ??= { id: ++strokes.current, mode: edges[edge] === LINE ? UNKNOWN : LINE }
      if (current.stroke.mode === LINE || edges[edge] === LINE) changes.push({ edge, to: current.stroke.mode })
    }
    current.dot = dot
    if (changes.length && current.stroke) onSet(changes, current.stroke.id)
  }

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const current = press.current
    press.current = null
    if (!current || current.stroke || current.moved) return
    // No drag happened: it was a tap on the nearest edge.
    const { gx, gy } = gridPoint(event)
    const edge = nearestEdge(gx, gy)
    if (edge !== null) onSet([{ edge, to: cycled(edges[edge]) }], ++strokes.current)
  }

  // Right-click crosses an edge out (or clears its cross).
  const handleContextMenu = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    if (locked || !pitch) return
    const { gx, gy } = gridPoint(event)
    const edge = nearestEdge(gx, gy)
    if (edge !== null) onSet([{ edge, to: edges[edge] === CROSS ? UNKNOWN : CROSS }], ++strokes.current)
  }

  /** Arrow keys move between cells; W, A, S and D draw on a cell's sides, and with Shift cross them out. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const cell = focused
    const row = Math.floor(cell / cols)
    const column = cell % cols
    const key = event.key.toLowerCase()
    const side = { w: 0, d: 1, s: 2, a: 3 }[key]
    if (side !== undefined) {
      event.preventDefault()
      if (locked) return
      const edge = geometry.cellEdges[cell][side]
      const target: EdgeState = event.shiftKey ? CROSS : LINE
      onSet([{ edge, to: edges[edge] === target ? UNKNOWN : target }], ++strokes.current)
      return
    }
    const next = {
      arrowup: row > 0 ? cell - cols : cell,
      arrowdown: row < rows - 1 ? cell + cols : cell,
      arrowleft: column > 0 ? cell - 1 : cell,
      arrowright: column < cols - 1 ? cell + 1 : cell,
    }[key]
    if (next === undefined) return
    event.preventDefault()
    setCursor(next)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus()
  }

  const sideNames = ['top', 'right', 'bottom', 'left']
  const describe = (cell: number) => {
    const clue = clues[cell]
    const sides = geometry.cellEdges[cell].map((edge, i) => `${sideNames[i]} ${edges[edge] === LINE ? 'line' : edges[edge] === CROSS ? 'crossed' : 'open'}`)
    const what = clue === NO_CLUE ? 'no clue' : `clue ${clue}${problems.cells.has(cell) ? ', broken' : ''}`
    return `Row ${Math.floor(cell / cols) + 1}, column ${(cell % cols) + 1}, ${what}: ${sides.join(', ')}`
  }

  /** A clue fades once it has its lines (a 0 once its sides are all crossed out). */
  const isDone = (cell: number) => {
    const sides = geometry.cellEdges[cell]
    const lines = sides.filter((edge) => edges[edge] === LINE).length
    return clues[cell] === 0 ? sides.every((edge) => edges[edge] === CROSS) : lines === clues[cell]
  }
  const hintLines = new Set(hint?.lines)
  const hintWrong = new Set(hint?.wrong)
  const crossSize = Math.max(3, pitch * 0.11)
  const cross = (edge: number, className: string) => {
    const { x1, y1, x2, y2 } = ends(edge)
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    return (
      <path
        key={`${className}-${edge}`}
        className={className}
        d={`M${cx - crossSize} ${cy - crossSize}L${cx + crossSize} ${cy + crossSize}M${cx + crossSize} ${cy - crossSize}L${cx - crossSize} ${cy + crossSize}`}
      />
    )
  }

  return (
    <div ref={areaRef} className="sl-area">
      {pitch > 0 && (
        <div
          key={gameId}
          className={`sl-board${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
          style={{ width, height, '--pitch': `${pitch}px` } as CSSProperties}
        >
          <svg
            ref={svgRef}
            className="sl-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              press.current = null
            }}
            onContextMenu={handleContextMenu}
          >
            <rect className="sl-paper" x={MARGIN / 2} y={MARGIN / 2} width={width - MARGIN} height={height - MARGIN} rx={10} />
            {hint?.cells.map((cell) => (
              <rect key={`area-${cell}`} className="sl-hint-area" x={x(cell % cols)} y={y(Math.floor(cell / cols))} width={pitch} height={pitch} />
            ))}
            {geometry.edgeDots.map((_, edge) => edges[edge] === UNKNOWN && !hintLines.has(edge) && <line key={`faint-${edge}`} className="sl-faint" {...ends(edge)} />)}
            {clues.map((clue, cell) => {
              if (clue === NO_CLUE) return null
              const state = problems.cells.has(cell) ? ' is-broken' : isDone(cell) ? ' is-done' : ''
              return (
                <text
                  key={`clue-${cell}`}
                  className={`sl-clue${state}`}
                  x={x(cell % cols) + pitch / 2}
                  y={y(Math.floor(cell / cols)) + pitch / 2}
                  fontSize={pitch * 0.5}
                >
                  {clue}
                </text>
              )
            })}
            {!won && edges.map((state, edge) => state === CROSS && !hintWrong.has(edge) && cross(edge, `sl-cross${recent.has(edge) ? ' is-recent' : ''}`))}
            {edges.map(
              (state, edge) =>
                state === LINE && (
                  <line
                    key={`line-${edge}`}
                    className={`sl-line${problems.loop.has(edge) ? ' is-broken' : ''}${recent.has(edge) ? ' is-recent' : ''}`}
                    strokeWidth={Math.max(3, pitch * 0.13)}
                    {...ends(edge)}
                  />
                ),
            )}
            {hint?.lines.map((edge) => <line key={`hint-line-${edge}`} className="sl-hint-line" strokeWidth={Math.max(3, pitch * 0.13)} {...ends(edge)} />)}
            {hint?.crosses.map((edge) => cross(edge, 'sl-hint-cross'))}
            {hint?.wrong.map((edge) =>
              edges[edge] === CROSS ? (
                cross(edge, 'sl-wrong-cross')
              ) : (
                <line key={`wrong-${edge}`} className="sl-wrong-line" strokeWidth={Math.max(5, pitch * 0.2)} {...ends(edge)} />
              ),
            )}
            {geometry.dotEdges.map((_, dot) => {
              const row = Math.floor(dot / (cols + 1))
              const column = dot % (cols + 1)
              const broken = problems.dots.has(dot)
              return (
                <circle
                  key={`dot-${dot}`}
                  className={`sl-dot${broken ? ' is-broken' : ''}${hint?.dot === dot ? ' is-hinted' : ''}`}
                  cx={x(column)}
                  cy={y(row)}
                  r={Math.max(2.5, pitch * (broken ? 0.11 : 0.065))}
                />
              )
            })}
          </svg>
          <div
            className="sl-cells"
            role="group"
            aria-label={`Slitherlink grid, ${cols} by ${rows}`}
            style={{ left: MARGIN, top: MARGIN, width: cols * pitch, height: rows * pitch, gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            onKeyDown={handleKeyDown}
          >
            {clues.map((_, cell) => (
              <button
                key={cell}
                type="button"
                data-cell={cell}
                className="sl-cell"
                tabIndex={cell === focused ? 0 : -1}
                aria-label={describe(cell)}
                onFocus={() => setCursor(cell)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
