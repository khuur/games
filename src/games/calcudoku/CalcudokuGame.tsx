import { linesOf, peersOf } from '../latin/latin'
import { createLatinGame } from '../latin/LatinGame'
import { cageIndex, cageLabel, findHint, generatePuzzle, LEVEL_IDS, LEVELS, type Hint, type LevelId, type Puzzle } from './calcudoku'
import { calcudokuReducer, type CalcudokuState } from './gameState'
import { loadInitialGame, RECORDS_KEY, saveGame, savePreferredLevel } from './persistence'

const lineName = (size: number, line: number) => (line < size ? `row ${line + 1}` : `column ${line - size + 1}`)

const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

function describeHint(hint: Hint, { size, cages }: CalcudokuState): string {
  if (hint.kind === 'wrong') return `Hint: the ${hint.digit} here is wrong. Erase it to carry on.`
  const { digit, line } = hint
  const label = cageLabel(hint.cage === undefined ? cages.find((cage) => cage.cells.includes(hint.cell))! : cages[hint.cage])
  switch (hint.reason) {
    case 'given':
      return `Hint: this cage is a single cell, so it simply holds its number: ${digit}.`
    case 'naked-single':
      return `Hint: only a ${digit} fits the marked cell. Its row and column hold every other digit.`
    case 'hidden-single':
      return `Hint: in ${lineName(size, line ?? 0)}, a ${digit} fits in only one place.`
    case 'cage':
      return `Hint: every way to make ${label} in this cage that fits its rows and columns puts a ${digit} in the marked cell.`
    case 'cage-single':
      if (line === undefined) {
        return `Hint: only a ${digit} fits the marked cell. Its row and column rule out some digits, and the rest can't make ${label} with its cage.`
      }
      return `Hint: in ${lineName(size, line)}, a ${digit} fits in only one place once the cages are counted: anywhere else, that cell's cage couldn't make its number.`
    case 'deeper': {
      const names = (hint.cages ?? []).map((index) => cageLabel(cages[index]))
      if (!names.length) return `Hint: the marked cell must be a ${digit}. Narrow down what its row, column and cage allow first; notes help.`
      const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names
      return `Hint: the marked cell must be a ${digit}. To see it, first work out which digits the ${listOf(shown)} cage${names.length > 1 ? 's' : ''} allow, and what that leaves their rows and columns. Notes help.`
    }
  }
}

function hintArea(hint: Hint, { size, cages }: CalcudokuState): number[] {
  if (hint.kind === 'wrong') return []
  if (hint.reason === 'deeper') return (hint.cages ?? []).flatMap((index) => cages[index].cells)
  if (hint.cage !== undefined) return cages[hint.cage].cells
  if (hint.line !== undefined) return linesOf(size)[hint.line]
  return peersOf(size)[hint.cell]
}

/** Heavy walls between cages, and each cage's target in its first cell. */
function decorationsOf({ size, cages }: CalcudokuState) {
  const owner = cageIndex(size, cages)
  let outline = ''
  for (let cell = 0; cell < size * size; cell++) {
    const row = Math.floor(cell / size)
    const column = cell % size
    if (column < size - 1 && owner[cell] !== owner[cell + 1]) outline += `M${column + 1} ${row}v1`
    if (row < size - 1 && owner[cell] !== owner[cell + size]) outline += `M${column} ${row + 1}h1`
  }
  const labels = new Map(cages.map((cage) => [cage.cells[0], cageLabel(cage)]))
  return { outline, labelOf: (cell: number) => labels.get(cell) }
}

export const CalcudokuGame = createLatinGame<Hint, CalcudokuState, LevelId, Puzzle>({
  session: {
    reducer: calcudokuReducer,
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
  findHint: ({ size, cages, values, solution }) => findHint(size, cages, values, solution),
  hintArea,
  describeHint,
  decorations: decorationsOf,
  readyText: "Each cage's digits make the number in its corner. Pick a cell, then a digit.",
  newPuzzleText: (levelId) => `New ${LEVELS[levelId].name} puzzle, ${LEVELS[levelId].size} by ${LEVELS[levelId].size}.`,
  perfectNote: 'Every cage worked out without a single mistake.',
})
