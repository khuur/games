import { freshState, isLatinConsistent, latinReducer, restoreProgress, type LatinAction, type LatinState } from '../latin/latin'
import type { SavedLatinGame } from '../latin/latinStorage'
import { isConnected, LEVELS, meetsCages, OPS, type Cage, type Hint, type LevelId, type Op, type Puzzle } from './calcudoku'

export interface CalcudokuState extends LatinState<Hint> {
  levelId: LevelId
  cages: Cage[]
}

export type CalcudokuAction = LatinAction<Hint> | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }

export function createGame(levelId: LevelId, { cages, solution }: Puzzle, gameId = 0): CalcudokuState {
  const { size } = LEVELS[levelId]
  return { ...freshState<Hint>(size, new Array<number>(size * size).fill(0), solution, gameId), levelId, cages }
}

/** Cages of two or more cells light up when finished, like rows and columns. */
const cageUnits = (cages: readonly Cage[]) => cages.filter((cage) => cage.cells.length > 1).map((cage) => cage.cells)

export function calcudokuReducer(state: CalcudokuState, action: CalcudokuAction): CalcudokuState {
  if (action.type === 'new-game') return createGame(action.levelId, action.puzzle, state.gameId + 1)
  return latinReducer<Hint, CalcudokuState>(state, action, cageUnits(state.cages))
}

/** Cages packed for saving, each as [operation, target, ...cells]. */
export const packCages = (cages: readonly Cage[]) => cages.map(({ op, target, cells }) => [op, target, ...cells])

/** How many cells each operation takes: [fewest, most]. */
const CELLS_FOR: Record<Op, [number, number]> = { '=': [1, 1], '-': [2, 2], '/': [2, 2], '+': [2, Infinity], '*': [2, Infinity] }

/** Cages from saved data, if they are well formed and cover the grid exactly. */
function unpackCages(size: number, value: unknown): Cage[] | null {
  if (!Array.isArray(value)) return null
  const cages: Cage[] = []
  const seen = new Set<number>()
  for (const entry of value) {
    if (!Array.isArray(entry)) return null
    const [op, target, ...cells] = entry as unknown[]
    if (!OPS.includes(op as Op) || !Number.isInteger(target) || (target as number) < 1) return null
    const [fewest, most] = CELLS_FOR[op as Op]
    if (cells.length < fewest || cells.length > most) return null
    for (const cell of cells) {
      if (!Number.isInteger(cell) || (cell as number) < 0 || (cell as number) >= size * size || seen.has(cell as number)) return null
      seen.add(cell as number)
    }
    const sorted = (cells as number[]).slice().sort((a, b) => a - b)
    if (!isConnected(size, sorted)) return null
    cages.push({ op: op as Op, target: target as number, cells: sorted })
  }
  return seen.size === size * size ? cages : null
}

const isDigitList = (value: unknown, length: number, min: number, max: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((digit) => Number.isInteger(digit) && digit >= min && digit <= max)

/** Rebuilds an unfinished game from what was saved. Returns null if it doesn't make a valid game. */
export function restoreGame(saved: SavedLatinGame<LevelId>, gameId = 0): CalcudokuState | null {
  const { levelId, givens, solution } = saved
  const { size } = LEVELS[levelId]
  if (!isDigitList(solution, size * size, 1, size) || !isLatinConsistent(size, solution)) return null
  if (!isDigitList(givens, size * size, 0, 0)) return null
  const cages = unpackCages(size, saved.puzzle)
  if (!cages || !meetsCages(cages, solution)) return null
  return restoreProgress(createGame(levelId, { cages, solution }, gameId), saved)
}
