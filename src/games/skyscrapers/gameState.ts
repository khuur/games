import { freshState, isLatinConsistent, latinReducer, restoreProgress, type LatinAction, type LatinState } from '../latin/latin'
import type { SavedLatinGame } from '../latin/latinStorage'
import { cluesOf, LEVELS, type Hint, type LevelId, type Puzzle } from './skyscrapers'

export interface SkyscrapersState extends LatinState<Hint> {
  levelId: LevelId
  /** The 4N clues around the grid, 0 where there is none. */
  clues: number[]
}

export type SkyscrapersAction = LatinAction<Hint> | { type: 'new-game'; levelId: LevelId; puzzle: Puzzle }

export function createGame(levelId: LevelId, { clues, givens, solution }: Puzzle, gameId = 0): SkyscrapersState {
  return { ...freshState<Hint>(LEVELS[levelId].size, givens, solution, gameId), levelId, clues }
}

export function skyscrapersReducer(state: SkyscrapersState, action: SkyscrapersAction): SkyscrapersState {
  if (action.type === 'new-game') return createGame(action.levelId, action.puzzle, state.gameId + 1)
  return latinReducer<Hint, SkyscrapersState>(state, action)
}

const isDigitList = (value: unknown, length: number, min: number, max: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((digit) => Number.isInteger(digit) && digit >= min && digit <= max)

/** Rebuilds an unfinished game from what was saved. Returns null if it doesn't make a valid game. */
export function restoreGame(saved: SavedLatinGame<LevelId>, gameId = 0): SkyscrapersState | null {
  const { levelId, givens, solution, puzzle: clues } = saved
  const { size } = LEVELS[levelId]
  if (!isDigitList(solution, size * size, 1, size) || !isDigitList(givens, size * size, 0, size)) return null
  if (!isDigitList(clues, 4 * size, 0, size) || !isLatinConsistent(size, solution)) return null
  if (givens.some((digit, cell) => digit && digit !== solution[cell])) return null
  const full = cluesOf(size, solution)
  if (clues.some((clue, i) => clue && clue !== full[i])) return null
  return restoreProgress(createGame(levelId, { clues, givens, solution }, gameId), saved)
}
