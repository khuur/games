import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { bridgesAt, type Hint, type Layout } from './bridges'
import './BridgesBoard.css'

interface BridgesBoardProps {
  layout: Layout
  counts: number[]
  hint: Hint | null
  /** Bridges that just blocked a new one, to flash. */
  blocked: { links: number[]; id: number } | null
  lastMove: { link: number; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  /** Builds on a link; `ambiguous` when the tap fell where two gaps cross. */
  onCycle: (link: number, ambiguous?: boolean) => void
}

const MAX_CELL = 62

type Direction = 'up' | 'down' | 'left' | 'right'

const ARROWS: Partial<Record<string, Direction>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/**
 * Islands and bridges, drawn to fit. Boards are taller than wide; when the space is wider than
 * tall they are shown turned on their side.
 */
export function BridgesBoard({ layout, counts, hint, blocked, lastMove, gameId, won, locked, onCycle }: BridgesBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const press = useRef<{ island: number | null; link: number | null; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const { columns, rows, islands, links, linksOf } = layout
  const upright = Math.min((area?.width ?? 0) / columns, (area?.height ?? 0) / rows)
  const sideways = Math.min((area?.width ?? 0) / rows, (area?.height ?? 0) / columns)
  const turned = sideways > upright * 1.05
  const cell = Math.floor(Math.min(MAX_CELL, turned ? sideways : upright))
  const shownColumns = turned ? rows : columns
  const shownRows = turned ? columns : rows

  /** Where a grid cell's centre is drawn. */
  const centre = (gridCell: number) => {
    const row = Math.floor(gridCell / columns)
    const column = gridCell % columns
    const [x, y] = turned ? [row, column] : [column, row]
    return { x: (x + 0.5) * cell, y: (y + 0.5) * cell }
  }
  const points = islands.map((island) => centre(island.cell))

  /** The link leaving an island in a direction on screen, if any. */
  const linkToward = (island: number, direction: Direction) =>
    linksOf[island].find((link) => {
      const other = links[link].a === island ? links[link].b : links[link].a
      const dx = points[other].x - points[island].x
      const dy = points[other].y - points[island].y
      return (
        (direction === 'right' && dx > 0 && dy === 0) ||
        (direction === 'left' && dx < 0 && dy === 0) ||
        (direction === 'down' && dy > 0 && dx === 0) ||
        (direction === 'up' && dy < 0 && dx === 0)
      )
    })

  const linkBetween = (a: number, b: number) => linksOf[a].find((link) => links[link].a === b || links[link].b === b)

  /** The island or link under a point in the drawing, if close enough to one. */
  const targetAt = (x: number, y: number): { island: number | null; link: number | null; ambiguous?: boolean } => {
    let island: number | null = null
    let best = cell * 0.48
    for (const [index, point] of points.entries()) {
      const distance = Math.hypot(point.x - x, point.y - y)
      if (distance < best) {
        best = distance
        island = index
      }
    }
    if (island !== null) return { island, link: null }
    const near: { link: number; distance: number; offCentre: number }[] = []
    for (const [index, { a, b }] of links.entries()) {
      const [p, q] = [points[a], points[b]]
      const along = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2)))
      const distance = Math.hypot(p.x + along * (q.x - p.x) - x, p.y + along * (q.y - p.y) - y)
      if (distance < cell * 0.3) near.push({ link: index, distance, offCentre: Math.abs(along - 0.5) })
    }
    if (!near.length) return { island: null, link: null }
    // Where two links cross, the tap is ambiguous. Prefer the one with bridges, then one that isn't
    // blocked, then the one whose middle the tap is nearer: tapping a gap's middle means that gap.
    const closest = Math.min(...near.map(({ distance }) => distance))
    const tied = near.filter(({ distance }) => distance <= closest + Math.max(2, cell * 0.06)).sort((m, n) => m.offCentre - n.offCentre)
    const blockedLink = (link: number) => layout.crossings[link].some((other) => counts[other] > 0)
    const pick =
      tied.find(({ link }) => counts[link] > 0) ?? tied.find(({ link }) => !blockedLink(link)) ?? tied[0]
    return { island: null, link: pick.link, ambiguous: tied.length > 1 }
  }

  const pointerPosition = (event: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /** A tap on an island: select it, or join it to the island already selected. */
  const tapIsland = (island: number) => {
    if (selected === null || selected === island) {
      setSelected(selected === island ? null : island)
      return
    }
    const link = linkBetween(selected, island)
    if (link === undefined) {
      setSelected(island)
      return
    }
    onCycle(link)
    setSelected(null)
  }

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (locked || event.button !== 0) return
    const { x, y } = pointerPosition(event)
    const target = targetAt(x, y)
    if (target.island === null && target.link === null) {
      setSelected(null)
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // The pointer may already be gone; the tap still works.
    }
    press.current = { ...target, x, y }
  }

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const start = press.current
    press.current = null
    if (!start || locked) return
    const { x, y } = pointerPosition(event)
    if (start.island !== null) {
      const dx = x - start.x
      const dy = y - start.y
      // A drag away from an island builds toward the island that way.
      if (Math.hypot(dx, dy) > cell * 0.45) {
        const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        const link = linkToward(start.island, direction)
        if (link !== undefined) onCycle(link)
        setSelected(null)
        return
      }
      setFocusIndex(start.island)
      tapIsland(start.island)
      return
    }
    const end = targetAt(x, y)
    if (start.link !== null && end.link === start.link) {
      onCycle(start.link, end.ambiguous)
      setSelected(null)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, island: number) => {
    const direction = ARROWS[event.key]
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!locked) tapIsland(island)
      return
    }
    if (!direction) return
    event.preventDefault()
    if (event.shiftKey) {
      // Shift and an arrow build a bridge that way.
      const link = linkToward(island, direction)
      if (link !== undefined && !locked) onCycle(link)
      return
    }
    // Plain arrows move to the nearest island that way.
    const here = points[island]
    let next: number | null = null
    let best = Infinity
    for (const [index, point] of points.entries()) {
      const dx = point.x - here.x
      const dy = point.y - here.y
      const ahead = { right: dx, left: -dx, down: dy, up: -dy }[direction]
      const aside = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
      if (ahead <= 0) continue
      const score = ahead + aside * 2
      if (score < best) {
        best = score
        next = index
      }
    }
    if (next === null) return
    setFocusIndex(next)
    svgRef.current?.querySelector<SVGGElement>(`[data-island="${next}"]`)?.focus()
  }

  const width = shownColumns * cell
  const height = shownRows * cell
  const offset = cell * 0.12
  const hintLink = hint?.link
  const flashing = new Set(blocked?.links)
  const guides = selected === null ? [] : linksOf[selected]

  return (
    <div ref={areaRef} className="bridges-area">
      {cell > 0 && (
        <svg
          key={gameId}
          ref={svgRef}
          className={`bridges-board${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={`Islands, on a ${shownColumns} by ${shownRows} grid`}
          style={{ '--cell': `${cell}px` } as CSSProperties}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            press.current = null
          }}
        >
          {/* Faint dots on every grid point, to show where things line up. */}
          {Array.from({ length: shownColumns * shownRows }, (_, index) => (
            <circle
              key={index}
              className="bridges-dot"
              cx={((index % shownColumns) + 0.5) * cell}
              cy={(Math.floor(index / shownColumns) + 0.5) * cell}
              r={Math.max(1, cell * 0.035)}
            />
          ))}

          {guides.map((link) => {
            const [p, q] = [points[links[link].a], points[links[link].b]]
            return <line key={`guide-${link}`} className="bridges-guide" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
          })}

          {links.map(({ a, b }, link) => {
            const count = counts[link]
            if (!count) return null
            const [p, q] = [points[a], points[b]]
            const horizontal = p.y === q.y
            const shifts = count === 2 ? [-offset, offset] : [0]
            const className = [
              'bridges-bridge',
              lastMove?.link === link && 'is-recent',
              flashing.has(link) && 'is-blocking',
              hint?.kind === 'wrong' && hintLink === link && 'is-wrong',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g key={`${link}-${count}-${flashing.has(link) ? blocked?.id : 0}`} className={className}>
                {shifts.map((shift) => (
                  <line
                    key={shift}
                    x1={p.x + (horizontal ? 0 : shift)}
                    y1={p.y + (horizontal ? shift : 0)}
                    x2={q.x + (horizontal ? 0 : shift)}
                    y2={q.y + (horizontal ? shift : 0)}
                  />
                ))}
              </g>
            )
          })}

          {hint?.kind === 'bridge' && hintLink !== undefined && (
            <line
              className="bridges-hint"
              x1={points[links[hintLink].a].x}
              y1={points[links[hintLink].a].y}
              x2={points[links[hintLink].b].x}
              y2={points[links[hintLink].b].y}
            />
          )}

          {islands.map((island, index) => {
            const { x, y } = points[index]
            const have = bridgesAt(layout, counts, index)
            const className = [
              'bridges-island',
              have === island.count && 'is-done',
              have > island.count && 'is-over',
              selected === index && 'is-selected',
              hint?.kind === 'bridge' && hint.island === index && 'is-hint',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g
                key={island.cell}
                data-island={index}
                className={className}
                transform={`translate(${x} ${y})`}
                style={{ '--wave': x / cell + y / cell } as CSSProperties}
                tabIndex={index === (focusIndex < islands.length ? focusIndex : 0) ? 0 : -1}
                role="button"
                aria-label={`Island needing ${island.count}, has ${have}${selected === index ? ', selected' : ''}`}
                aria-pressed={selected === index}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <circle r={cell * 0.38} />
                <text dy="0.36em">{island.count}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
