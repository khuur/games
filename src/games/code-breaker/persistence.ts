import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { DEFAULT_LEVEL, isLevelId, LEVELS, randomCode, type LevelId } from './codeBreaker'
import { createGame, isOver, restoreGame, toSnapshot, type CodeBreakerState } from './gameState'

const GAME_KEY = 'code-breaker:game'
const LEVEL_KEY = 'code-breaker:level'
export const RECORDS_KEY = 'code-breaker:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** Codes as strings of colour digits; "-" marks an empty slot in the row. */
  secret: string
  guesses: string[]
  row: string
  hintsUsed: number
  solverUsed: boolean
  elapsedMs: number
}

const isCodeString = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    isCodeString(game.secret) &&
    Array.isArray(game.guesses) &&
    game.guesses.every(isCodeString) &&
    typeof game.row === 'string' &&
    /^[\d-]+$/.test(game.row) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const toDigits = (code: readonly (number | null)[]) => code.map((color) => (color === null ? '-' : String(color))).join('')
const fromDigits = (text: string) => [...text].map((digit) => (digit === '-' ? null : Number(digit)))

/** Keeps the current game across reloads; finished ones are dropped so a reload sets a new code. */
export function saveGame(state: CodeBreakerState, elapsedMs: number): void {
  if (isOver(state)) {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    levelId: snapshot.levelId,
    secret: toDigits(snapshot.secret),
    guesses: snapshot.guesses.map(toDigits),
    row: toDigits(snapshot.row),
    hintsUsed: snapshot.hintsUsed,
    solverUsed: snapshot.solverUsed,
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: CodeBreakerState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      levelId: stored.levelId,
      secret: [...stored.secret].map(Number),
      guesses: stored.guesses.map((code) => [...code].map(Number)),
      row: fromDigits(stored.row),
      hintsUsed: stored.hintsUsed,
      solverUsed: stored.solverUsed,
    })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  const levelId = readStored(LEVEL_KEY, DEFAULT_LEVEL, isLevelId)
  return { state: createGame(levelId, randomCode(LEVELS[levelId])), elapsedMs: 0 }
}

export function savePreferredLevel(levelId: LevelId): void {
  writeStored(LEVEL_KEY, levelId)
}
