import { linesOf, peersOf } from '../latin/latin'
import type { ClueRing } from '../latin/LatinBoard'
import { createLatinGame } from '../latin/LatinGame'
import { skyscrapersReducer, type SkyscrapersState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'
import {
  clueIndex,
  findHint,
  generatePuzzle,
  LEVEL_IDS,
  LEVELS,
  lineClues,
  sidesOf,
  visible,
  type Hint,
  type LevelId,
  type Puzzle,
  type Side,
} from './skyscrapers'

const lineName = (size: number, line: number) => (line < size ? `row ${line + 1}` : `column ${line - size + 1}`)

/** Where a clue sits, as in "the 1 left of row 2". */
const CLUE_PLACE: Record<Side, string> = { top: 'above', right: 'right of', bottom: 'below', left: 'left of' }

const SIDE_NAME: Record<Side, string> = { top: 'the top', right: 'the right', bottom: 'the bottom', left: 'the left' }

/** A line's clues in words, such as "3 seen from the left and 2 from the right". */
function seenText(size: number, line: number, clues: readonly number[]) {
  const { start, end } = lineClues(size, line, clues)
  const [first, second] = sidesOf(size, line)
  if (start && end) return `${start} seen from ${SIDE_NAME[first]} and ${end} from ${SIDE_NAME[second]}`
  return start ? `${start} seen from ${SIDE_NAME[first]}` : `${end} seen from ${SIDE_NAME[second]}`
}

const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

function describeHint(hint: Hint, { size, clues }: SkyscrapersState): string {
  if (hint.kind === 'wrong') return `Hint: the ${hint.digit} here is wrong. Erase it to carry on.`
  const { digit, line = 0, side = 'top' } = hint
  const name = lineName(size, line)
  const across = line < size ? 'column' : 'row'
  switch (hint.reason) {
    case 'naked-single':
      return `Hint: only a ${digit} fits the marked cell. Its row and column hold every other height.`
    case 'hidden-single':
      return `Hint: in ${name}, a ${digit} fits in only one place.`
    case 'clue-one':
      return `Hint: the 1 ${CLUE_PLACE[side]} ${name} sees only the nearest tower, so that one is the tallest: a ${size}.`
    case 'clue-full':
      return `Hint: the ${size} ${CLUE_PLACE[side]} ${name} sees every tower, so they climb 1, 2, 3… away from it. This one is a ${digit}.`
    case 'edge-single':
      if (hint.line === undefined) {
        return `Hint: only a ${digit} fits the marked cell. Its row and column rule out some heights, and a taller tower this close to a clue would hide towers the clue needs to see.`
      }
      return `Hint: in ${name}, a ${digit} fits in only one place. Anywhere else it would repeat a ${digit} in a ${across}, or stand so close to a clue that it hides towers the clue needs to see.`
    case 'line':
      return `Hint: try the orders of heights for ${name} that match its clues (${seenText(size, line, clues)}) without repeating a height in any ${across}. Every one puts a ${digit} in the marked cell.`
    case 'deeper': {
      const lines = hint.lines ?? []
      if (!lines.length) return `Hint: the marked cell must be a ${digit}.`
      const names = lines.length > 3 ? [...lines.slice(0, 2).map((other) => lineName(size, other)), `${lines.length - 2} more`] : lines.map((other) => lineName(size, other))
      return `Hint: the marked cell must be a ${digit}. To see it, first work out which heights can go where in ${listOf(names)}, from ${lines.length === 1 ? 'its' : 'their'} clues. Notes help keep track.`
    }
  }
}

function hintArea(hint: Hint, { size }: SkyscrapersState): number[] {
  if (hint.kind === 'wrong') return []
  const lines = linesOf(size)
  if (hint.reason === 'deeper') return (hint.lines ?? []).flatMap((line) => lines[line])
  if (hint.line !== undefined) return lines[hint.line]
  return peersOf(size)[hint.cell]
}

/** The clues around the grid, each marked once its row or column is full, and those a hint is about. */
function ringOf({ size, clues, values, hint }: SkyscrapersState): ClueRing {
  const lines = linesOf(size)
  const lineOf = (side: Side, index: number) => (side === 'top' || side === 'bottom' ? size + index : index)
  return {
    top: clues.slice(0, size),
    right: clues.slice(size, 2 * size),
    bottom: clues.slice(2 * size, 3 * size),
    left: clues.slice(3 * size),
    state: (side, index) => {
      const heights = lines[lineOf(side, index)].map((cell) => values[cell])
      if (heights.includes(0)) return 'open'
      if (side === 'right' || side === 'bottom') heights.reverse()
      return visible(heights) === clues[clueIndex(size, side, index)] ? 'done' : 'broken'
    },
    hinted: (side, index) => {
      if (!hint || hint.kind === 'wrong') return false
      const line = lineOf(side, index)
      if (hint.reason === 'clue-one' || hint.reason === 'clue-full') return hint.line === line && hint.side === side
      if (hint.reason === 'line') return hint.line === line
      return hint.reason === 'deeper' && (hint.lines?.includes(line) ?? false)
    },
  }
}

export const SkyscrapersGame = createLatinGame<Hint, SkyscrapersState, LevelId, Puzzle>({
  session: {
    reducer: skyscrapersReducer,
    load: loadInitialGame,
    save: saveGame,
    recordsKey: RECORDS_KEY,
    newGameAction: (levelId) => ({ type: 'new-game', levelId, puzzle: generatePuzzle(LEVELS[levelId]) }),
    restartAction: { type: 'restart' },
    savePreferredLevel,
    levelName: (levelId) => LEVELS[levelId].name,
    target: ({ size }) => ({ label: 'Grid', value: `${size}×${size}` }),
  },
  levels: LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name })),
  hintTarget: (hint) => ({ cell: hint.cell, digit: hint.kind === 'wrong' ? 0 : hint.digit, wrong: hint.kind === 'wrong' }),
  findHint: ({ size, clues, values, solution }) => findHint(size, clues, values, solution),
  hintArea,
  describeHint,
  ring: ringOf,
  readyText: 'Each clue counts the towers seen from its side. Pick a cell, then a height.',
  newPuzzleText: (levelId) => `New ${LEVELS[levelId].name} puzzle, ${LEVELS[levelId].size} by ${LEVELS[levelId].size}.`,
  perfectNote: 'Every tower placed without a single mistake.',
})
