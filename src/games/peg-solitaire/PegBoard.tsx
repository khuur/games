import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import type { BoardDefinition, Jump, Pegs } from './pegSolitaire'
import './PegBoard.css'

interface PegBoardProps {
  board: BoardDefinition
  pegs: Pegs
  gameId: number
  selected: number | null
  /** Holes the selected peg can jump to. */
  targets: number[]
  hint: Jump | null
  lastJump: (Jump & { id: number }) | null
  /** A new value shakes the hole that refused a move. */
  rejected: { hole: number; id: number } | null
  locked: boolean
  won: boolean
  reducedMotion: boolean
  jumpDuration: number
  onHoleActivate: (hole: number) => void
}

const SQRT3_2 = Math.sqrt(3) / 2
const MAX_CELL = 74
/** A hole's tap target, as a fraction of the hole spacing. Keep in sync with PegBoard.css. */
const HOLE_SIZE = 0.86

/** Room around the holes for the wooden plate, in hole spacings. */
const MARGIN = 0.4

/** Where each hole sits, in units of one hole spacing. The triangle staggers its rows. */
function unitPositions(board: BoardDefinition) {
  if (board.id === 'triangle') {
    const points = board.holes.map(({ row, column }) => ({
      x: MARGIN + (board.rows - 1 - row) / 2 + column + 0.5,
      y: MARGIN + row * SQRT3_2 + 0.5,
    }))
    return { points, width: board.rows + 2 * MARGIN, height: (board.rows - 1) * SQRT3_2 + 1 + 2 * MARGIN }
  }
  const size = Math.max(...board.holes.map(({ row, column }) => Math.max(row, column))) + 1 + 2 * MARGIN
  const points = board.holes.map(({ row, column }) => ({ x: MARGIN + column + 0.5, y: MARGIN + row + 0.5 }))
  return { points, width: size, height: size }
}

export function PegBoard({
  board,
  pegs,
  gameId,
  selected,
  targets,
  hint,
  lastJump,
  rejected,
  locked,
  won,
  reducedMotion,
  jumpDuration,
  onHoleActivate,
}: PegBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const gradientId = `plate-${useId().replace(/[^\w-]/g, '')}`
  const holeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pegRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [focusHole, setFocusHole] = useState(board.startHole)
  const units = useMemo(() => unitPositions(board), [board])

  const cell = area ? Math.min(area.width / units.width, area.height / units.height, MAX_CELL) : 0
  const offsetX = area ? (area.width - units.width * cell) / 2 : 0
  const offsetY = area ? (area.height - units.height * cell) / 2 : 0
  const at = (hole: number) => ({ x: offsetX + units.points[hole].x * cell, y: offsetY + units.points[hole].y * cell })

  // The jumping peg arcs over the peg it takes, from where it was to where it lands.
  const animateJump = useEffectEvent(() => {
    if (!lastJump || reducedMotion || cell === 0) return undefined
    const element = pegRefs.current[lastJump.to]
    if (!element) return undefined
    const from = at(lastJump.from)
    const to = at(lastJump.to)
    const dx = from.x - to.x
    const dy = from.y - to.y
    return element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.08)`, zIndex: 5 },
        { transform: `translate(${dx / 2}px, ${dy / 2 - cell * 0.6}px) scale(1.25)`, zIndex: 5, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1)', zIndex: 5 },
      ],
      { duration: jumpDuration, easing: 'cubic-bezier(0.35, 0, 0.25, 1)' },
    )
  })

  useLayoutEffect(() => {
    const animation = animateJump()
    return () => animation?.cancel()
  }, [lastJump?.id, gameId])

  useEffect(() => {
    if (!rejected || reducedMotion) return
    holeRefs.current[rejected.hole]?.animate([0, -6, 5, -3, 2, 0].map((x) => ({ translate: `${x}px 0` })), {
      duration: 360,
      easing: 'ease-in-out',
    })
  }, [rejected, reducedMotion])

  /** The nearest hole in the direction of an arrow key. */
  const neighbourTowards = (hole: number, dx: number, dy: number): number => {
    const origin = units.points[hole]
    let best = hole
    let bestDistance = Infinity
    units.points.forEach((point, other) => {
      const vx = point.x - origin.x
      const vy = point.y - origin.y
      const along = vx * dx + vy * dy
      const distance = Math.hypot(vx, vy)
      if (other === hole || along < distance * 0.6) return
      if (distance < bestDistance) {
        best = other
        bestDistance = distance
      }
    })
    return best
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, hole: number) => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction) return
    event.preventDefault()
    const next = neighbourTowards(hole, direction[0], direction[1])
    setFocusHole(next)
    holeRefs.current[next]?.focus()
  }

  const plate = (() => {
    if (cell === 0) return null
    if (board.id === 'triangle') {
      // The corners sit just outside the corner holes; the thick rounded stroke does the rest.
      const corners = [
        [units.width / 2, MARGIN + 0.05],
        [MARGIN - 0.05, units.height - MARGIN - 0.1],
        [units.width - MARGIN + 0.05, units.height - MARGIN - 0.1],
      ].map(([x, y]) => `${offsetX + x * cell},${offsetY + y * cell}`)
      return (
        <polygon
          points={corners.join(' ')}
          className="peg-plate"
          fill={`url(#${gradientId})`}
          stroke={`url(#${gradientId})`}
          strokeWidth={cell * 0.5}
        />
      )
    }
    return (
      <circle
        cx={offsetX + (units.width / 2) * cell}
        cy={offsetY + (units.height / 2) * cell}
        r={cell * 3.85}
        className="peg-plate"
        fill={`url(#${gradientId})`}
      />
    )
  })()

  const targetSet = new Set(targets)
  const tabStop = focusHole < board.holes.length ? focusHole : 0
  const position = (hole: number) => {
    const { row, column } = board.holes[hole]
    return board.id === 'triangle' ? `row ${row + 1}, hole ${column + 1}` : `row ${row + 1}, column ${column + 1}`
  }

  return (
    <div ref={areaRef} className="peg-area">
      {area && cell > 0 && (
        <div
          key={gameId}
          className={['peg-board', `is-${board.id}`, won && 'is-won', locked && 'is-locked'].filter(Boolean).join(' ')}
          role="group"
          aria-label={`${board.name} board`}
          style={{ '--cell': `${cell}px`, '--jump-duration': `${jumpDuration}ms` } as CSSProperties}
        >
          <svg className="peg-plate-layer" width={area.width} height={area.height} aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="plate-top" />
                <stop offset="1" className="plate-bottom" />
              </linearGradient>
            </defs>
            {plate}
          </svg>
          {board.holes.map((_, hole) => {
            const { x, y } = at(hole)
            const hasPeg = pegs[hole]
            const className = [
              'hole',
              hasPeg && 'has-peg',
              selected === hole && 'is-selected',
              targetSet.has(hole) && 'is-target',
              hint?.from === hole && 'is-hint-from',
              hint?.to === hole && 'is-hint-to',
              hole === board.goalHole && 'is-goal',
            ]
              .filter(Boolean)
              .join(' ')
            let label = `${position(hole)}: ${hasPeg ? 'peg' : 'empty'}`
            if (selected === hole) label += ', picked up'
            if (targetSet.has(hole)) label += ', jump here'
            if (hint?.from === hole || hint?.to === hole) label += ', suggested'
            return (
              <button
                key={hole}
                ref={(element) => {
                  holeRefs.current[hole] = element
                }}
                type="button"
                className={className}
                style={
                  { left: x - (cell * HOLE_SIZE) / 2, top: y - (cell * HOLE_SIZE) / 2, '--order': hole } as CSSProperties
                }
                tabIndex={hole === tabStop ? 0 : -1}
                aria-label={label}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (!locked) onHoleActivate(hole)
                }}
                onFocus={() => setFocusHole(hole)}
                onKeyDown={(event) => handleKeyDown(event, hole)}
              >
                <span className="hole-pit" />
                {hasPeg && (
                  <span
                    ref={(element) => {
                      pegRefs.current[hole] = element
                    }}
                    className="peg"
                  />
                )}
              </button>
            )
          })}
          {lastJump && !reducedMotion && (
            <span
              key={`taken-${lastJump.id}`}
              className="peg peg-taken"
              style={{ left: at(lastJump.over).x, top: at(lastJump.over).y }}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </div>
  )
}
