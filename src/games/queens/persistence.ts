import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type Change, type QueensState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type LevelId, type Mark } from './queens'

const GAME_KEY = 'queens:game'
const LEVEL_KEY = 'queens:level'
export const RECORDS_KEY = 'queens:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** One digit per cell: its region. */
  regions: string
  solution: number[]
  /** Marks as "0" (blank), "1" (cross) and "2" (queen). */
  marks: string
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
    typeof game.regions === 'string' &&
    /^\d+$/.test(game.regions) &&
    Array.isArray(game.solution) &&
    game.solution.every(isInteger) &&
    typeof game.marks === 'string' &&
    /^[012]+$/.test(game.marks) &&
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
    before: (Math.floor(packed / 3) % 3) as Mark,
    after: (packed % 3) as Mark,
  }))

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: QueensState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    regions: snapshot.regions.join(''),
    marks: snapshot.marks.join(''),
    wrong: snapshot.wrong.map((bad) => (bad ? '1' : '0')).join(''),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: QueensState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      ...stored,
      regions: [...stored.regions].map(Number),
      marks: [...stored.marks].map(Number) as Mark[],
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
