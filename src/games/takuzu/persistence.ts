import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type Move, type TakuzuState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type Cell, type LevelId } from './takuzu'

const GAME_KEY = 'takuzu:game'
const LEVEL_KEY = 'takuzu:level'
export const RECORDS_KEY = 'takuzu:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** Cells as "0" (blank), "1" (sun) and "2" (moon). */
  givens: string
  solution: string
  cells: string
  /** Signs as [a, b, 1 for = or 0 for ×]. */
  signs: [number, number, number][]
  /** Moves packed as cell × 9 + before × 3 + after. */
  history: number[]
  future: number[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isCells = (value: unknown): value is string => typeof value === 'string' && /^[012]+$/.test(value)
const isMoves = (value: unknown): value is number[] => Array.isArray(value) && value.every((move) => isInteger(move) && move >= 0)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    isCells(game.givens) &&
    isCells(game.solution) &&
    isCells(game.cells) &&
    Array.isArray(game.signs) &&
    game.signs.every((sign) => Array.isArray(sign) && sign.length === 3 && sign.every(isInteger)) &&
    isMoves(game.history) &&
    isMoves(game.future) &&
    isInteger(game.mistakes) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const pack = ({ cell, before, after }: Move) => cell * 9 + before * 3 + after
const unpack = (packed: number): Move => ({
  cell: Math.floor(packed / 9),
  before: (Math.floor(packed / 3) % 3) as Cell,
  after: (packed % 3) as Cell,
})
const toCells = (text: string) => [...text].map(Number) as Cell[]

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: TakuzuState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    levelId: snapshot.levelId,
    givens: snapshot.givens.join(''),
    solution: snapshot.solution.join(''),
    cells: snapshot.cells.join(''),
    signs: snapshot.signs.map(({ a, b, same }) => [a, b, same ? 1 : 0]),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    mistakes: snapshot.mistakes,
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: TakuzuState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      levelId: stored.levelId,
      givens: toCells(stored.givens),
      solution: toCells(stored.solution),
      cells: toCells(stored.cells),
      signs: stored.signs.map(([a, b, same]) => ({ a, b, same: same === 1 })),
      history: stored.history.map(unpack),
      future: stored.future.map(unpack),
      mistakes: stored.mistakes,
      hintsUsed: stored.hintsUsed,
      solverUsed: stored.solverUsed,
    })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const levelId = readStored(LEVEL_KEY, DEFAULT_LEVEL, isLevelId)
  return { state: createGame(levelId, generatePuzzle(LEVELS[levelId])), elapsedMs: 0 }
}

export function savePreferredLevel(levelId: LevelId): void {
  writeStored(LEVEL_KEY, levelId)
}
