import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createPuzzle, restorePuzzle, toSnapshot, type WaterSortState } from './gameState'
import { clampColors, DEFAULT_COLORS, generatePuzzle, type Pour } from './waterSort'

const GAME_KEY = 'water-sort:game'
const COLORS_KEY = 'water-sort:colors'
export const RECORDS_KEY = 'water-sort:records'

interface StoredGame {
  version: 1
  colors: number
  start: number[][]
  minimum: number
  /** Pours as [from, to] pairs. */
  history: [number, number][]
  future: [number, number][]
  hintsUsed: number
  undosUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isPairList = (value: unknown): value is [number, number][] =>
  Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isInteger))

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isInteger(game.colors) &&
    Array.isArray(game.start) &&
    game.start.every((tube) => Array.isArray(tube) && tube.every(isInteger)) &&
    isInteger(game.minimum) &&
    isPairList(game.history) &&
    isPairList(game.future) &&
    isInteger(game.hintsUsed) &&
    isInteger(game.undosUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const toPairs = (moves: Pour[]) => moves.map(({ from, to }): [number, number] => [from, to])
const fromPairs = (pairs: [number, number][]) => pairs.map(([from, to]) => ({ from, to }))

/** Keeps the current puzzle across reloads, even before the first pour; finished ones are dropped. */
export function saveGame(state: WaterSortState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    start: snapshot.start.map((tube) => [...tube]),
    history: toPairs(snapshot.history),
    future: toPairs(snapshot.future),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: WaterSortState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored && restorePuzzle({ ...stored, history: fromPairs(stored.history), future: fromPairs(stored.future) })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const colors = clampColors(readStored(COLORS_KEY, DEFAULT_COLORS, isInteger))
  const { tubes, minimum } = generatePuzzle(colors)
  return { state: createPuzzle(colors, tubes, minimum), elapsedMs: 0 }
}

export function savePreferredColors(colors: number): void {
  writeStored(COLORS_KEY, colors)
}
