import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type Change, type NonogramState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type CellState, type LevelId } from './nonogram'

const GAME_KEY = 'nonogram:game'
const LEVEL_KEY = 'nonogram:level'
export const FILL_MODE_KEY = 'nonogram:cross-mode'
export const RECORDS_KEY = 'nonogram:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** The picture as "0" and "1" characters in reading order. */
  solution: string
  /** Marks as "0" (unknown), "1" (filled) and "2" (crossed). */
  cells: string
  wrong: string
  /** Moves as lists of changes, each packed as cell × 9 + before × 3 + after. */
  history: number[][]
  future: number[][]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isMoveList = (value: unknown): value is number[][] =>
  Array.isArray(value) && value.every((move) => Array.isArray(move) && move.every((packed) => isInteger(packed) && packed >= 0))

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    typeof game.solution === 'string' &&
    /^[01]+$/.test(game.solution) &&
    typeof game.cells === 'string' &&
    /^[012]+$/.test(game.cells) &&
    typeof game.wrong === 'string' &&
    /^[01]+$/.test(game.wrong) &&
    isMoveList(game.history) &&
    isMoveList(game.future) &&
    isInteger(game.mistakes) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const pack = (move: Change[]) => move.map(({ cell, before, after }) => cell * 9 + before * 3 + after)
const unpack = (move: number[]): Change[] =>
  move.map((packed) => ({
    cell: Math.floor(packed / 9),
    before: (Math.floor(packed / 3) % 3) as CellState,
    after: (packed % 3) as CellState,
  }))
const bits = (cells: readonly boolean[]) => cells.map((on) => (on ? '1' : '0')).join('')

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: NonogramState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    solution: bits(snapshot.solution),
    cells: snapshot.cells.join(''),
    wrong: bits(snapshot.wrong),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: NonogramState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      ...stored,
      solution: [...stored.solution].map((bit) => bit === '1'),
      cells: [...stored.cells].map(Number) as CellState[],
      wrong: [...stored.wrong].map((bit) => bit === '1'),
      history: stored.history.map(unpack),
      future: stored.future.map(unpack),
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
