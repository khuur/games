import { Eraser, Pencil, Redo2, Undo2 } from 'lucide-react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import type { SudokuState } from './gameState'
import { boxOf, columnOf, digitBit, rowOf, UNITS, type Hint } from './sudoku'
import './SudokuBoard.css'

interface SudokuBoardProps {
  givens: number[]
  solution: number[]
  values: number[]
  notes: number[]
  selected: number | null
  hint: Hint | null
  lastMove: SudokuState['lastMove']
  gameId: number
  won: boolean
  locked: boolean
  notesMode: boolean
  canUndo: boolean
  canRedo: boolean
  onSelect: (cell: number) => void
  onDigit: (digit: number) => void
  onErase: () => void
  onToggleNotes: () => void
  onUndo: () => void
  onRedo: () => void
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
/** Fixed parts of the layout, in pixels. */
const PAD = 12
const GAP = 14
const KEY_GAP = 6

/**
 * The grid and its keypad. On tall boards the keypad sits underneath, digits in one row; on wide
 * ones it sits beside the grid, digits in a block of three by three.
 */
export function SudokuBoard({
  givens,
  solution,
  values,
  notes,
  selected,
  hint,
  lastMove,
  gameId,
  won,
  locked,
  notesMode,
  canUndo,
  canRedo,
  onSelect,
  onDigit,
  onErase,
  onToggleNotes,
  onUndo,
  onRedo,
}: SudokuBoardProps) {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const width = area?.width ?? 0
  const height = area?.height ?? 0

  // Short screens get a slimmer keypad, leaving more room for the grid.
  const toolHeight = Math.round(Math.max(32, Math.min(40, height * 0.1)))
  const tallKey = Math.round(Math.max(38, Math.min(48, height * 0.12)))
  const tallSide = Math.min(width - 2 * PAD, height - 2 * PAD - GAP - tallKey - KEY_GAP - toolHeight)
  const wideKey = Math.max(44, Math.min(64, (height - 2 * PAD - 3 * KEY_GAP - 2 * toolHeight - 2 * KEY_GAP) / 3))
  const wideSide = Math.min(height - 2 * PAD, width - 2 * PAD - GAP - (3 * wideKey + 2 * KEY_GAP))
  const wide = wideSide > tallSide + 8
  const side = Math.floor(Math.max(150, wide ? wideSide : tallSide))
  /** Keys can spread wider than the grid when height is what limits it. */
  const padWidth = wide ? 3 * wideKey + 2 * KEY_GAP : Math.max(side, Math.min(width - 2 * PAD, 440))

  const selectedValue = selected === null ? 0 : values[selected]
  const highlight = selectedValue || 0
  const hintUnit = hint?.kind === 'place' && hint.unit !== undefined ? new Set(UNITS[hint.unit]) : null
  const flashing = new Set(lastMove?.completed.flatMap((unit) => UNITS[unit]))
  const left = DIGITS.map((digit) => 9 - values.filter((value, cell) => value === digit && solution[cell] === digit).length)
  const focusable = selected ?? 0

  const sees = (cell: number) =>
    selected !== null &&
    cell !== selected &&
    (rowOf(cell) === rowOf(selected) || columnOf(cell) === columnOf(selected) || boxOf(cell) === boxOf(selected))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = selected ?? 0
    const row = rowOf(from)
    const column = columnOf(from)
    const target = {
      ArrowUp: row > 0 ? from - 9 : from,
      ArrowDown: row < 8 ? from + 9 : from,
      ArrowLeft: column > 0 ? from - 1 : from,
      ArrowRight: column < 8 ? from + 1 : from,
      Home: row * 9,
      End: row * 9 + 8,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    onSelect(target)
    event.currentTarget.querySelector<HTMLElement>(`[data-cell="${target}"]`)?.focus()
  }

  const describe = (cell: number) => {
    const value = values[cell]
    let text = `Row ${rowOf(cell) + 1}, column ${columnOf(cell) + 1}: `
    if (givens[cell]) text += `${value}, given`
    else if (value) text += value === solution[cell] ? String(value) : `${value}, wrong`
    else if (notes[cell]) text += `empty, notes ${DIGITS.filter((digit) => notes[cell] & digitBit(digit)).join(' ')}`
    else text += 'empty'
    if (hint?.cell === cell) text += ', hinted'
    return text
  }

  return (
    <div ref={areaRef} className={`sudoku-board${wide ? ' is-wide' : ''}`}>
      {area && (
        <>
          <div
            key={gameId}
            className={`sudoku-grid${won ? ' is-won' : ''}${locked ? ' is-locked' : ''}`}
            role="group"
            aria-label="Sudoku grid"
            style={{ width: side, height: side, '--cell': `${side / 9}px` } as CSSProperties}
            onKeyDown={handleKeyDown}
          >
            {DIGITS.map((_, box) => (
              <div key={box} className="sudoku-box">
                {UNITS[18 + box].map((cell) => {
                  const value = values[cell]
                  const origin = lastMove?.cell ?? cell
                  const className = [
                    'sudoku-cell',
                    givens[cell] ? 'is-given' : value && (value === solution[cell] ? 'is-entry' : 'is-wrong'),
                    cell === selected && 'is-selected',
                    sees(cell) && 'is-peer',
                    highlight && value === highlight && cell !== selected && 'is-same',
                    hint?.cell === cell && 'is-hinted',
                    hintUnit?.has(cell) && 'is-hint-unit',
                    flashing.has(cell) && 'is-flash',
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
                          '--flash': Math.abs(rowOf(cell) - rowOf(origin)) + Math.abs(columnOf(cell) - columnOf(origin)),
                          '--wave': rowOf(cell) + columnOf(cell),
                        } as CSSProperties
                      }
                      tabIndex={cell === focusable ? 0 : -1}
                      aria-label={describe(cell)}
                      aria-pressed={cell === selected}
                      onClick={() => onSelect(cell)}
                    >
                      {value ? (
                        <span key={value} className="sudoku-value">
                          {value}
                        </span>
                      ) : (
                        notes[cell] > 0 && (
                          <span className="sudoku-notes" aria-hidden="true">
                            {DIGITS.map((digit) => (
                              <span key={digit} className={digit === highlight ? 'is-same' : undefined}>
                                {notes[cell] & digitBit(digit) ? digit : ''}
                              </span>
                            ))}
                          </span>
                        )
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div
            className={`sudoku-pad${notesMode ? ' is-notes' : ''}`}
            style={{ width: padWidth, '--key': `${wide ? wideKey : tallKey}px`, '--tool': `${toolHeight}px` } as CSSProperties}
          >
            <div className="sudoku-digits" role="group" aria-label={notesMode ? 'Pencil in a note' : 'Digits'}>
              {DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className={`sudoku-digit${digit === highlight ? ' is-same' : ''}`}
                  disabled={locked || left[digit - 1] === 0}
                  aria-label={`${digit}${notesMode ? ' as a note' : ''}, ${left[digit - 1]} left`}
                  title={`${digit} (${left[digit - 1]} left)`}
                  onClick={() => onDigit(digit)}
                >
                  <span className="sudoku-digit-value">{digit}</span>
                  <span className="sudoku-digit-left" aria-hidden="true">
                    {left[digit - 1]}
                  </span>
                </button>
              ))}
            </div>
            <div className="sudoku-tools">
              <button type="button" className="sudoku-tool" onClick={onUndo} disabled={!canUndo} title="Undo (Z)">
                <Undo2 aria-hidden="true" />
                <span>Undo</span>
              </button>
              <button type="button" className="sudoku-tool" onClick={onRedo} disabled={!canRedo} title="Redo (Y)">
                <Redo2 aria-hidden="true" />
                <span>Redo</span>
              </button>
              <button
                type="button"
                className={`sudoku-tool${notesMode ? ' is-active' : ''}`}
                onClick={onToggleNotes}
                aria-pressed={notesMode}
                disabled={locked}
                title="Notes: pencil in candidates (N)"
              >
                <Pencil aria-hidden="true" />
                <span>Notes</span>
              </button>
              <button type="button" className="sudoku-tool" onClick={onErase} disabled={locked} title="Erase (Backspace)">
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
