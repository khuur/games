import { useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { affectedCells, type Lights } from './lightsOut'
import './LightsBoard.css'

interface LightsBoardProps {
  size: number
  lights: Lights
  gameId: number
  hint: number | null
  /** The latest press, where the ripple starts. */
  lastCell: number | null
  locked: boolean
  won: boolean
  onPress: (cell: number) => void
}

/** Gap between lights, as a fraction of a light's size. */
const GAP = 0.14

export function LightsBoard({ size, lights, gameId, hint, lastCell, locked, won, onPress }: LightsBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [tabStop, setTabStop] = useState(0)
  const [preview, setPreview] = useState<number | null>(null)

  const side = area ? Math.floor(Math.min(area.width, area.height)) : 0
  const cellSize = side / (size + (size - 1) * GAP)
  const focusable = tabStop < size * size ? tabStop : 0
  const affected = preview !== null && preview < size * size && !locked ? affectedCells(preview, size) : []

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cell: number) => {
    const row = Math.floor(cell / size)
    const column = cell % size
    const target = {
      ArrowUp: row > 0 ? cell - size : cell,
      ArrowDown: row < size - 1 ? cell + size : cell,
      ArrowLeft: column > 0 ? cell - 1 : cell,
      ArrowRight: column < size - 1 ? cell + 1 : cell,
      Home: row * size,
      End: row * size + size - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    setTabStop(target)
    cellRefs.current[target]?.focus()
  }

  const handleFocus = (event: FocusEvent<HTMLButtonElement>, cell: number) => {
    setTabStop(cell)
    // Keyboard players get the same preview a mouse gets on hover; taps don't need it.
    if (event.currentTarget.matches(':focus-visible')) setPreview(cell)
  }

  const clearPreview = (cell: number) => setPreview((current) => (current === cell ? null : current))

  const boardClass = ['lights-board', won && 'is-won', locked && 'is-locked'].filter(Boolean).join(' ')

  return (
    <div ref={areaRef} className="lights-area">
      {side > 0 && (
        <div
          key={gameId}
          className={boardClass}
          role="group"
          aria-label={`Lights, ${size} by ${size}`}
          style={
            {
              width: side,
              height: side,
              '--grid-size': size,
              '--cell': `${cellSize}px`,
              '--gap': `${cellSize * GAP}px`,
            } as CSSProperties
          }
        >
          {lights.map((on, cell) => {
            const row = Math.floor(cell / size)
            const column = cell % size
            const ripple =
              lastCell === null
                ? 0
                : Math.abs(row - Math.floor(lastCell / size)) + Math.abs(column - (lastCell % size))
            const className = [
              'light',
              on && 'is-on',
              affected.includes(cell) && 'is-affected',
              preview === cell && !locked && 'is-target',
              hint === cell && 'is-hinted',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={cell}
                ref={(element) => {
                  cellRefs.current[cell] = element
                }}
                type="button"
                className={className}
                style={{ '--ripple': ripple, '--diagonal': row + column } as CSSProperties}
                tabIndex={cell === focusable ? 0 : -1}
                aria-label={`Row ${row + 1}, column ${column + 1}: ${on ? 'on' : 'off'}${hint === cell ? ', suggested' : ''}`}
                aria-disabled={locked || undefined}
                onClick={() => {
                  if (!locked) onPress(cell)
                }}
                onKeyDown={(event) => handleKeyDown(event, cell)}
                onFocus={(event) => handleFocus(event, cell)}
                onBlur={() => clearPreview(cell)}
                onPointerEnter={(event) => event.pointerType === 'mouse' && setPreview(cell)}
                onPointerLeave={(event) => event.pointerType === 'mouse' && clearPreview(cell)}
              >
                <span className="light-glow" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
