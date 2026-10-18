import { Eraser, Pencil, Redo2, Undo2 } from 'lucide-react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { digitBit } from './latin'
import './theme.css'
import './LatinBoard.css'

export type ClueState = 'open' | 'done' | 'broken'
type RingSide = 'top' | 'right' | 'bottom' | 'left'

/** Clues around the grid: for each side, one per row or column (0 for none). */
export interface ClueRing {
  top: number[]
  right: number[]
  bottom: number[]
  left: number[]
  /** Whether each clue is still open, satisfied by a full line, or broken by one. */
  state: (side: RingSide, index: number) => ClueState
  /** Whether a hint is about this clue. */
  hinted?: (side: RingSide, index: number) => boolean
}

const CLUE_PLACES: Record<RingSide, (index: number) => string> = {
  top: (index) => `Column ${index + 1} from the top`,
  right: (index) => `Row ${index + 1} from the right`,
  bottom: (index) => `Column ${index + 1} from the bottom`,
  left: (index) => `Row ${index + 1} from the left`,
}

interface LatinBoardProps {
  size: number
  givens: number[]
  solution: number[]
  values: number[]
  notes: number[]
  selected: number | null
  /** The cell a hint is about, and whether it points out a wrong digit. */
  hintCell: number | null
  hintWrong: boolean
  /** Cells the hint's reasoning is about, to shade. */
  hintArea: ReadonlySet<number>
  lastMove: { cell: number; completed: number[]; id: number } | null
  gameId: number
  won: boolean
  locked: boolean
  notesMode: boolean
  canUndo: boolean
  canRedo: boolean
  ring?: ClueRing
  /** Heavy lines over the grid, such as cage walls: an SVG path measured in cells. */
  outline?: string
  /** A small label in a cell's corner, such as a cage's target. */
  labelOf?: (cell: number) => string | undefined
  onSelect: (cell: number) => void
  onDigit: (digit: number) => void
  onErase: () => void
  onToggleNotes: () => void
  onUndo: () => void
  onRedo: () => void
}

const PAD = 10
const GAP = 10
const KEY_GAP = 6
/** The clue band around the grid, as a share of a cell. */
const BAND = 0.62
/** How wide the tools are as a column beside the grid, and how short they may get there. */
const TOOL_COLUMN = 48
const MIN_SIDE_TOOL = 36
/** Cells at least this big leave the keypad in its usual place. */
const COMFORTABLE_CELL = 44

const clamp = (low: number, value: number, high: number) => Math.max(low, Math.min(high, value))

/**
 * Where the keypad goes: underneath the grid (digits in one row, tools in another), underneath
 * with the tools in a column beside the grid (for narrow, short spaces), or all beside the grid.
 */
type Layout = 'tall' | 'side' | 'wide'

/**
 * A Latin-square puzzle's grid and keypad, laid out for the most room per cell. Clues can ring
 * the grid, and cells can carry cage edges and labels.
 */
export function LatinBoard({
  size,
  givens,
  solution,
  values,
  notes,
  selected,
  hintCell,
  hintWrong,
  hintArea,
  lastMove,
  gameId,
  won,
  locked,
  notesMode,
  canUndo,
  canRedo,
  ring,
  outline,
  labelOf,
  onSelect,
  onDigit,
  onErase,
  onToggleNotes,
  onUndo,
  onRedo,
}: LatinBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const width = area?.width ?? 0
  const height = area?.height ?? 0
  const digits = Array.from({ length: size }, (_, i) => i + 1)

  // The grid plus its clue band, as a multiple of the grid's own side.
  const grow = ring ? 1 + (2 * BAND) / size : 1
  const toolHeight = Math.round(clamp(32, height * 0.1, 40))
  const tallKey = Math.round(clamp(38, height * 0.12, 48))
  const tallGrid = Math.min((width - 2 * PAD) / grow, (height - 2 * PAD - GAP - tallKey - KEY_GAP - toolHeight) / grow)
  const sideGrid = Math.min((width - 2 * PAD - GAP - TOOL_COLUMN) / grow, (height - 2 * PAD - GAP - tallKey) / grow)
  const keyRows = Math.ceil(size / 3)
  const wideKey = clamp(44, (height - 2 * PAD - keyRows * KEY_GAP - 2 * toolHeight - 2 * KEY_GAP) / keyRows, 64)
  const wideGrid = Math.min((height - 2 * PAD) / grow, (width - 2 * PAD - GAP - (3 * wideKey + 2 * KEY_GAP)) / grow)
  let layout: Layout = 'tall'
  let best = tallGrid
  // The tools go beside the grid (losing their labels) only when cells would be cramped otherwise,
  // and only beside a grid tall enough to hold all four.
  if (tallGrid / size < COMFORTABLE_CELL && sideGrid > best + 6 && sideGrid * grow >= 4 * MIN_SIDE_TOOL + 3 * KEY_GAP) {
    layout = 'side'
    best = sideGrid
  }
  if (wideGrid > best + 8) {
    layout = 'wide'
    best = wideGrid
  }
  const side = Math.floor(Math.max(120, best))
  const cell = side / size
  const band = ring ? cell * BAND : 0
  const sideTool = Math.min(48, (side + 2 * band - 3 * KEY_GAP) / 4)
  const padWidth = layout === 'wide' ? 3 * wideKey + 2 * KEY_GAP : Math.max(side + 2 * band, Math.min(width - 2 * PAD, 440))

  const highlight = selected === null ? 0 : values[selected]
  const flashing = new Set(lastMove?.completed)
  const left = digits.map((digit) => size - values.filter((value, index) => value === digit && solution[index] === digit).length)
  const focusable = selected ?? 0

  const sees = (index: number) =>
    selected !== null &&
    index !== selected &&
    (Math.floor(index / size) === Math.floor(selected / size) || index % size === selected % size)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = selected ?? 0
    const row = Math.floor(from / size)
    const column = from % size
    const target = {
      ArrowUp: row > 0 ? from - size : from,
      ArrowDown: row < size - 1 ? from + size : from,
      ArrowLeft: column > 0 ? from - 1 : from,
      ArrowRight: column < size - 1 ? from + 1 : from,
      Home: row * size,
      End: row * size + size - 1,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    onSelect(target)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${target}"]`)?.focus()
  }

  const describe = (index: number) => {
    const value = values[index]
    let text = `Row ${Math.floor(index / size) + 1}, column ${(index % size) + 1}: `
    if (givens[index]) text += `${value}, given`
    else if (value) text += value === solution[index] ? String(value) : `${value}, wrong`
    else if (notes[index]) text += `empty, notes ${digits.filter((digit) => notes[index] & digitBit(digit)).join(' ')}`
    else text += 'empty'
    const label = labelOf?.(index)
    if (label) text += `, cage ${label}`
    if (hintCell === index) text += ', hinted'
    return text
  }

  const clue = (sideName: RingSide, index: number, value: number) => {
    if (!value) return <span key={`${sideName}-${index}`} className="lt-clue" />
    const state = ring!.state(sideName, index)
    const hinted = ring!.hinted?.(sideName, index)
    return (
      <span key={`${sideName}-${index}`} className={`lt-clue is-${state}${hinted ? ' is-hinted' : ''}`}>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">
          {`${CLUE_PLACES[sideName](index)}: ${value}${state === 'done' ? ', met' : state === 'broken' ? ', not met' : ''}${hinted ? ', hinted' : ''}`}
        </span>
      </span>
    )
  }

  const grid = (
    <div
      key={gameId}
      className={`lt-grid${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
      role="group"
      aria-label="Puzzle grid"
      style={{ width: side, height: side, '--size': size, '--cell': `${cell}px` } as CSSProperties}
      onKeyDown={handleKeyDown}
    >
      {values.map((value, index) => {
        const origin = lastMove?.cell ?? index
        const label = labelOf?.(index)
        const className = [
          'lt-cell',
          label && 'has-label',
          givens[index] ? 'is-given' : value && (value === solution[index] ? 'is-entry' : 'is-wrong'),
          index === selected && 'is-selected',
          sees(index) && 'is-peer',
          highlight && value === highlight && index !== selected && 'is-same',
          hintCell === index && (hintWrong ? 'is-hint-wrong' : 'is-hinted'),
          hintArea.has(index) && 'is-hint-area',
          flashing.has(index) && 'is-flash',
        ]
          .filter(Boolean)
          .join(' ')
        const row = Math.floor(index / size)
        const column = index % size
        return (
          <button
            key={index}
            type="button"
            data-cell={index}
            className={className}
            style={
              {
                '--flash': Math.abs(row - Math.floor(origin / size)) + Math.abs(column - (origin % size)),
                '--wave': row + column,
              } as CSSProperties
            }
            tabIndex={index === focusable ? 0 : -1}
            aria-label={describe(index)}
            aria-pressed={index === selected}
            onClick={() => onSelect(index)}
          >
            {label && <span className="lt-label">{label}</span>}
            {value ? (
              <span key={value} className="lt-value">
                {value}
              </span>
            ) : (
              notes[index] > 0 && (
                <span className="lt-notes" aria-hidden="true" style={{ '--note-columns': size <= 4 ? 2 : 3 } as CSSProperties}>
                  {digits.map((digit) => (
                    <span key={digit} className={digit === highlight ? 'is-same' : undefined}>
                      {notes[index] & digitBit(digit) ? digit : ''}
                    </span>
                  ))}
                </span>
              )
            )}
          </button>
        )
      })}
      {outline && (
        <svg className="lt-outline" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={outline} />
        </svg>
      )}
    </div>
  )

  return (
    <div
      ref={areaRef}
      className={`lt-board is-${layout}`}
      style={{ '--tool-column': `${TOOL_COLUMN}px`, '--side-tool': `${sideTool}px` } as CSSProperties}
    >
      {area && (
        <>
          {ring ? (
            <div
              className="lt-ringed"
              role="group"
              style={{ '--band': `${band}px`, '--side': `${side}px`, '--size': size } as CSSProperties}
              aria-label="Grid with clues around it"
            >
              <div className="lt-ring is-top">{ring.top.map((value, i) => clue('top', i, value))}</div>
              <div className="lt-ring is-left">{ring.left.map((value, i) => clue('left', i, value))}</div>
              {grid}
              <div className="lt-ring is-right">{ring.right.map((value, i) => clue('right', i, value))}</div>
              <div className="lt-ring is-bottom">{ring.bottom.map((value, i) => clue('bottom', i, value))}</div>
            </div>
          ) : (
            grid
          )}

          <div
            className={`lt-pad${notesMode ? ' is-notes' : ''}`}
            style={
              { width: padWidth, '--key': `${layout === 'wide' ? wideKey : tallKey}px`, '--tool': `${toolHeight}px`, '--keys': size } as CSSProperties
            }
          >
            <div className="lt-digits" role="group" aria-label={notesMode ? 'Pencil in a note' : 'Digits'}>
              {digits.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className={`lt-digit${digit === highlight ? ' is-same' : ''}`}
                  disabled={locked || left[digit - 1] === 0}
                  aria-label={`${digit}${notesMode ? ' as a note' : ''}, ${left[digit - 1]} left`}
                  title={`${digit} (${left[digit - 1]} left)`}
                  onClick={() => onDigit(digit)}
                >
                  <span className="lt-digit-value">{digit}</span>
                  <span className="lt-digit-left" aria-hidden="true">
                    {left[digit - 1]}
                  </span>
                </button>
              ))}
            </div>
            <div className="lt-tools">
              <button type="button" className="lt-tool" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Z)">
                <Undo2 aria-hidden="true" />
                <span>Undo</span>
              </button>
              <button type="button" className="lt-tool" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Y)">
                <Redo2 aria-hidden="true" />
                <span>Redo</span>
              </button>
              <button
                type="button"
                className={`lt-tool${notesMode ? ' is-active' : ''}`}
                onClick={onToggleNotes}
                aria-pressed={notesMode}
                disabled={locked}
                aria-label="Notes"
                title="Notes: pencil in candidates (N)"
              >
                <Pencil aria-hidden="true" />
                <span>Notes</span>
              </button>
              <button type="button" className="lt-tool" onClick={onErase} disabled={locked} aria-label="Erase" title="Erase (Backspace)">
                <Eraser aria-hidden="true" />
                <span>Erase</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
