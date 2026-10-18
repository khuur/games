import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createPuzzle, restorePuzzle, toSnapshot, type FifteenState } from './gameState'
import { clampSize, DEFAULT_SIZE, generatePuzzle, puzzleTarget } from './fifteen'

const GAME_KEY = 'fifteen:game'
const SIZE_KEY = 'fifteen:size'
export const RECORDS_KEY = 'fifteen:records'

interface StoredGame {
  version: 1
  size: number
  start: number[]
  history: number[]
  future: number[]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isNumberList = (value: unknown): value is number[] => Array.isArray(value) && value.every(isInteger)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isInteger(game.size) &&
    isNumberList(game.start) &&
    isNumberList(game.history) &&
    isNumberList(game.future) &&
    isInteger(game.hintsUsed) &&
    isInteger(game.undosUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: FifteenState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const stored: StoredGame = { version: 1, ...toSnapshot(state), elapsedMs: Math.round(elapsedMs) }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: FifteenState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored = stored && restorePuzzle(stored)
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const size = clampSize(readStored(SIZE_KEY, DEFAULT_SIZE, isInteger))
  const start = generatePuzzle(size)
  return { state: createPuzzle(size, start, puzzleTarget(start, size)), elapsedMs: 0 }
}

export function savePreferredSize(size: number): void {
  writeStored(SIZE_KEY, size)
}
