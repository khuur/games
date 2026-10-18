import { Check } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import type { GameStatus } from '../../hooks/useGameSession'
import type { Feedback, Guess, LevelDefinition } from './codeBreaker'
import { colorName, describeCode, describeFeedback, PEGS } from './pegs'
import './CodeBoard.css'

interface CodeBoardProps {
  level: LevelDefinition
  guesses: Guess[]
  row: (number | null)[]
  cursor: number
  secret: number[]
  status: GameStatus
  gameId: number
  hinted: boolean
  locked: boolean
  /** Whether a colour can't go into the selected slot (it is already used, on levels without repeats). */
  isBlocked: (color: number) => boolean
  onSelect: (slot: number) => void
  onClear: (slot: number) => void
  onPlace: (color: number) => void
  onSubmit: () => void
}

const MIN_PEG = 26
const MAX_PEG = 46
/** Fixed parts of the layout, in pixels; everything else scales with the peg size. */
const ROW_PADDING = 10
const ROW_GAP = 5
const PAD = 12
const SWATCH_GAP = 8

interface Layout {
  /** Guesses run left to right with the colours beside them, rather than top to bottom above them. */
  horizontal: boolean
  peg: number
  swatch: number
  /** Columns of colour buttons. */
  columns: number
  /** Width (horizontal) or height (vertical) of the colour dock. */
  dock: number
}

/**
 * Lays the board out whichever way gives bigger pegs: rows above the colours on tall boards,
 * columns beside them on wide ones. Rows that still don't fit scroll rather than shrink further.
 */
function computeLayout(width: number, height: number, level: LevelDefinition): Layout {
  const { guesses, pegs, colors } = level
  /** Length of one guess, in pegs: its number, the pegs with their gaps, and the marks. */
  const length = 1.55 + 1.25 * pegs

  // Rows top to bottom, colours underneath in one row, or two if one would make them too small.
  const dockWidth = width - 2 * PAD
  const oneRow = (dockWidth - (colors - 1) * SWATCH_GAP) / colors >= 34
  const columns = oneRow ? colors : Math.ceil(colors / 2)
  const swatch = Math.min(oneRow ? 48 : 42, (dockWidth - (columns - 1) * SWATCH_GAP) / columns)
  const dock = (oneRow ? 1 : 2) * (swatch + SWATCH_GAP) - SWATCH_GAP + 2 * PAD + 1
  const tall = Math.min((height - dock - 2 * PAD - (guesses - 1) * ROW_GAP) / guesses - ROW_PADDING, (width - 6 * PAD) / length)

  // Columns left to right, colours beside them in two columns.
  const sideRows = Math.ceil(colors / 2)
  const sideSwatch = Math.min(48, (height - 2 * PAD - (sideRows - 1) * SWATCH_GAP) / sideRows)
  const sideDock = 2 * sideSwatch + SWATCH_GAP + 2 * PAD + 1
  const wide = Math.min((width - sideDock - 2 * PAD - (guesses - 1) * ROW_GAP) / guesses - ROW_PADDING, (height - 6 * PAD) / length)

  const clamp = (peg: number) => Math.floor(Math.max(MIN_PEG, Math.min(MAX_PEG, peg)))
  if (wide > tall * 1.15) {
    return { horizontal: true, peg: clamp(wide), swatch: Math.floor(sideSwatch), columns: 2, dock: sideDock }
  }
  return { horizontal: false, peg: clamp(tall), swatch: Math.floor(swatch), columns, dock }
}

export function CodeBoard({
  level,
  guesses,
  row,
  cursor,
  secret,
  status,
  gameId,
  hinted,
  locked,
  isBlocked,
  onSelect,
  onClear,
  onPlace,
  onSubmit,
}: CodeBoardProps) {
  const [boardRef, board] = useElementSize<HTMLDivElement>()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const won = status === 'won'
  const over = won || status === 'lost'
  const current = over ? -1 : guesses.length
  const complete = row.every((color) => color !== null)
  const layout = board ? computeLayout(board.width, board.height, level) : null
  const horizontal = layout?.horizontal ?? false

  // Keeps the guess being played (or the last one, once the game is over) in view.
  useEffect(() => {
    const scroller = scrollerRef.current
    const target = scroller?.querySelector<HTMLElement>('[data-keep-in-view]')
    if (!scroller || !target) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    const [start, size, scrolled, visible] = horizontal
      ? [target.offsetLeft, target.offsetWidth, scroller.scrollLeft, scroller.clientWidth]
      : [target.offsetTop, target.offsetHeight, scroller.scrollTop, scroller.clientHeight]
    let next: number | null = null
    if (start - PAD < scrolled) next = start - PAD
    else if (start + size + PAD > scrolled + visible) next = start + size + PAD - visible
    if (next !== null) scroller.scrollTo({ [horizontal ? 'left' : 'top']: next, behavior })
  }, [guesses.length, layout?.peg, horizontal, gameId])

  return (
    <div
      ref={boardRef}
      className={`code-board ${horizontal ? 'is-horizontal' : 'is-vertical'}${locked ? ' is-locked' : ''}`}
      style={
        layout
          ? ({ '--peg': `${layout.peg}px`, '--swatch': `${layout.swatch}px`, '--columns': layout.columns } as CSSProperties)
          : undefined
      }
    >
      <div ref={scrollerRef} className="code-rows-area">
        {layout && (
          <ol key={gameId} className="code-rows" aria-label="Guesses">
            {Array.from({ length: level.guesses }, (_, index) => {
              const guess = guesses[index]
              if (guess) {
                const last = index === guesses.length - 1
                return (
                  <PastRow
                    key={`past-${index}`}
                    index={index}
                    guess={guess}
                    pegs={level.pegs}
                    winning={won && last}
                    keepInView={over && last}
                  />
                )
              }
              if (index === current) {
                return (
                  <li
                    key="current"
                    className={`code-row is-current${hinted ? ' is-hinted' : ''}`}
                    aria-label={`Guess ${index + 1}`}
                    data-keep-in-view
                  >
                    <span className="code-row-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="code-row-pegs">
                      {row.map((color, slot) => (
                        <button
                          key={slot}
                          type="button"
                          className={`code-slot${slot === cursor && !locked ? ' is-cursor' : ''}`}
                          aria-label={`Slot ${slot + 1}: ${color === null ? 'empty' : colorName(color)}${slot === cursor ? ', selected' : ''}`}
                          aria-disabled={locked || undefined}
                          onClick={() => {
                            if (locked) return
                            if (color === null) onSelect(slot)
                            else onClear(slot)
                          }}
                        >
                          {color === null ? <span className="code-hole" /> : <Peg key={color} color={color} placed />}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`code-check${complete && !locked ? ' is-ready' : ''}`}
                      disabled={!complete || locked}
                      onClick={onSubmit}
                      aria-label="Check this guess"
                      title="Check this guess (Enter)"
                    >
                      <Check aria-hidden="true" />
                    </button>
                  </li>
                )
              }
              return <EmptyRow key={`empty-${index}`} index={index} pegs={level.pegs} />
            })}
          </ol>
        )}
      </div>

      <div className="code-dock" style={layout ? { [horizontal ? 'width' : 'height']: layout.dock } : undefined}>
        {over ? (
          <div className={`code-secret ${won ? 'is-won' : 'is-lost'}`} role="img" aria-label={`The code: ${describeCode(secret)}`}>
            <span className="code-secret-label">The code</span>
            <div className="code-row-pegs">
              {secret.map((color, slot) => (
                <Peg key={slot} color={color} index={slot} />
              ))}
            </div>
          </div>
        ) : (
          <div className="code-palette" role="group" aria-label="Colours">
            {PEGS.slice(0, level.colors).map((style, color) => (
              <button
                key={style.name}
                type="button"
                className="code-color"
                aria-label={style.name}
                title={`${style.name[0].toUpperCase()}${style.name.slice(1)} (${color + 1})`}
                disabled={locked || isBlocked(color)}
                onClick={() => onPlace(color)}
              >
                <Peg color={color} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Peg({ color, index = 0, placed = false }: { color: number; index?: number; placed?: boolean }) {
  const style = PEGS[color]
  return (
    <span
      className={`code-peg${placed ? ' is-placed' : ''}`}
      style={
        { '--c': style.base, '--c-light': style.light, '--c-dark': style.dark, '--ink': style.ink, '--i': index } as CSSProperties
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={style.shape} />
      </svg>
    </span>
  )
}

function Marks({ feedback, pegs }: { feedback: Feedback | null; pegs: number }) {
  return (
    <div className={`code-marks${pegs > 4 ? ' is-wide' : ''}`} aria-hidden="true">
      {Array.from({ length: pegs }, (_, i) => {
        let kind = ''
        if (feedback && i < feedback.exact) kind = ' is-exact'
        else if (feedback && i < feedback.exact + feedback.near) kind = ' is-near'
        return <span key={i} className={`code-mark${kind}`} style={{ '--i': i } as CSSProperties} />
      })}
    </div>
  )
}

interface PastRowProps {
  index: number
  guess: Guess
  pegs: number
  winning: boolean
  keepInView: boolean
}

function PastRow({ index, guess, pegs, winning, keepInView }: PastRowProps) {
  return (
    <li
      className={`code-row is-past${winning ? ' is-winning' : ''}`}
      aria-label={`Guess ${index + 1}: ${describeCode(guess.code)}. ${describeFeedback(guess.feedback)}.`}
      data-keep-in-view={keepInView || undefined}
    >
      <span className="code-row-index" aria-hidden="true">
        {index + 1}
      </span>
      <div className="code-row-pegs" aria-hidden="true">
        {guess.code.map((color, slot) => (
          <Peg key={slot} color={color} index={slot} />
        ))}
      </div>
      <Marks feedback={guess.feedback} pegs={pegs} />
    </li>
  )
}

function EmptyRow({ index, pegs }: { index: number; pegs: number }) {
  return (
    <li className="code-row is-empty" aria-hidden="true">
      <span className="code-row-index">{index + 1}</span>
      <div className="code-row-pegs">
        {Array.from({ length: pegs }, (_, slot) => (
          <span key={slot} className="code-hole" />
        ))}
      </div>
      <Marks feedback={null} pegs={pegs} />
    </li>
  )
}
