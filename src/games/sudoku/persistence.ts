import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, restoreGame, toSnapshot, type Move, type SudokuState } from './gameState'
import { DEFAULT_LEVEL, generatePuzzle, isLevelId, LEVELS, type LevelId } from './sudoku'

const GAME_KEY = 'sudoku:game'
const LEVEL_KEY = 'sudoku:level'
export const RECORDS_KEY = 'sudoku:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** 81 digits each, "0" for a blank. */
  givens: string
  solution: string
  /** Moves packed as cell × 20 + digit × 2 + (1 for a note). */
  history: number[]
  future: number[]
  mistakes: number
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isGridString = (value: unknown): value is string => typeof value === 'string' && /^\d{81}$/.test(value)
const isMoveList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((move) => isInteger(move) && move >= 0 && move < 81 * 20)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    isGridString(game.givens) &&
    isGridString(game.solution) &&
    isMoveList(game.history) &&
    isMoveList(game.future) &&
    isInteger(game.mistakes) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const pack = ({ cell, digit, note }: Move) => cell * 20 + digit * 2 + (note ? 1 : 0)
const unpack = (packed: number): Move => ({ cell: Math.floor(packed / 20), digit: Math.floor((packed % 20) / 2), note: packed % 2 === 1 })

/** Keeps the current puzzle across reloads, even before the first move; finished ones are dropped. */
export function saveGame(state: SudokuState, elapsedMs: number): void {
  if (state.status === 'won') {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    givens: snapshot.givens.join(''),
    solution: snapshot.solution.join(''),
    history: snapshot.history.map(pack),
    future: snapshot.future.map(pack),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: SudokuState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      ...stored,
      givens: [...stored.givens].map(Number),
      solution: [...stored.solution].map(Number),
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
