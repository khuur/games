import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { LIQUIDS } from './liquids'
import { isComplete, type Pour, type Tube } from './waterSort'
import './WaterBoard.css'

export interface LastPour extends Pour {
  amount: number
  id: number
}

interface WaterBoardProps {
  tubes: readonly Tube[]
  gameId: number
  selected: number | null
  hint: Pour | null
  lastPour: LastPour | null
  /** A new value shakes the tube that refused a pour. */
  rejected: { tube: number; id: number } | null
  locked: boolean
  won: boolean
  pourDuration: number
  reducedMotion: boolean
  onTubeActivate: (tube: number) => void
}

/** Tube height as a multiple of its width. */
const RATIO = 3.4
/** Spacing in tube widths: between tubes, between rows, room above for lifting, and for labels. */
const GAP_X = 0.6
const GAP_Y = 0.5
const HEADROOM = 1.1
const LABEL = 0.6
const MAX_TUBE_WIDTH = 62

interface Layout {
  tube: number
  rows: number
  perRow: number
  positions: { x: number; y: number }[]
}

/** One row or two, whichever makes the tubes bigger. */
function computeLayout(width: number, height: number, count: number): Layout {
  let best: { rows: number; perRow: number; tube: number } | null = null
  for (const rows of [1, 2]) {
    const perRow = Math.ceil(count / rows)
    const byWidth = width / (perRow + (perRow - 1) * GAP_X)
    const byHeight = height / (HEADROOM + rows * (RATIO + LABEL) + (rows - 1) * GAP_Y)
    const tube = Math.min(byWidth, byHeight, MAX_TUBE_WIDTH)
    if (!best || tube > best.tube * 1.05) best = { rows, perRow, tube }
  }
  const { rows, perRow, tube } = best!
  const blockHeight = tube * (HEADROOM + rows * (RATIO + LABEL) + (rows - 1) * GAP_Y)
  const top = Math.max(0, (height - blockHeight) / 2) + tube * HEADROOM
  const positions = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow)
    const inRow = row === rows - 1 ? count - perRow * (rows - 1) : perRow
    const column = index - row * perRow
    const rowWidth = inRow * tube + (inRow - 1) * tube * GAP_X
    return {
      x: (width - rowWidth) / 2 + column * tube * (1 + GAP_X),
      y: top + row * tube * (RATIO + LABEL + GAP_Y),
    }
  })
  return { tube, rows, perRow, positions }
}

export function WaterBoard({
  tubes,
  gameId,
  selected,
  hint,
  lastPour,
  rejected,
  locked,
  won,
  pourDuration,
  reducedMotion,
  onTubeActivate,
}: WaterBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const tubeRefs = useRef<(HTMLButtonElement | null)[]>([])
  const layout = useMemo(
    () => (area && area.width > 0 && area.height > 0 ? computeLayout(area.width, area.height, tubes.length) : null),
    [area, tubes.length],
  )

  // Pouring: the tube flies over to the other one, tips its mouth over it, and comes back.
  const animatePour = useEffectEvent(() => {
    if (!lastPour || !layout || reducedMotion) return undefined
    const element = tubeRefs.current[lastPour.from]
    const source = layout.positions[lastPour.from]
    const target = layout.positions[lastPour.to]
    if (!element || !source || !target) return undefined
    const direction = target.x >= source.x ? 1 : -1
    const height = layout.tube * RATIO
    const dx = target.x - source.x - direction * layout.tube * 0.45
    const dy = target.y - source.y - layout.tube * 0.55
    const tipped = `translate(${dx}px, ${dy}px) rotate(${direction * 72}deg)`
    // Each keyframe's easing shapes the stretch that follows it: fly over, hold while pouring, return.
    return element.animate(
      [
        { transform: `translate(0, ${-height * 0.18}px)`, zIndex: 20, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { transform: tipped, offset: 0.3, zIndex: 20, easing: 'linear' },
        { transform: tipped, offset: 0.72, zIndex: 20, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
        { transform: 'translate(0, 0)', zIndex: 20 },
      ],
      { duration: pourDuration },
    )
  })

  // Only a new pour (or a new puzzle) starts an animation.
  useLayoutEffect(() => {
    const animation = animatePour()
    return () => animation?.cancel()
  }, [lastPour?.id, gameId])

  useEffect(() => {
    if (!rejected || reducedMotion) return
    tubeRefs.current[rejected.tube]?.animate([0, -7, 6, -4, 3, 0].map((x) => ({ translate: `${x}px 0` })), {
      duration: 380,
      easing: 'ease-in-out',
    })
  }, [rejected, reducedMotion])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!layout) return
    const target = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index - layout.perRow,
      ArrowDown: index + layout.perRow,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    tubeRefs.current[Math.min(tubes.length - 1, Math.max(0, target))]?.focus()
  }

  const pourIn = lastPour && !reducedMotion ? lastPour : null
  const pouredColor = lastPour ? tubes[lastPour.to]?.at(-1) : undefined

  return (
    <div ref={areaRef} className="water-area">
      {layout && (
        <div
          key={gameId}
          className={['water-board', won && 'is-won', locked && 'is-locked'].filter(Boolean).join(' ')}
          role="group"
          aria-label="Tubes"
          style={{ '--tube': `${layout.tube}px`, '--pour-duration': `${pourDuration}ms` } as CSSProperties}
        >
          {tubes.map((tube, index) => {
            const position = layout.positions[index]
            const complete = isComplete(tube)
            const filling = pourIn?.to === index ? pourIn.amount : 0
            const draining = pourIn?.from === index && pouredColor !== undefined ? pourIn.amount : 0
            const className = [
              'tube',
              selected === index && 'is-selected',
              complete && 'is-complete',
              hint?.from === index && 'is-hint-from',
              hint?.to === index && 'is-hint-to',
            ]
              .filter(Boolean)
              .join(' ')
            const contents =
              tube.length === 0
                ? 'empty'
                : tube.map((color) => LIQUIDS[color].name).join(', ') + (complete ? ', complete' : '')
            return (
              <button
                key={index}
                ref={(element) => {
                  tubeRefs.current[index] = element
                }}
                type="button"
                className={className}
                style={
                  {
                    left: position.x,
                    top: position.y,
                    width: layout.tube,
                    height: layout.tube * RATIO,
                    '--order': index,
                  } as CSSProperties
                }
                aria-label={`Tube ${index + 1}: ${contents}`}
                aria-pressed={selected === index}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (!locked) onTubeActivate(index)
                }}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className="tube-glass">
                  {tube.map((color, level) => {
                    const isNew = level >= tube.length - filling
                    return (
                      <Layer
                        key={isNew ? `new-${pourIn?.id}-${level}` : level}
                        color={color}
                        level={level}
                        animation={isNew ? 'fill' : undefined}
                        step={isNew ? level - (tube.length - filling) : 0}
                      />
                    )
                  })}
                  {Array.from({ length: draining }, (_, i) => (
                    <Layer
                      key={`out-${pourIn?.id}-${i}`}
                      color={pouredColor!}
                      level={tube.length + i}
                      animation="drain"
                      step={draining - 1 - i}
                    />
                  ))}
                </span>
                {complete && <span className="tube-cork" aria-hidden="true" />}
                <span className="tube-label" aria-hidden="true">
                  {index + 1}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Layer({ color, level, animation, step }: { color: number; level: number; animation?: 'fill' | 'drain'; step: number }) {
  const liquid = LIQUIDS[color]
  return (
    <span
      className={['layer', animation && `is-${animation}ing`].filter(Boolean).join(' ')}
      style={
        {
          '--level': level,
          '--step': step,
          '--liquid': liquid.base,
          '--liquid-light': liquid.light,
          '--liquid-dark': liquid.dark,
        } as CSSProperties
      }
    >
      <span className="layer-symbol">{liquid.symbol}</span>
    </span>
  )
}
