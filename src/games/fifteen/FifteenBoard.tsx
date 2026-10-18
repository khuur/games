import { useId, useRef, type CSSProperties, type PointerEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { GAP, homeOf, tilesToward, type Direction, type Tiles } from './fifteen'
import './FifteenBoard.css'

interface FifteenBoardProps {
  size: number
  tiles: Tiles
  gameId: number
  hint: number | null
  locked: boolean
  won: boolean
  /** A tap on a cell: slides the tiles between it and the gap. */
  onTap: (cell: number) => void
  /** A swipe (or arrow key) that slides the tile next to the gap in that direction. */
  onSwipe: (direction: Direction) => void
}

/** Gap between tiles and around the edge, as a fraction of a tile. */
const SPACING = 0.08
/** Distance in pixels after which a press counts as a swipe rather than a tap. */
const SWIPE_DISTANCE = 18

/** Tiles take the colour of the row they belong in, which makes the row-by-row method easier to see. */
function rowColor(row: number, size: number) {
  const hue = 25 + (row * 295) / (size - 1)
  const yellowness = Math.max(0, 1 - Math.abs(hue - 105) / 50)
  return { hue, lightness: 0.72 + 0.12 * yellowness }
}

export function FifteenBoard({ size, tiles, gameId, hint, locked, won, onTap, onSwipe }: FifteenBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const trayRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const descriptionId = useId()

  const side = area ? Math.floor(Math.min(area.width, area.height)) : 0
  const tileSize = side / (size + (size + 1) * SPACING)
  const spacing = tileSize * SPACING
  const position = (cell: number) => ({
    x: spacing + (cell % size) * (tileSize + spacing),
    y: spacing + Math.floor(cell / size) * (tileSize + spacing),
  })

  const cellAt = (clientX: number, clientY: number): number | null => {
    const rect = trayRef.current?.getBoundingClientRect()
    if (!rect) return null
    const column = Math.floor((clientX - rect.left - spacing / 2) / (tileSize + spacing))
    const row = Math.floor((clientY - rect.top - spacing / 2) / (tileSize + spacing))
    if (row < 0 || row >= size || column < 0 || column >= size) return null
    return row * size + column
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || gesture.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current
    if (!start || start.pointerId !== event.pointerId) return
    gesture.current = null
    if (locked) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    const startCell = cellAt(start.x, start.y)
    if (Math.hypot(dx, dy) < SWIPE_DISTANCE) {
      if (startCell !== null) onTap(startCell)
      return
    }
    const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
    // Swiping a tile towards the gap moves its whole line, like tapping it; any other swipe moves
    // the tile next to the gap.
    if (startCell !== null && tilesToward(tiles, startCell, size).length > 0) {
      const gap = tiles.indexOf(GAP)
      const towardGap =
        (direction === 'left' && gap < startCell && Math.floor(gap / size) === Math.floor(startCell / size)) ||
        (direction === 'right' && gap > startCell && Math.floor(gap / size) === Math.floor(startCell / size)) ||
        (direction === 'up' && gap < startCell && gap % size === startCell % size) ||
        (direction === 'down' && gap > startCell && gap % size === startCell % size)
      if (towardGap) {
        onTap(startCell)
        return
      }
    }
    onSwipe(direction)
  }

  const rows = Array.from({ length: size }, (_, row) =>
    tiles
      .slice(row * size, row * size + size)
      .map((tile) => (tile === GAP ? 'gap' : tile))
      .join(', '),
  )
  const gapPosition = position(tiles.indexOf(GAP))

  return (
    <div ref={areaRef} className="fifteen-area">
      {side > 0 && (
        <div
          key={gameId}
          ref={trayRef}
          className={['fifteen-tray', won && 'is-won', locked && 'is-locked'].filter(Boolean).join(' ')}
          role="group"
          aria-label={`Sliding puzzle, ${size} by ${size}`}
          aria-describedby={descriptionId}
          style={
            {
              width: side,
              height: side,
              '--tile': `${tileSize}px`,
            } as CSSProperties
          }
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            gesture.current = null
          }}
        >
          <p id={descriptionId} className="sr-only">
            {rows.map((row, index) => `Row ${index + 1}: ${row}.`).join(' ')} Use the arrow keys to slide a tile into the
            gap.
          </p>
          {tiles.map((tile, cell) => {
            if (tile === GAP) return null
            const { x, y } = position(cell)
            const home = homeOf(tile, size)
            const { hue, lightness } = rowColor(Math.floor(home / size), size)
            const className = ['tile', home === cell && 'is-home', hint === tile && 'is-hinted'].filter(Boolean).join(' ')
            return (
              <div
                key={tile}
                className={className}
                aria-hidden="true"
                style={
                  {
                    width: tileSize,
                    height: tileSize,
                    transform: `translate(${x}px, ${y}px)`,
                    '--hue': hue,
                    '--l-top': (lightness + 0.1).toFixed(3),
                    '--l-mid': lightness.toFixed(3),
                    '--l-bottom': (lightness - 0.12).toFixed(3),
                    '--order': Math.floor(cell / size) + (cell % size),
                  } as CSSProperties
                }
              >
                <span className="tile-number">{tile}</span>
              </div>
            )
          })}
          {won && (
            <div
              className="fifteen-finish"
              aria-hidden="true"
              style={{ width: tileSize, height: tileSize, transform: `translate(${gapPosition.x}px, ${gapPosition.y}px)` }}
            >
              ★
            </div>
          )}
        </div>
      )}
    </div>
  )
}
