import { isInteger, readStored, removeStored, writeStored } from '../../lib/storage'
import { createGame, isOver, restoreGame, toSnapshot, type MinesState } from './gameState'
import { DEFAULT_LEVEL, isLevelId, type LevelId } from './minesweeper'

const GAME_KEY = 'minesweeper:game'
const LEVEL_KEY = 'minesweeper:level'
export const FLAG_MODE_KEY = 'minesweeper:flag-mode'
export const RECORDS_KEY = 'minesweeper:records'

interface StoredGame {
  version: 1
  levelId: LevelId
  /** Cells as strings of "0" and "1" in reading order; mines is empty before the first click. */
  mines: string
  start: number | null
  revealed: string
  flags: string
  clicks: number
  hintsUsed: number
  solverUsed: boolean
  takeBacks: number
  elapsedMs: number
}

const isBits = (value: unknown): value is string => typeof value === 'string' && /^[01]*$/.test(value)

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== 'object' || value === null) return false
  const game = value as Record<string, unknown>
  return (
    game.version === 1 &&
    isLevelId(game.levelId) &&
    isBits(game.mines) &&
    (game.start === null || isInteger(game.start)) &&
    isBits(game.revealed) &&
    isBits(game.flags) &&
    isInteger(game.clicks) &&
    isInteger(game.hintsUsed) &&
    typeof game.solverUsed === 'boolean' &&
    isInteger(game.takeBacks) &&
    typeof game.elapsedMs === 'number' &&
    Number.isFinite(game.elapsedMs)
  )
}

const toBits = (cells: readonly boolean[]) => cells.map((on) => (on ? '1' : '0')).join('')
const fromBits = (bits: string) => [...bits].map((bit) => bit === '1')

/** Keeps the board across reloads once it has been started; finished games are dropped. */
export function saveGame(state: MinesState, elapsedMs: number): void {
  if (isOver(state) || !state.mines) {
    removeStored(GAME_KEY)
    return
  }
  const snapshot = toSnapshot(state)
  const stored: StoredGame = {
    version: 1,
    ...snapshot,
    mines: state.mines ? toBits(state.mines) : '',
    revealed: toBits(snapshot.revealed),
    flags: toBits(snapshot.flags),
    elapsedMs: Math.round(elapsedMs),
  }
  writeStored(GAME_KEY, stored)
}

export function loadInitialGame(): { state: MinesState; elapsedMs: number } {
  const stored = readStored<StoredGame | null>(GAME_KEY, null, (value) => isStoredGame(value))
  const restored =
    stored &&
    restoreGame({
      ...stored,
      mines: stored.mines ? fromBits(stored.mines) : null,
      revealed: fromBits(stored.revealed),
      flags: fromBits(stored.flags),
    })
  if (stored && restored) {
    return { state: restored, elapsedMs: restored.status === 'ready' ? 0 : Math.max(0, stored.elapsedMs) }
  }
  return { state: createGame(readStored(LEVEL_KEY, DEFAULT_LEVEL, isLevelId)), elapsedMs: 0 }
}

export function savePreferredLevel(levelId: LevelId): void {
  writeStored(LEVEL_KEY, levelId)
}
